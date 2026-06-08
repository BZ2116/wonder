from fastapi.testclient import TestClient
from backend.main import app
from backend.models.schemas import (
    GatewayAnalysisRequest,
    GatewayAnalysisResponse,
    KnowledgeIndexRequest,
    KnowledgeQARequest,
)


def test_gateway_analysis_request_accepts_ts_ids_and_context():
    req = GatewayAnalysisRequest(
        doc_id="doc-1",
        file_name="paper.pdf",
        file_type="pdf",
        text="retrieval augmented generation paper",
        knowledge_base_id="kb-1",
        knowledge_base_readme="# RAG",
        global_profile="Graduate student studying RAG.",
    )

    assert req.doc_id == "doc-1"
    assert req.knowledge_base_id == "kb-1"
    assert req.max_chars == 7000
    assert req.overlap == 500


def test_gateway_analysis_response_supports_partial_agent_results():
    res = GatewayAnalysisResponse(
        doc_id="doc-1",
        file_name="paper.pdf",
        status="partial",
        failed_agents=["writing"],
        reading_card="card",
        relation_analysis="relation",
        writing_materials="",
        todo_list="todo",
        summary="summary",
        tags=["rag"],
        source_chunks=[],
    )

    assert res.status == "partial"
    assert res.failed_agents == ["writing"]


def test_knowledge_requests_are_kb_scoped():
    index_req = KnowledgeIndexRequest(
        doc_id="doc-1",
        knowledge_base_id="kb-1",
        file_name="paper.pdf",
        file_path="data/uploads/paper.pdf",
        chunks=["chunk"],
        summary="summary",
        analysis_result={"reading_card": "card"},
        tags=["rag"],
    )
    qa_req = KnowledgeQARequest(question="What is RAG?", knowledge_base_id="kb-1")

    assert index_req.knowledge_base_id == "kb-1"
    assert qa_req.knowledge_base_id == "kb-1"


def test_knowledge_index_request_preserves_analysis_result():
    """Node → Python 索引载荷合约：analysis_result 的四个子字段必须被保留。"""
    index_req = KnowledgeIndexRequest(
        doc_id="doc-uuid-1",
        knowledge_base_id="kb-1",
        file_name="paper.pdf",
        chunks=["chunk one", "chunk two"],
        summary="This paper proposes...",
        analysis_result={
            "reading_card": "# Reading Card\nKey findings...",
            "relation_analysis": "Supplements existing work on X",
            "writing_materials": "Usable claims: ...",
            "todo_list": "- Reproduce experiment Y",
        },
        tags=["rag", "nlp"],
        embedding_config=None,
    )

    assert index_req.knowledge_base_id == "kb-1"
    assert index_req.chunks == ["chunk one", "chunk two"]
    assert index_req.analysis_result["reading_card"] == "# Reading Card\nKey findings..."
    assert index_req.analysis_result["relation_analysis"] == "Supplements existing work on X"
    assert index_req.analysis_result["writing_materials"] == "Usable claims: ..."
    assert index_req.analysis_result["todo_list"] == "- Reproduce experiment Y"
    assert index_req.embedding_config is None


def test_knowledge_index_request_accepts_document_metadata_fields():
    """KnowledgeIndexRequest must accept paper metadata fields from Node."""
    index_req = KnowledgeIndexRequest(
        doc_id="doc-1",
        knowledge_base_id="kb-1",
        file_name="paper.pdf",
        chunks=["chunk one"],
        summary="summary",
        analysis_result={},
        tags=["rag"],
        paper_title="Attention Is All You Need",
        authors=["Vaswani", "Shazeer"],
        year=2017,
        venue="NeurIPS",
        abstract="The dominant sequence transduction models...",
        keywords=["attention", "transformer"],
        metadata_status="extracted",
    )

    assert index_req.paper_title == "Attention Is All You Need"
    assert index_req.authors == ["Vaswani", "Shazeer"]
    assert index_req.year == 2017
    assert index_req.venue == "NeurIPS"
    assert index_req.abstract == "The dominant sequence transduction models..."
    assert index_req.keywords == ["attention", "transformer"]
    assert index_req.metadata_status == "extracted"


def test_knowledge_index_request_metadata_fields_default_to_empty():
    """Metadata fields must default to None/empty when not provided."""
    index_req = KnowledgeIndexRequest(
        doc_id="doc-1",
        knowledge_base_id="kb-1",
        file_name="paper.pdf",
        chunks=["chunk"],
        summary="summary",
        analysis_result={},
    )

    assert index_req.paper_title is None
    assert index_req.authors == []
    assert index_req.year is None
    assert index_req.venue is None
    assert index_req.abstract is None
    assert index_req.keywords == []
    assert index_req.metadata_status is None


def test_knowledge_index_request_coerces_null_file_path_to_empty_string():
    """Old Node builds may send null file_path; indexing should not reject it."""
    index_req = KnowledgeIndexRequest(
        doc_id="doc-1",
        knowledge_base_id="kb-1",
        file_name="paper.pdf",
        file_path=None,
        chunks=["chunk"],
        summary="summary",
        analysis_result={},
    )

    assert index_req.file_path == ""


def test_literature_agent_focused_fallback_on_invalid_json():
    from backend.agents.literature import LiteratureParserAgent

    agent = LiteratureParserAgent("test-model", provider=None)
    result = agent._parse_focused_chunk_result("not json", chunk_index=2)

    assert result["chunk_index"] == 2
    assert result["signals"] == []
    assert "missing_or_uncertain" in result


def test_literature_agent_parses_focused_chunk_json():
    from backend.agents.literature import LiteratureParserAgent

    agent = LiteratureParserAgent("test-model", provider=None)
    raw = '{"signals":[{"text":"Method can be reused","signal_type":"method","section_type":"method","evidence_hint":"adapter"}],"missing_or_uncertain":["dataset unclear"]}'
    result = agent._parse_focused_chunk_result(raw, chunk_index=1)

    assert result["signals"][0]["text"] == "Method can be reused"
    assert result["signals"][0]["chunk_index"] == 1
    assert result["signals"][0]["section_type"] == "method"
    assert result["missing_or_uncertain"] == ["dataset unclear"]


def test_writing_agent_removes_internal_field_names_from_user_materials():
    from backend.agents.writing import WritingAgent

    class FakeProvider:
        def chat(self, **kwargs):
            return """
{
  "writing_assets": {
    "usable_claims": ["claim"],
    "method_references": [],
    "theory_references": [],
    "possible_literature_review_use": "",
    "limitations_or_critique": ""
  },
  "writing_materials": "# writing_assets\\nThis section should be readable writing material."
}
"""

    agent = WritingAgent("test-model", provider=FakeProvider())
    result = agent.run(
        reading_card="card",
        relation_analysis="relation",
        writing_style="中文学术写作",
    )

    assert "writing_assets" not in result["writing_materials"]
    assert "readable writing material" in result["writing_materials"]


def test_health_alias_available():
    client = TestClient(app)
    res = client.get("/health")

    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_readme_advisor_rejects_invalid_body():
    client = TestClient(app)
    res = client.post("/api/readme-advisor/generate", json={"invalid_field": 123})
    assert res.status_code == 422


def test_literature_signal_normalization_preserves_evidence_chunk_ids():
    from backend.agents.literature import LiteratureParserAgent

    signal = LiteratureParserAgent._normalize_signal(
        {
            "text": "论文方法依赖照明图估计。",
            "signal_type": "method",
            "section_type": "method",
            "evidence_hint": "illumination map",
            "evidence_chunk_ids": ["c1", "c2"],
            "source_terms": ["illumination map"],
            "confidence": "high",
        },
        chunk_index=0,
    )

    assert signal["evidence_chunk_ids"] == ["c1", "c2"]
    assert signal["source_terms"] == ["illumination map"]
    assert signal["confidence"] == "high"


def test_knowledge_index_request_accepts_structured_paper_chunk_fields():
    req = KnowledgeIndexRequest.model_validate({
        "doc_id": "doc-1",
        "knowledge_base_id": "kb-1",
        "file_name": "paper.pdf",
        "chunks": [],
        "summary": "summary",
        "analysis_result": {},
        "paperChunks": [{
            "chunkId": "chunk-method-1",
            "text": "method text",
            "chunkIndex": 0,
            "chunkType": "formula",
            "sectionType": "method",
            "sectionTitle": "2 Method",
            "pageStart": 2,
            "pageEnd": 3,
            "labels": ["Eq. (8)"],
            "parser": "mineru_precision",
            "parserVersion": "vlm",
            "blockTypes": ["formula"],
        }],
    })

    chunk = req.paper_chunks[0]
    assert chunk.chunk_type == "formula"
    assert chunk.labels == ["Eq. (8)"]
    assert chunk.parser == "mineru_precision"
    assert chunk.parser_version == "vlm"
