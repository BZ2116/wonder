import os
import shutil
import tempfile

import pytest

from backend.rag.indexer import DocumentIndexer
from backend.rag.retriever import RAGRetriever
from backend.core.storage import StorageManager


class FakeEmbedding:
    def embed(self, texts):
        return [[1.0, 0.0, 0.0] for _ in texts]


class FakeStorage:
    def __init__(self):
        self.added = None
        self.inserted = None
        self.deleted = None

    def add_to_collection(self, ids, embeddings, metadatas, documents):
        self.added = {
            "ids": ids,
            "embeddings": embeddings,
            "metadatas": metadatas,
            "documents": documents,
        }

    def insert_document(self, **kwargs):
        self.inserted = kwargs

    def delete_from_collection(self, doc_id, knowledge_base_id=None):
        self.deleted = (doc_id, knowledge_base_id)

    def delete_document(self, doc_id):
        pass


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
        "doc-1_kb-1_summary",
        "doc-1_kb-1_chunk_0",
        "doc-1_kb-1_chunk_1",
    ]
    assert storage.added["metadatas"][0]["knowledge_base_id"] == "kb-1"
    assert storage.added["metadatas"][0]["chunk_type"] == "summary"
    assert storage.added["metadatas"][1]["chunk_type"] == "content"
    assert storage.added["metadatas"][1]["tags"] == "rag,agents"


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

    def query_collection(self, query_embeddings, n_results, where=None):
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
    """Indexing must call the embedding provider with [summary] + chunks."""
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
    assert spy.calls[0] == ["the summary", "alpha", "beta", "gamma"]


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

    # summary embedding + 1 chunk embedding
    assert storage.added["embeddings"] == [[0.5, 0.6, 0.7], [0.5, 0.6, 0.7]]


@pytest.fixture
def real_chroma_storage():
    """Create a real StorageManager with a temp ChromaDB for integration tests."""
    tmpdir = tempfile.mkdtemp()
    chroma_path = os.path.join(tmpdir, "chroma")
    sqlite_path = os.path.join(tmpdir, "test.db")
    storage = StorageManager(chroma_path, sqlite_path)
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


def test_empty_query_returns_validation_error():
    """Empty query string must raise a clear error, not silently fail."""
    storage = FakeQueryStorage()
    retriever = RAGRetriever(storage, FakeQueryEmbedding())

    with pytest.raises(ValueError, match="query"):
        retriever.retrieve("")
