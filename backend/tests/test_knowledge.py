import pytest
from backend.core.embedding import EmbeddingClient
from backend.rag.indexer import DocumentIndexer


@pytest.fixture
def mock_embedding():
    class MockEmbeddingClient(EmbeddingClient):
        def __init__(self):
            self.dimensions = 1536
        def embed(self, texts):
            return [[0.1] * 1536 for _ in texts]
        def embed_single(self, text):
            return [0.1] * 1536

    return MockEmbeddingClient()


def test_document_indexing_accepts_paper_chunks_with_metadata(mock_embedding):
    from backend.tests.test_rag_kb_scope import FakeStorage
    from backend.rag.paper_types import PaperChunk

    storage = FakeStorage()
    indexer = DocumentIndexer(storage, mock_embedding)
    paper_chunk = PaperChunk(
        chunk_id="paper-c1",
        text="The method uses hybrid retrieval.",
        chunk_index=0,
        section_type="method",
        section_title="2 Method",
        page_start=2,
        page_end=3,
        prev_chunk_id="",
        next_chunk_id="paper-c2",
        block_types=["paragraph"],
    )

    indexer.index_document(
        doc_id="doc-paper",
        knowledge_base_id="kb-1",
        file_name="paper.pdf",
        file_path="/tmp/paper.pdf",
        chunks=[],
        paper_chunks=[paper_chunk],
        summary="summary",
        analysis_result={},
        paper_title="RAG Paper",
    )

    meta = storage.added["metadatas"][2]
    expected = "Title: RAG Paper\nSection: 2 Method\nPages: 2-3\n\n"
    assert storage.added["documents"][2].startswith(expected)
    assert meta["chunk_type"] == "content"
    assert meta["chunk_id"] == "paper-c1"
    assert meta["section_type"] == "method"
    assert meta["section_title"] == "2 Method"
    assert meta["page_start"] == 2
    assert meta["page_end"] == 3
    assert meta["is_reference"] is False
    assert meta["next_chunk_id"] == "paper-c2"


def test_document_indexing_writes_labels_and_parser_to_chroma_metadata(mock_embedding):
    from backend.tests.test_rag_kb_scope import FakeStorage
    from backend.rag.paper_types import PaperChunk

    storage = FakeStorage()
    indexer = DocumentIndexer(storage, mock_embedding)
    paper_chunk = PaperChunk(
        chunk_id="paper-c1",
        text="Equation body.",
        chunk_index=0,
        chunk_type="formula",
        section_type="method",
        section_title="2 Method",
        page_start=2,
        page_end=2,
        labels=["Eq. (8)"],
        parser="mineru_precision",
        parser_version="vlm",
        block_types=["formula"],
    )

    indexer.index_document(
        doc_id="doc-paper",
        knowledge_base_id="kb-1",
        file_name="paper.pdf",
        file_path="/tmp/paper.pdf",
        chunks=[],
        paper_chunks=[paper_chunk],
        summary="summary",
        analysis_result={},
        paper_title="RAG Paper",
    )

    meta = storage.added["metadatas"][2]
    assert meta["chunk_type"] == "formula"
    assert meta["labels"] == "Eq. (8)"
    assert meta["parser"] == "mineru_precision"
    assert meta["parser_version"] == "vlm"