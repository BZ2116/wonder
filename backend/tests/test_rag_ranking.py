from backend.rag.ranking import (
    build_evidence_pack,
    lexical_score,
    rerank_candidates,
    section_intent_score,
)
from backend.rag.paper_types import RetrievalCandidate


def test_lexical_score_matches_query_terms_case_insensitively():
    assert lexical_score("hybrid retrieval method", "The Method uses HYBRID retrieval.") == 1.0
    assert lexical_score("hybrid retrieval method", "Only retrieval is mentioned.") == 1 / 3


def test_section_intent_boosts_method_questions():
    assert section_intent_score("这个方法怎么设计？", {"section_type": "method"}) == 1.0
    assert section_intent_score("实验结果如何？", {"section_type": "method"}) == 0.0


def test_rerank_prefers_section_intent_when_dense_scores_are_close():
    method = RetrievalCandidate(
        doc_id="d1",
        file_name="paper.pdf",
        content="method content",
        metadata={"chunk_id": "c1", "chunk_type": "content", "section_type": "method"},
        dense_score=0.70,
        section_intent_score=1.0,
    )
    intro = RetrievalCandidate(
        doc_id="d1",
        file_name="paper.pdf",
        content="intro content",
        metadata={"chunk_id": "c2", "chunk_type": "content", "section_type": "introduction"},
        dense_score=0.72,
        section_intent_score=0.0,
    )

    ranked = rerank_candidates([intro, method])

    assert ranked[0].metadata["chunk_id"] == "c1"


def test_build_evidence_pack_uses_stable_source_ids_and_metadata():
    candidate = RetrievalCandidate(
        doc_id="d1",
        file_name="paper.pdf",
        content="The method uses hybrid retrieval.",
        metadata={
            "chunk_id": "c1",
            "chunk_index": 0,
            "chunk_type": "content",
            "paper_title": "RAG Paper",
            "section_title": "2 Method",
            "section_type": "method",
            "page_start": 2,
            "page_end": 3,
        },
        dense_score=0.9,
    )

    context, refs = build_evidence_pack([candidate], max_chars=2000)

    assert "[Evidence]" in context
    assert "[S1] file=paper.pdf title=RAG Paper section=2 Method pages=2-3" in context
    assert refs[0]["source_id"] == "S1"
    assert refs[0]["section_type"] == "method"