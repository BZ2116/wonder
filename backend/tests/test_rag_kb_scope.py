import os
import shutil
import tempfile

import pytest

from backend.rag.indexer import DocumentIndexer, build_collection_name
from backend.rag.retriever import RAGRetriever
from backend.core.storage import StorageManager


class FakeEmbedding:
    def embed(self, texts):
        return [[1.0, 0.0, 0.0] for _ in texts]


class FakeStorage:
    def __init__(self):
        self.added = None
        self.deleted = None
        self.deleted_collection_name = None

    def add_to_collection(self, ids, embeddings, metadatas, documents, collection_name=None):
        self.added = {
            "ids": ids,
            "embeddings": embeddings,
            "metadatas": metadatas,
            "documents": documents,
            "collection_name": collection_name,
        }

    def delete_from_collection(self, doc_id, knowledge_base_id=None, collection_name=None):
        self.deleted = (doc_id, knowledge_base_id)
        self.deleted_collection_name = collection_name

    def get_collection(self, collection_name="documents"):
        return None


def test_indexer_uses_ts_doc_id_and_kb_metadata():
    storage = FakeStorage()
    indexer = DocumentIndexer(storage, FakeEmbedding())

    doc_id = indexer.index_document(
        doc_id="doc-1",
        knowledge_base_id="kb-1",
        file_name="paper.pdf",
        file_path="data/uploads/paper.pdf",
        chunks=["chunk a", "chunk b"],
        summary="summary",
        analysis_result={"reading_card": "card"},
        tags=["rag", "agents"],
    )

    assert doc_id == "doc-1"
    assert storage.added["ids"] == [
        "doc-1_kb-1_profile",
        "doc-1_kb-1_summary",
        "doc-1_kb-1_chunk_0",
        "doc-1_kb-1_chunk_1",
    ]
    assert storage.added["metadatas"][0]["knowledge_base_id"] == "kb-1"
    assert storage.added["metadatas"][0]["chunk_type"] == "profile"
    assert storage.added["metadatas"][1]["chunk_type"] == "summary"
    assert storage.added["metadatas"][2]["chunk_type"] == "content"
    assert storage.added["metadatas"][2]["tags"] == "rag,agents"


def test_delete_document_can_scope_to_knowledge_base():
    storage = FakeStorage()
    indexer = DocumentIndexer(storage, FakeEmbedding())

    indexer.delete_document("doc-1", knowledge_base_id="kb-1")

    assert storage.deleted == ("doc-1", "kb-1")


class FakeQueryEmbedding:
    def embed_single(self, text):
        return [1.0, 0.0, 0.0]


class FakeQueryStorage:
    def __init__(self):
        self.where_filters = []

    def query_collection(self, query_embeddings, n_results, where=None, collection_name=None):
        self.where_filters.append(where)
        if where and where.get("chunk_type") == "summary":
            return {
                "documents": [["summary"]],
                "metadatas": [[{"doc_id": "doc-1", "file_name": "paper.pdf"}]],
                "distances": [[0.1]],
            }
        return {
            "documents": [["chunk"]],
            "metadatas": [[{"doc_id": "doc-1", "file_name": "paper.pdf"}]],
            "distances": [[0.1]],
        }


def test_retriever_filters_summary_and_content_by_kb():
    storage = FakeQueryStorage()
    retriever = RAGRetriever(storage, FakeQueryEmbedding())

    result = retriever.retrieve("question", knowledge_base_id="kb-1")

    assert result.source_doc_ids == ["doc-1"]
    assert storage.where_filters[0] == {
        "$and": [
            {"chunk_type": "summary"},
            {"knowledge_base_id": "kb-1"},
        ]
    }
    assert storage.where_filters[1] == {
        "$and": [
            {"chunk_type": "content"},
            {"knowledge_base_id": "kb-1"},
            {"doc_id": {"$in": ["doc-1"]}},
        ]
    }


# --- New tests for provider adapter alignment ---


class SpyEmbedding:
    """Fake embedding that records calls and returns deterministic vectors."""

    def __init__(self, vector=None):
        self.vector = vector or [0.1, 0.2, 0.3]
        self.calls = []

    def embed(self, texts):
        self.calls.append(texts)
        return [list(self.vector) for _ in texts]

    def embed_single(self, text):
        self.calls.append([text])
        return list(self.vector)


def test_indexer_calls_embedding_provider_with_expected_chunks():
    """Indexing must call the embedding provider with [profile, summary] + chunks."""
    spy = SpyEmbedding()
    storage = FakeStorage()
    indexer = DocumentIndexer(storage, spy)

    indexer.index_document(
        doc_id="doc-spy",
        knowledge_base_id="kb-spy",
        file_name="test.txt",
        file_path="/tmp/test.txt",
        chunks=["alpha", "beta", "gamma"],
        summary="the summary",
        analysis_result={"reading_card": "card"},
    )

    assert len(spy.calls) == 1
    # First text is the profile (includes title, file, analysis summary)
    assert spy.calls[0][0].startswith("Title: test.txt")
    assert spy.calls[0][1] == "the summary"
    assert spy.calls[0][2:] == ["alpha", "beta", "gamma"]


def test_indexer_stores_correct_vector_in_chroma():
    """Embedding output must be passed directly to ChromaDB storage."""
    spy = SpyEmbedding(vector=[0.5, 0.6, 0.7])
    storage = FakeStorage()
    indexer = DocumentIndexer(storage, spy)

    indexer.index_document(
        doc_id="doc-vec",
        knowledge_base_id="kb-vec",
        file_name="v.txt",
        file_path="/tmp/v.txt",
        chunks=["c1"],
        summary="s",
        analysis_result={},
    )

    # profile embedding + summary embedding + 1 chunk embedding
    assert storage.added["embeddings"] == [[0.5, 0.6, 0.7], [0.5, 0.6, 0.7], [0.5, 0.6, 0.7]]


@pytest.fixture
def real_chroma_storage():
    """Create a real StorageManager with a temp ChromaDB for integration tests."""
    tmpdir = tempfile.mkdtemp()
    chroma_path = os.path.join(tmpdir, "chroma")
    storage = StorageManager(chroma_path)
    yield storage
    storage.close()
    shutil.rmtree(tmpdir, onerror=lambda *args: None)


def _index_doc(storage, doc_id, kb_id, chunks, summary="summary"):
    """Helper: index a document with a fixed-vector embedding."""
    embedding = SpyEmbedding(vector=[1.0, 0.0, 0.0])
    indexer = DocumentIndexer(storage, embedding)
    indexer.index_document(
        doc_id=doc_id,
        knowledge_base_id=kb_id,
        file_name=f"{doc_id}.txt",
        file_path=f"/tmp/{doc_id}.txt",
        chunks=chunks,
        summary=summary,
        analysis_result={},
    )


def test_retrieval_respects_knowledge_base_id(real_chroma_storage):
    """Search with kb-a must not return chunks indexed under kb-b."""
    storage = real_chroma_storage
    _index_doc(storage, "doc-x", "kb-a", ["alpha content"], summary="alpha summary")
    _index_doc(storage, "doc-y", "kb-b", ["beta content"], summary="beta summary")

    class FixedEmbedding:
        def embed_single(self, text):
            return [1.0, 0.0, 0.0]

    retriever = RAGRetriever(storage, FixedEmbedding())

    result = retriever.retrieve("alpha", knowledge_base_id="kb-a")

    # Only doc-x should appear under kb-a
    assert "doc-x" in result.source_doc_ids
    assert "doc-y" not in result.source_doc_ids


def test_deletion_removes_vector_entries(real_chroma_storage):
    """Deleting doc-1 must remove all its vector chunks from ChromaDB."""
    storage = real_chroma_storage
    _index_doc(storage, "doc-del", "kb-del", ["chunk one", "chunk two"], summary="sum")

    # Verify vectors exist before deletion
    embedding = SpyEmbedding(vector=[1.0, 0.0, 0.0])
    retriever = RAGRetriever(storage, embedding)
    before = retriever.retrieve("chunk", knowledge_base_id="kb-del")
    assert "doc-del" in before.source_doc_ids

    # Delete
    indexer = DocumentIndexer(storage, embedding)
    indexer.delete_document("doc-del", knowledge_base_id="kb-del")

    # After deletion, querying should return empty results for that doc
    class FixedEmbedding:
        def embed_single(self, text):
            return [1.0, 0.0, 0.0]

    retriever2 = RAGRetriever(storage, FixedEmbedding())
    after = retriever2.retrieve("chunk", knowledge_base_id="kb-del")
    assert "doc-del" not in after.source_doc_ids


class FailingStorage(FakeStorage):
    def add_to_collection(self, ids, embeddings, metadatas, documents, collection_name=None):
        raise RuntimeError("chroma write failed")


def test_index_document_wraps_storage_failure_with_doc_context():
    indexer = DocumentIndexer(FailingStorage(), FakeEmbedding())

    with pytest.raises(RuntimeError) as exc:
        indexer.index_document(
            doc_id="doc-fail",
            knowledge_base_id="kb-fail",
            file_name="fail.txt",
            file_path="/tmp/fail.txt",
            chunks=["chunk"],
            summary="summary",
            analysis_result={},
        )

    message = str(exc.value)
    assert "doc-fail" in message
    assert "kb-fail" in message
    assert "chroma write failed" in message


def test_empty_query_returns_validation_error():
    """Empty query string must raise a clear error, not silently fail."""
    storage = FakeQueryStorage()
    retriever = RAGRetriever(storage, FakeQueryEmbedding())

    with pytest.raises(ValueError, match="query"):
        retriever.retrieve("")


def test_delete_document_requires_knowledge_base_id():
    storage = FakeStorage()
    indexer = DocumentIndexer(storage, FakeEmbedding())

    with pytest.raises(ValueError, match="knowledge_base_id"):
        indexer.delete_document("doc-1", knowledge_base_id="")

    assert storage.deleted is None


def test_delete_document_only_removes_target_kb_vectors(real_chroma_storage):
    storage = real_chroma_storage
    _index_doc(storage, "doc-shared", "kb-a", ["alpha content"], summary="alpha summary")
    _index_doc(storage, "doc-shared", "kb-b", ["beta content"], summary="beta summary")

    indexer = DocumentIndexer(storage, SpyEmbedding(vector=[1.0, 0.0, 0.0]))
    indexer.delete_document("doc-shared", knowledge_base_id="kb-a")

    retriever = RAGRetriever(storage, SpyEmbedding(vector=[1.0, 0.0, 0.0]))
    after_a = retriever.retrieve("alpha", knowledge_base_id="kb-a")
    after_b = retriever.retrieve("beta", knowledge_base_id="kb-b")

    assert "doc-shared" not in after_a.source_doc_ids
    assert "doc-shared" in after_b.source_doc_ids


# --- Task 4: Collection strategy and metadata ---


def test_build_collection_name_includes_provider_model_and_dimensions():
    assert build_collection_name("openai_compatible", "text-embedding-3-small", 1536) == (
        "documents__openai_compatible__text_embedding_3_small__1536"
    )


def test_build_collection_name_normalizes_special_chars():
    assert build_collection_name("Custom-Provider", "BAAI/bge-m3", 1024) == (
        "documents__custom_provider__baai_bge_m3__1024"
    )


def test_indexer_stores_index_id_and_chunk_id_in_metadata():
    """Metadata must include index_id and chunk_id fields."""
    storage = FakeStorage()
    indexer = DocumentIndexer(storage, FakeEmbedding())

    indexer.index_document(
        doc_id="doc-1",
        knowledge_base_id="kb-1",
        file_name="paper.pdf",
        file_path="/tmp/paper.pdf",
        chunks=["chunk a"],
        summary="summary",
        analysis_result={},
        index_id="idx-1",
        embedding_provider="openai_compatible",
        embedding_model="text-embedding-3-small",
        embedding_dimensions=1536,
    )

    metas = storage.added["metadatas"]
    # Profile entry
    assert metas[0]["chunk_type"] == "profile"
    assert metas[0]["index_id"] == "idx-1"
    assert metas[0]["chunk_id"].startswith("chunk-")
    assert metas[0]["embedding_model"] == "text-embedding-3-small"
    assert metas[0]["embedding_dimensions"] == 1536
    # Summary entry
    assert metas[1]["chunk_type"] == "summary"
    assert metas[1]["index_id"] == "idx-1"
    assert metas[1]["chunk_id"].startswith("chunk-")
    assert metas[1]["embedding_model"] == "text-embedding-3-small"
    assert metas[1]["embedding_dimensions"] == 1536
    # Chunk entry
    assert metas[2]["chunk_type"] == "content"
    assert metas[2]["index_id"] == "idx-1"
    assert metas[2]["chunk_id"].startswith("chunk-")
    assert metas[2]["embedding_model"] == "text-embedding-3-small"
    assert metas[2]["embedding_dimensions"] == 1536


def test_indexer_passes_collection_name_to_storage():
    """When collection_name is given, storage receives it."""
    storage = FakeStorage()
    indexer = DocumentIndexer(storage, FakeEmbedding())

    indexer.index_document(
        doc_id="doc-c",
        knowledge_base_id="kb-c",
        file_name="c.txt",
        file_path="/tmp/c.txt",
        chunks=["chunk"],
        summary="summary",
        analysis_result={},
        collection_name="documents__openai_compatible__text_embedding_3_small__1536",
    )

    assert storage.added["collection_name"] == "documents__openai_compatible__text_embedding_3_small__1536"


def test_delete_document_passes_collection_name_to_storage():
    storage = FakeStorage()
    indexer = DocumentIndexer(storage, FakeEmbedding())

    indexer.delete_document(
        "doc-1",
        knowledge_base_id="kb-1",
        collection_name="documents__openai_compatible__text_embedding_3_small__1536",
    )

    assert storage.deleted == ("doc-1", "kb-1")
    assert storage.deleted_collection_name == "documents__openai_compatible__text_embedding_3_small__1536"


def test_retriever_queries_multiple_collections():
    """Retriever should merge results from multiple collections."""
    class MultiCollectionStorage:
        def __init__(self):
            self.queried_collections = []

        def query_collection(self, query_embeddings, n_results, where=None, collection_name=None):
            self.queried_collections.append(collection_name)
            return {
                "documents": [["doc from " + (collection_name or "default")]],
                "metadatas": [[{"doc_id": "doc-1", "file_name": "f.txt"}]],
                "distances": [[0.1]],
            }

    storage = MultiCollectionStorage()
    retriever = RAGRetriever(storage, FakeQueryEmbedding())

    collections = [
        "documents__openai_compatible__text_embedding_3_small__1536",
        "documents__custom_openai_compatible__bge_m3__1024",
    ]
    result = retriever.retrieve(
        "question",
        collection_names=collections,
    )

    assert len(storage.queried_collections) == 4  # 2 summary + 2 content queries
    assert all(c in storage.queried_collections for c in collections)


def test_retriever_merges_multi_collection_results_by_distance():
    """Results from multiple collections must be sorted by distance and trimmed to top_k."""
    class DistanceVaryingStorage:
        def __init__(self):
            self.call_count = 0

        def query_collection(self, query_embeddings, n_results, where=None, collection_name=None):
            self.call_count += 1
            # Collection A has worse distances (0.8), Collection B has better (0.1)
            if "col_a" in (collection_name or ""):
                return {
                    "documents": [["summary_a"]],
                    "metadatas": [[{"doc_id": "doc-a", "file_name": "a.txt"}]],
                    "distances": [[0.8]],
                }
            else:
                return {
                    "documents": [["summary_b"]],
                    "metadatas": [[{"doc_id": "doc-b", "file_name": "b.txt"}]],
                    "distances": [[0.1]],
                }

    storage = DistanceVaryingStorage()
    retriever = RAGRetriever(storage, FakeQueryEmbedding())

    # Query with top_k_docs=1 — should pick doc-b (distance 0.1) over doc-a (0.8)
    result = retriever.retrieve(
        "question",
        collection_names=["col_a", "col_b"],
        top_k_docs=1,
        top_k_chunks=1,
    )

    assert "doc-b" in result.source_doc_ids
    assert "doc-a" not in result.source_doc_ids


# --- Task: source_refs and retrieval_confidence ---


class SourceRefStorage:
    """Fake storage that returns results with rich metadata for source_ref tests."""

    def __init__(self, summary_results=None, chunk_results=None):
        self._summary_results = summary_results or {
            "documents": [["summary of paper A"]],
            "metadatas": [[{
                "doc_id": "doc-1",
                "file_name": "paper_a.pdf",
                "chunk_id": "chunk-s1",
                "chunk_index": 0,
            }]],
            "distances": [[0.2]],
        }
        self._chunk_results = chunk_results or {
            "documents": [["detailed content about X"]],
            "metadatas": [[{
                "doc_id": "doc-1",
                "file_name": "paper_a.pdf",
                "chunk_id": "chunk-c1",
                "chunk_index": 3,
            }]],
            "distances": [[0.4]],
        }
        self.where_filters = []

    def query_collection(self, query_embeddings, n_results, where=None, collection_name=None):
        self.where_filters.append(where)
        if where and where.get("chunk_type") == "summary":
            return self._summary_results
        return self._chunk_results


class FixedEmbeddingForSourceRef:
    def embed_single(self, text):
        return [1.0, 0.0, 0.0]


def test_retriever_returns_source_refs_with_metadata_and_scores():
    storage = SourceRefStorage()
    retriever = RAGRetriever(storage, FixedEmbeddingForSourceRef())

    result = retriever.retrieve("question")

    assert len(result.source_refs) > 0
    # With hybrid flow, content (evidence) refs come first, summary refs appended after
    ref = result.source_refs[0]
    assert ref["doc_id"] == "doc-1"
    assert ref["file_name"] == "paper_a.pdf"
    assert ref["chunk_type"] == "content"
    assert ref["content"] == "detailed content about X"
    assert ref["score"] is not None
    # Summary ref should be present and appended after content refs
    summary_refs = [r for r in result.source_refs if r["chunk_type"] == "summary"]
    assert len(summary_refs) >= 1
    assert summary_refs[0]["content"] == "summary of paper A"


def test_retriever_source_refs_include_chunk_metadata():
    storage = SourceRefStorage()
    retriever = RAGRetriever(storage, FixedEmbeddingForSourceRef())

    result = retriever.retrieve("question")

    # Should have both summary and content refs
    summary_refs = [r for r in result.source_refs if r["chunk_type"] == "summary"]
    content_refs = [r for r in result.source_refs if r["chunk_type"] == "content"]

    assert len(summary_refs) >= 1
    assert len(content_refs) >= 1

    assert summary_refs[0]["chunk_id"] == "chunk-s1"
    assert summary_refs[0]["chunk_index"] == 0
    assert content_refs[0]["chunk_id"] == "chunk-c1"
    assert content_refs[0]["chunk_index"] == 3


def test_retriever_computes_retrieval_confidence():
    """retrieval_confidence should be the average score of top-k summary results."""
    storage = SourceRefStorage(
        summary_results={
            "documents": [["summary 1", "summary 2"]],
            "metadatas": [[
                {"doc_id": "doc-1", "file_name": "a.pdf"},
                {"doc_id": "doc-2", "file_name": "b.pdf"},
            ]],
            "distances": [[0.2, 0.6]],
        },
        chunk_results={
            "documents": [["chunk"]],
            "metadatas": [[{"doc_id": "doc-1", "file_name": "a.pdf"}]],
            "distances": [[0.3]],
        },
    )
    retriever = RAGRetriever(storage, FixedEmbeddingForSourceRef())

    result = retriever.retrieve("question")

    # score = 1 - distance/2
    # score_1 = 1 - 0.2/2 = 0.9, score_2 = 1 - 0.6/2 = 0.7
    # average = (0.9 + 0.7) / 2 = 0.8
    assert result.retrieval_confidence == pytest.approx(0.8)


def test_retriever_retrieval_confidence_zero_when_no_summaries():
    """When both summaries and content are empty, confidence is 0.0."""
    storage = SourceRefStorage(
        summary_results={"documents": [[]], "metadatas": [[]], "distances": [[]]},
        chunk_results={
            "documents": [[]],
            "metadatas": [[]],
            "distances": [[]],
        },
    )
    retriever = RAGRetriever(storage, FixedEmbeddingForSourceRef())

    result = retriever.retrieve("question")
    assert result.retrieval_confidence == 0.0


def test_retriever_retrieval_confidence_fallback_to_candidate_scores():
    """When summaries are absent but content candidates exist, use candidate averaging fallback."""
    class CandidateAveragingStorage:
        """Storage that returns empty summaries but valid content candidates."""

        def __init__(self):
            self.where_filters = []

        def query_collection(self, query_embeddings, n_results, where=None, collection_name=None):
            self.where_filters.append(where)
            if where and where.get("chunk_type") == "summary":
                return {"documents": [[]], "metadatas": [[]], "distances": [[]]}
            # Return non-reference content chunks that will become ranked_candidates
            # Format: documents[0] = list of all docs, distances[0] = list of all distances
            return {
                "documents": [["content chunk alpha", "content chunk beta"]],
                "metadatas": [[
                    {"doc_id": "doc-1", "file_name": "a.pdf", "chunk_type": "content"},
                    {"doc_id": "doc-1", "file_name": "a.pdf", "chunk_type": "content"},
                ]],
                "distances": [[0.2, 0.6]],
            }

    storage = CandidateAveragingStorage()
    retriever = RAGRetriever(storage, FixedEmbeddingForSourceRef())

    # Must provide knowledge_base_id to trigger content query path when summaries are empty
    result = retriever.retrieve("question", knowledge_base_id="kb-1")

    # dense_score = 1 - distance/2
    # chunk alpha: 1 - 0.2/2 = 0.9 -> final = 0.55*0.9 = 0.495
    # chunk beta: 1 - 0.6/2 = 0.7 -> final = 0.55*0.7 = 0.385
    # average = (0.495 + 0.385) / 2 = 0.44
    assert result.retrieval_confidence == pytest.approx(0.44, rel=0.01)
    assert result.retrieval_confidence > 0


def test_strict_doc_ids_scope_filters_correctly():
    """When doc_ids are passed, they should filter both summary and content queries."""
    storage = SourceRefStorage()
    retriever = RAGRetriever(storage, FixedEmbeddingForSourceRef())

    retriever.retrieve("question", doc_ids=["doc-1", "doc-2"])

    # Summary filter should include doc_id $in filter
    summary_where = storage.where_filters[0]
    assert {"doc_id": {"$in": ["doc-1", "doc-2"]}} in summary_where["$and"]


class EmptySummaryStorage:
    """Fake storage that returns no summary results but has content matches."""

    def __init__(self):
        self.where_filters = []
        self.content_calls = 0

    def query_collection(self, query_embeddings, n_results, where=None, collection_name=None):
        self.where_filters.append(where)
        if where and where.get("chunk_type") == "summary":
            return {"documents": [[]], "metadatas": [[]], "distances": [[]]}
        self.content_calls += 1
        return {
            "documents": [["actual content chunk about the topic"]],
            "metadatas": [[{"doc_id": "doc-strict", "file_name": "paper.pdf", "chunk_type": "content"}]],
            "distances": [[0.3]],
        }


def test_strict_doc_ids_fallback_queries_content_when_summary_misses():
    """When doc_ids provided but summary returns nothing, content chunks are still retrieved."""
    storage = EmptySummaryStorage()
    retriever = RAGRetriever(storage, FixedEmbeddingForSourceRef())

    # Provide doc_ids (strict scope) but summary returns empty
    result = retriever.retrieve(
        "question",
        doc_ids=["doc-strict"],
        top_k_docs=3,
        top_k_chunks=5,
    )

    # Should have retrieved content chunks via the fallback path
    assert storage.content_calls > 0
    assert len(result.chunks) > 0
    assert result.chunks[0] == "actual content chunk about the topic"
    # Content chunks should be in source_refs
    content_refs = [r for r in result.source_refs if r["chunk_type"] == "content"]
    assert len(content_refs) > 0


def test_retriever_direct_content_recall_without_summary_match():
    class DirectContentStorage:
        def __init__(self):
            self.calls = []

        def query_collection(self, query_embeddings, n_results, where=None, collection_name=None):
            self.calls.append(where)
            if where and where.get("$and") and {"chunk_type": "summary"} in where["$and"]:
                return {"documents": [[]], "metadatas": [[]], "distances": [[]]}
            return {
                "documents": [["Title: RAG Paper\nSection: 2 Method\nPages: 2\n\nHybrid retrieval method."]],
                "metadatas": [[{
                    "doc_id": "doc-1",
                    "file_name": "paper.pdf",
                    "paper_title": "RAG Paper",
                    "chunk_id": "paper-c1",
                    "chunk_index": 0,
                    "chunk_type": "content",
                    "section_type": "method",
                    "section_title": "2 Method",
                    "page_start": 2,
                    "page_end": 2,
                    "is_reference": False,
                }]],
                "distances": [[0.2]],
            }

    retriever = RAGRetriever(DirectContentStorage(), FixedEmbeddingForSourceRef())
    result = retriever.retrieve("这个方法怎么设计？", knowledge_base_id="kb-1", top_k_chunks=3)

    assert result.chunks
    assert result.source_refs[0]["chunk_id"] == "paper-c1"
    assert result.source_refs[0]["section_type"] == "method"
    assert "[S1]" in result.context


def test_retriever_excludes_reference_chunks_from_evidence_pack():
    """Reference chunks must not appear in the evidence pack with [SN] markers."""
    class ReferenceChunkStorage:
        def __init__(self):
            self.where_filters = []

        def query_collection(self, query_embeddings, n_results, where=None, collection_name=None):
            self.where_filters.append(where)
            if where and where.get("chunk_type") == "summary":
                return {"documents": [[]], "metadatas": [[]], "distances": [[]]}
            # Return both a regular content chunk and a reference chunk
            # Format: documents[0] = list of all docs, distances[0] = list of all distances
            return {
                "documents": [["regular content about the method", "[1] Smith et al. - A referenced paper"]],
                "metadatas": [[
                    {
                        "doc_id": "doc-1",
                        "file_name": "paper.pdf",
                        "chunk_id": "chunk-1",
                        "chunk_type": "content",
                        "section_type": "method",
                        "is_reference": False,
                    },
                    {
                        "doc_id": "doc-1",
                        "file_name": "paper.pdf",
                        "chunk_id": "ref-1",
                        "chunk_type": "content",
                        "section_type": "references",
                        "is_reference": True,
                    },
                ]],
                "distances": [[0.2, 0.1]],
            }

    storage = ReferenceChunkStorage()
    retriever = RAGRetriever(storage, FixedEmbeddingForSourceRef())

    # Must provide knowledge_base_id to trigger content query path when summaries are empty
    result = retriever.retrieve("What does the paper prove?", knowledge_base_id="kb-1")

    # Regular content chunk should appear in source_refs (filtered by is_reference in _result_to_candidates)
    content_refs = [r for r in result.source_refs if r["chunk_type"] == "content"]
    assert len(content_refs) > 0, "Regular content chunk should be in source_refs"

    # Evidence pack should contain [S1] marker for regular content
    assert "[S1]" in result.context

    # Evidence pack should NOT contain reference content (filtered by _result_to_candidates)
    assert "[1] Smith et al" not in result.context


def test_retriever_source_refs_include_structured_paper_metadata():
    class QueryStorage:
        """Storage that returns configurable results for structured metadata tests."""
        def __init__(self, summary_results=None, chunk_results=None):
            self._summary_results = summary_results or {
                "documents": [[]], "metadatas": [[]], "distances": [[]]
            }
            self._chunk_results = chunk_results or {
                "documents": [[]], "metadatas": [[]], "distances": [[]]
            }
            self.where_filters = []

        def query_collection(self, query_embeddings, n_results, where=None, collection_name=None):
            self.where_filters.append(where)
            if where and where.get("chunk_type") == "summary":
                return self._summary_results
            return self._chunk_results

    storage = QueryStorage(
        summary_results={"documents": [[]], "metadatas": [[]], "distances": [[]]},
        chunk_results={
            "documents": [["Title: Paper\nSection: 2 Method\nPages: 2-3\n\nmethod text"]],
            "metadatas": [[{
                "doc_id": "doc-1",
                "file_name": "paper.pdf",
                "paper_title": "Paper",
                "chunk_id": "chunk-method-1",
                "chunk_index": 0,
                "chunk_type": "content",
                "section_type": "method",
                "section_title": "2 Method",
                "page_start": 2,
                "page_end": 3,
                "labels": "Eq. (8),Figure 4",
                "parser": "mineru_precision",
            }]],
            "distances": [[0.2]],
        },
    )
    retriever = RAGRetriever(storage, FakeQueryEmbedding())

    result = retriever.retrieve("方法是什么？", knowledge_base_id="kb-1", top_k_chunks=1)

    ref = next(ref for ref in result.source_refs if ref["chunk_type"] == "content")
    assert ref["paper_title"] == "Paper"
    assert ref["section_title"] == "2 Method"
    assert ref["page_start"] == 2
    assert ref["page_end"] == 3
    assert ref["labels"] == ["Eq. (8)", "Figure 4"]
    assert ref["parser"] == "mineru_precision"
