from backend.rag.paper_types import (
    BilingualTerm,
    PaperChunk,
    chroma_safe_metadata,
    enrichment_embedding_text,
)
from backend.rag.bilingual_enrichment import (
    BilingualEnrichment,
    parse_bilingual_enrichment,
    fallback_bilingual_enrichment,
)


def test_chroma_metadata_includes_compact_bilingual_fields():
    chunk = PaperChunk(
        chunk_id="c1",
        text="The method estimates an illumination map.",
        chunk_index=0,
        section_type="method",
        section_title="2 Method",
        page_start=2,
        page_end=3,
        zh_semantic_summary="该方法估计照明图。",
        zh_key_points=["估计照明图", "用于低光增强"],
        terms=[
            BilingualTerm(
                canonical_en="illumination map",
                zh="照明图",
                aliases=["illumination estimation"],
                term_type="concept",
            )
        ],
        evidence_roles=["method"],
        confidence_flags=["term_translation_uncertain"],
    )

    meta = chroma_safe_metadata(chunk)

    assert meta["source_language"] == "en"
    assert meta["zh_semantic_summary"] == "该方法估计照明图。"
    assert meta["zh_key_points"] == "估计照明图|用于低光增强"
    assert meta["terms_en"] == "illumination map"
    assert meta["terms_zh"] == "照明图"
    assert meta["term_aliases"] == "illumination estimation"
    assert meta["evidence_roles"] == "method"
    assert meta["confidence_flags"] == "term_translation_uncertain"


def test_enrichment_embedding_text_uses_only_helper_fields():
    chunk = PaperChunk(
        chunk_id="c1",
        text="The English source text should not be repeated here.",
        chunk_index=0,
        section_type="method",
        section_title="2 Method",
        page_start=2,
        page_end=2,
        zh_semantic_summary="该方法估计照明图。",
        zh_key_points=["低光增强", "结构感知约束"],
        terms=[
            BilingualTerm(
                canonical_en="structure-aware smoothing",
                zh="结构感知平滑",
                aliases=["structure-aware constraint"],
                term_type="method",
            )
        ],
        evidence_roles=["method"],
    )

    text = enrichment_embedding_text("LIME", chunk)

    assert "Title: LIME" in text
    assert "Chinese summary: 该方法估计照明图。" in text
    assert "Chinese key points: 低光增强; 结构感知约束" in text
    assert "Terms: structure-aware smoothing / 结构感知平滑" in text
    assert "The English source text should not be repeated here." not in text


def test_parse_bilingual_enrichment_accepts_json_fence():
    raw = """```json
{
  "zh_semantic_summary": "该片段说明方法流程。",
  "zh_key_points": ["方法流程", "低光增强"],
  "terms": [
    {
      "canonical_en": "illumination map",
      "zh": "照明图",
      "aliases": ["illumination estimation"],
      "term_type": "concept"
    }
  ],
  "evidence_roles": ["method"],
  "confidence_flags": ["weak_section"]
}
```"""

    enrichment = parse_bilingual_enrichment(raw)

    assert enrichment.zh_semantic_summary == "该片段说明方法流程。"
    assert enrichment.zh_key_points == ["方法流程", "低光增强"]
    assert enrichment.terms[0].canonical_en == "illumination map"
    assert enrichment.terms[0].zh == "照明图"
    assert enrichment.evidence_roles == ["method"]
    assert enrichment.confidence_flags == ["weak_section"]


def test_parse_bilingual_enrichment_returns_empty_on_invalid_json():
    enrichment = parse_bilingual_enrichment("not json")

    assert enrichment == BilingualEnrichment()


def test_fallback_bilingual_enrichment_marks_missing_model_output():
    enrichment = fallback_bilingual_enrichment(
        source_text="The method uses BLEU and ROUGE metrics.",
        section_type="experiment",
    )

    assert enrichment.zh_semantic_summary
    assert "experiment" in enrichment.evidence_roles
    assert "zh_summary_uncertain" in enrichment.confidence_flags