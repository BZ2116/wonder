"""Tests for research card indexer, retriever, and orchestrator card integration."""
import pytest

from backend.rag.research_card_indexer import build_research_card_embedding_text, ResearchCardIndexer
from backend.rag.research_card_retriever import ResearchCardRetriever
from backend.agents.orchestrator import Orchestrator


# --- Fake helpers (aligned with test_rag_kb_scope.py patterns) ---


class FakeEmbedding:
    def embed(self, texts):
        return [[1.0, 0.0, 0.0] for _ in texts]

    def embed_single(self, text):
        return [1.0, 0.0, 0.0]


class FakeStorage:
    def __init__(self):
        self.added = None
        self.deleted = None
        self.deleted_where = None

    def add_to_collection(self, ids, embeddings, metadatas, documents, collection_name=None):
        self.added = {
            "ids": ids,
            "embeddings": embeddings,
            "metadatas": metadatas,
            "documents": documents,
            "collection_name": collection_name,
        }

    def query_collection(self, query_embeddings, n_results, where=None, collection_name=None):
        return {"documents": [[]], "metadatas": [[]], "distances": [[]]}

    def delete_where(self, where, collection_name=None):
        self.deleted_where = where
        self.deleted_collection_name = collection_name

    def get_collection(self, collection_name="documents"):
        return None


# --- build_research_card_embedding_text tests ---


def test_build_research_card_embedding_text_contains_all_fields():
    text = build_research_card_embedding_text(
        question="q", core_claims=["claim"], knowledge_type="method",
        tags=["rag"], sub_direction="retrieval", use_cases=["review"],
        linked_doc_ids=["doc-1"], validation_notes="verify",
    )
    assert "Question: q" in text
    assert "Core claims: claim" in text
    assert "Linked papers: doc-1" in text
    assert "Knowledge type: method" in text
    assert "Tags: rag" in text
    assert "Sub-direction: retrieval" in text
    assert "Use cases: review" in text
    assert "Validation notes: verify" in text


def test_build_research_card_embedding_text_multiple_claims():
    text = build_research_card_embedding_text(
        question="q", core_claims=["claim1", "claim2", "claim3"],
        knowledge_type="finding", tags=["nlp", "llm"],
        sub_direction="", use_cases=[], linked_doc_ids=[],
        validation_notes="",
    )
    assert "Core claims: claim1; claim2; claim3" in text
    assert "Tags: nlp, llm" in text


# --- ResearchCardIndexer tests ---


def test_card_embedding_indexer_writes_item_type_metadata():
    storage = FakeStorage()
    embedding = FakeEmbedding()
    indexer = ResearchCardIndexer(storage, embedding)

    indexer.index_card(
        card_id="card-1",
        knowledge_base_id="kb-1",
        question="How to do X?",
        core_claims=["claim A"],
        knowledge_type="method",
        tags=["rag"],
        sub_direction="retrieval",
        use_cases=["review"],
        linked_doc_ids=["doc-1"],
        validation_notes="verified",
        collection_name=None,
    )

    assert storage.added is not None
    meta = storage.added["metadatas"][0]
    assert meta["item_type"] == "research_card"
    assert meta["card_id"] == "card-1"
    assert meta["knowledge_base_id"] == "kb-1"
    assert meta["linked_doc_ids"] == "doc-1"
    assert meta["knowledge_type"] == "method"
    assert meta["tags"] == "rag"
    assert meta["sub_direction"] == "retrieval"


def test_card_indexer_passes_collection_name_to_storage():
    storage = FakeStorage()
    indexer = ResearchCardIndexer(storage, FakeEmbedding())

    indexer.index_card(
        card_id="card-c",
        knowledge_base_id="kb-c",
        question="q",
        core_claims=["c"],
        knowledge_type="theory",
        tags=[],
        sub_direction="",
        use_cases=[],
        linked_doc_ids=[],
        validation_notes="",
        collection_name="documents__openai__model__1536",
    )

    assert storage.added["collection_name"] == "documents__openai__model__1536"


def test_card_indexer_id_format():
    storage = FakeStorage()
    indexer = ResearchCardIndexer(storage, FakeEmbedding())

    indexer.index_card(
        card_id="card-42",
        knowledge_base_id="kb-1",
        question="q",
        core_claims=["c"],
        knowledge_type="other",
        tags=[],
        sub_direction="",
        use_cases=[],
        linked_doc_ids=[],
        validation_notes="",
        collection_name=None,
    )

    assert storage.added["ids"] == ["research_card_card-42"]


def test_card_indexer_returns_card_id():
    storage = FakeStorage()
    indexer = ResearchCardIndexer(storage, FakeEmbedding())

    result = indexer.index_card(
        card_id="card-99",
        knowledge_base_id="kb-1",
        question="q",
        core_claims=["c"],
        knowledge_type="other",
        tags=[],
        sub_direction="",
        use_cases=[],
        linked_doc_ids=[],
        validation_notes="",
        collection_name=None,
    )

    assert result == "card-99"


# --- ResearchCardRetriever tests ---


class CardQueryStorage:
    """Fake storage that returns card results for testing the retriever."""

    def __init__(self, cards=None):
        self._cards = cards or []
        self.where_filters = []

    def query_collection(self, query_embeddings, n_results, where=None, collection_name=None):
        self.where_filters.append(where)
        if not self._cards:
            return {"documents": [[]], "metadatas": [[]], "distances": [[]]}
        docs = [c["doc"] for c in self._cards]
        metas = [c["meta"] for c in self._cards]
        dists = [c.get("distance", 0.3) for c in self._cards]
        return {
            "documents": [docs],
            "metadatas": [metas],
            "distances": [dists],
        }


def test_card_retriever_returns_card_refs():
    storage = CardQueryStorage(cards=[
        {
            "doc": "Question: How to do X?\nCore claims: Y",
            "meta": {
                "card_id": "card-1",
                "knowledge_base_id": "kb-1",
                "linked_doc_ids": "doc-1",
                "knowledge_type": "method",
                "tags": "rag",
                "sub_direction": "retrieval",
            },
            "distance": 0.2,
        },
    ])
    retriever = ResearchCardRetriever(storage, FakeEmbedding())

    results = retriever.retrieve(
        query="How to do X?",
        knowledge_base_id="kb-1",
        doc_ids=None,
        top_k=5,
    )

    assert len(results) == 1
    assert results[0]["item_type"] == "research_card"
    assert results[0]["card_id"] == "card-1"
    assert results[0]["chunk_type"] == "card"
    assert results[0]["score"] == pytest.approx(1 - 0.2 / 2)


def test_card_retriever_filters_by_mentioned_doc_ids():
    """Card retriever should only return cards whose linked_doc_ids contain a mentioned doc."""
    storage = CardQueryStorage(cards=[
        {
            "doc": "Card about doc-1",
            "meta": {
                "card_id": "card-linked",
                "knowledge_base_id": "kb-1",
                "linked_doc_ids": "doc-1,doc-3",
                "knowledge_type": "method",
                "tags": "",
                "sub_direction": "",
            },
            "distance": 0.1,
        },
        {
            "doc": "Card about doc-2",
            "meta": {
                "card_id": "card-unlinked",
                "knowledge_base_id": "kb-1",
                "linked_doc_ids": "doc-2",
                "knowledge_type": "theory",
                "tags": "",
                "sub_direction": "",
            },
            "distance": 0.2,
        },
    ])
    retriever = ResearchCardRetriever(storage, FakeEmbedding())

    results = retriever.retrieve(
        query="query",
        knowledge_base_id="kb-1",
        doc_ids=["doc-1"],
        top_k=5,
    )

    assert len(results) == 1
    assert results[0]["card_id"] == "card-linked"


def test_card_retriever_applies_kb_filter():
    storage = CardQueryStorage()
    retriever = ResearchCardRetriever(storage, FakeEmbedding())

    retriever.retrieve(
        query="q",
        knowledge_base_id="kb-test",
        doc_ids=None,
        top_k=5,
    )

    where = storage.where_filters[0]
    assert where["$and"][0] == {"item_type": "research_card"}
    assert where["$and"][1] == {"knowledge_base_id": "kb-test"}


def test_card_retriever_no_kb_filter():
    storage = CardQueryStorage()
    retriever = ResearchCardRetriever(storage, FakeEmbedding())

    retriever.retrieve(
        query="q",
        knowledge_base_id=None,
        doc_ids=None,
        top_k=5,
    )

    where = storage.where_filters[0]
    assert where == {"item_type": "research_card"}


def test_card_retriever_sorted_by_score():
    storage = CardQueryStorage(cards=[
        {
            "doc": "Card A",
            "meta": {
                "card_id": "card-a", "knowledge_base_id": "kb-1",
                "linked_doc_ids": "", "knowledge_type": "", "tags": "", "sub_direction": "",
            },
            "distance": 0.8,
        },
        {
            "doc": "Card B",
            "meta": {
                "card_id": "card-b", "knowledge_base_id": "kb-1",
                "linked_doc_ids": "", "knowledge_type": "", "tags": "", "sub_direction": "",
            },
            "distance": 0.1,
        },
    ])
    retriever = ResearchCardRetriever(storage, FakeEmbedding())

    results = retriever.retrieve(
        query="q", knowledge_base_id=None, doc_ids=None, top_k=5,
    )

    # Card B (distance 0.1, score 0.95) should come first
    assert results[0]["card_id"] == "card-b"
    assert results[1]["card_id"] == "card-a"


# --- Orchestrator card integration tests ---


class DummyAgent:
    def run(self, **kwargs):
        return "dummy answer"


class FakingRetriever:
    """Fake RAGRetriever that returns a fixed RetrievalResult."""
    def __init__(self, source_refs=None):
        from backend.rag.retriever import RetrievalResult
        self._result = RetrievalResult(
            summaries=["sum"],
            chunks=["chunk"],
            context="[doc summary] paper.pdf:\nsum",
            source_doc_ids=["doc-1"],
            source_refs=source_refs or [{
                "doc_id": "doc-1",
                "file_name": "paper.pdf",
                "chunk_id": None,
                "chunk_index": None,
                "chunk_type": "content",
                "section_type": "method",
                "content": "sum",
                "score": 0.9,
            }],
            retrieval_confidence=0.9,
        )

    def retrieve(self, **kwargs):
        return self._result


class FakingCardRetriever:
    """Fake ResearchCardRetriever."""
    def __init__(self, refs):
        self._refs = refs

    def retrieve(self, **kwargs):
        return self._refs


def test_orchestrator_includes_card_refs_before_paper_refs():
    """Card refs should be prepended to source_refs in orchestrator output."""
    card_ref = {
        "item_type": "research_card",
        "card_id": "card-1",
        "doc_id": "doc-1",
        "file_name": "Research card",
        "chunk_id": None,
        "chunk_index": None,
        "chunk_type": "card",
        "content": "Card content here",
        "score": 0.95,
        "linked_doc_ids": ["doc-1"],
        "knowledge_type": "method",
        "tags": "rag",
    }
    paper_ref = {
        "doc_id": "doc-1",
        "file_name": "paper.pdf",
        "chunk_id": None,
        "chunk_index": None,
        "chunk_type": "content",
        "section_type": "method",
        "content": "Paper summary",
        "score": 0.9,
    }

    orchestrator = Orchestrator(
        agents={"qa": DummyAgent()},
        retriever=FakingRetriever(source_refs=[paper_ref]),
        card_retriever=FakingCardRetriever([card_ref]),
    )

    result = orchestrator.route_task(
        task_type="ask_question",
        question="What is X?",
        knowledge_base_id="kb-1",
    )

    assert len(result["source_refs"]) == 2
    # Card ref should come first
    assert result["source_refs"][0]["chunk_type"] == "card"
    assert result["source_refs"][0]["card_id"] == "card-1"
    assert result["source_refs"][1]["chunk_type"] == "content"


def test_orchestrator_excludes_low_score_card_refs():
    """Card refs with score < 0.25 should be filtered out."""
    low_score_card = {
        "item_type": "research_card",
        "card_id": "card-low",
        "doc_id": "",
        "file_name": "Research card",
        "chunk_id": None,
        "chunk_index": None,
        "chunk_type": "card",
        "content": "Low relevance card",
        "score": 0.1,
        "linked_doc_ids": [],
        "knowledge_type": "",
        "tags": "",
    }

    orchestrator = Orchestrator(
        agents={"qa": DummyAgent()},
        retriever=FakingRetriever(),
        card_retriever=FakingCardRetriever([low_score_card]),
    )

    result = orchestrator.route_task(
        task_type="ask_question",
        question="What is X?",
    )

    # Only the paper ref should remain
    assert all(ref.get("chunk_type") != "card" for ref in result["source_refs"])


def test_orchestrator_works_without_card_retriever():
    """Orchestrator should work normally when no card_retriever is set."""
    orchestrator = Orchestrator(
        agents={"qa": DummyAgent()},
        retriever=FakingRetriever(),
        card_retriever=None,
    )

    result = orchestrator.route_task(
        task_type="ask_question",
        question="What is X?",
    )

    assert result["answer"] == "dummy answer"
    assert len(result["source_refs"]) > 0


def test_qa_source_refs_include_research_card_refs_before_paper_refs():
    """QA source_refs should include card refs (item_type=research_card) before paper refs."""
    card_ref = {
        "item_type": "research_card",
        "card_id": "card-1",
        "doc_id": "doc-1",
        "file_name": "Research card",
        "chunk_id": None,
        "chunk_index": None,
        "chunk_type": "card",
        "content": "Important method insight",
        "score": 0.95,
        "linked_doc_ids": ["doc-1"],
        "knowledge_type": "method",
        "tags": "rag",
    }
    paper_ref = {
        "doc_id": "doc-1",
        "file_name": "paper.pdf",
        "chunk_id": "c1",
        "chunk_index": 0,
        "chunk_type": "content",
        "content": "Paper passage about method",
        "score": 0.85,
    }

    orchestrator = Orchestrator(
        agents={"qa": DummyAgent()},
        retriever=FakingRetriever(source_refs=[paper_ref]),
        card_retriever=FakingCardRetriever([card_ref]),
    )

    result = orchestrator.route_task(
        task_type="ask_question",
        question="What method does this paper use?",
        knowledge_base_id="kb-1",
    )

    refs = result["source_refs"]
    assert len(refs) == 2
    # Card ref first
    assert refs[0]["item_type"] == "research_card"
    assert refs[0]["card_id"] == "card-1"
    assert refs[0]["chunk_type"] == "card"
    assert refs[0]["score"] == 0.95
    # Paper ref second
    assert refs[1]["chunk_type"] == "content"
    assert refs[1]["file_name"] == "paper.pdf"
    assert refs[1]["score"] == 0.85


class EmptyRetriever:
    """Fake retriever returning no source refs (README-only scenario)."""
    def retrieve(self, **kwargs):
        from backend.rag.retriever import RetrievalResult
        return RetrievalResult(
            summaries=[],
            chunks=[],
            context="",
            source_doc_ids=[],
            source_refs=[],
            retrieval_confidence=0.0,
        )


class CapturingAgent:
    """Agent that captures the evidence_status passed to it."""
    def __init__(self):
        self.last_evidence_status = None

    def run(self, **kwargs):
        self.last_evidence_status = kwargs.get("evidence_status")
        return "answer"


class FakeRAGRetriever:
    """Fake RAGRetriever that returns a fixed RetrievalResult."""
    def __init__(self, result):
        self._result = result

    def retrieve(self, **kwargs):
        return self._result


def test_orchestrator_passes_structured_evidence_context_to_qa():
    """QA agent receives document_context with structured evidence IDs like [S1]."""
    from backend.rag.retriever import RetrievalResult

    class CapturingQA:
        def __init__(self):
            self.kwargs = None

        def run(self, **kwargs):
            self.kwargs = kwargs
            return "answer [S1]"

    qa = CapturingQA()
    retriever = FakeRAGRetriever(RetrievalResult(
        summaries=[],
        chunks=["chunk"],
        context="[Evidence]\n[S1] file=paper.pdf title=RAG Paper section=2 Method pages=2 score=0.900\nchunk",
        source_doc_ids=["doc-1"],
        source_refs=[{
            "source_id": "S1",
            "doc_id": "doc-1",
            "file_name": "paper.pdf",
            "chunk_id": "c1",
            "chunk_type": "content",
            "content": "chunk",
            "score": 0.9,
            "section_type": "method",
        }],
    ))
    orchestrator = Orchestrator(agents={"qa": qa}, retriever=retriever)

    result = orchestrator.route_task(
        task_type="ask_question",
        question="方法是什么？",
        knowledge_base_id="kb-1",
    )

    assert "[S1]" in qa.kwargs["document_context"]
    assert result["evidence_status"] == "reliable"


def test_readme_only_context_returns_none_evidence():
    """README-only context should yield evidence_status='none' and empty source_refs."""
    agent = CapturingAgent()
    orchestrator = Orchestrator(
        agents={"qa": agent},
        retriever=EmptyRetriever(),
        card_retriever=None,
    )

    result = orchestrator.route_task(
        task_type="ask_question",
        question="What is this about?",
        knowledge_base_readme="This is a knowledge base about AI research.",
    )

    assert result["evidence_status"] == "none"
    assert result["source_refs"] == []
    assert result["answer_mode"] == "general"
    assert agent.last_evidence_status == "none"
