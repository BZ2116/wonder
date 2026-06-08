# Bilingual Evidence RAG Design

Date: 2026-06-08

## Goal

Add a bilingual evidence layer to Wonder so English papers can be analyzed, searched, and answered in Chinese without losing traceability to the English source text.

The selected approach is bilingual evidence enhancement. English paper chunks remain the only evidence source. Chinese summaries, Chinese key points, and bilingual term mappings are added as retrieval and reading aids. Literature analysis and traceable QA should both reuse this same evidence layer.

## Current Context

Wonder already has designs for:

- Paper-aware parsing, chunking, and hybrid RAG.
- MinerU-backed structured PDF evidence with section and page metadata.
- Decision-first literature analysis.

Those designs improve evidence granularity, but they do not fully define how English literature should support a Chinese reading experience. A simple final-answer translation is not enough because Chinese queries may miss English evidence, and Chinese summaries can drift away from source claims if they become independent evidence.

## Design Principles

- English source text is the evidence truth source.
- Chinese fields improve retrieval, reading, and synthesis, but are not independently citable.
- Every important analysis signal or answer claim should bind back to an English evidence chunk.
- The same bilingual evidence chunks should serve single-paper analysis, knowledge-base QA, and research-card RAG.
- New behavior should extend the existing Chroma, SQLite, and Python agent architecture without requiring a separate search service.

## Evidence Data Model

The existing `PaperChunk` model should be extended with bilingual enrichment fields. The exact implementation may use an explicit `BilingualEvidenceChunk` type or add fields to existing paper chunk structures, but the semantic contract should be:

```text
chunk_id
document_id
paper_title
section_title
section_type
page_start
page_end
labels
parser
source_language = "en"

source_text_en
zh_semantic_summary
zh_key_points
terms
  - canonical_en
  - zh
  - aliases
  - term_type: method | dataset | metric | concept | model | task
evidence_roles
confidence_flags
```

Field meanings:

- `source_text_en`: original English chunk text. This is the only citable evidence body.
- `zh_semantic_summary`: compact Chinese explanation of the source chunk.
- `zh_key_points`: Chinese bullet-like semantic points for analysis and retrieval.
- `terms`: bilingual bridge for methods, datasets, metrics, tasks, abbreviations, and concepts.
- `evidence_roles`: normalized roles such as `method`, `experiment`, `result`, `limitation`, `background`, and `novelty`.
- `confidence_flags`: quality warnings such as `low_parse_quality`, `weak_section`, `term_translation_uncertain`, or `zh_summary_uncertain`.

## Indexing Strategy

Chinese enrichment should be generated at indexing time, not at answer time.

Reasons:

- The enrichment can be cached and reused by literature analysis, QA, and research-card retrieval.
- Chinese queries need searchable Chinese fields before retrieval happens.
- The index status can show whether bilingual enrichment is complete.
- Tests can validate deterministic formatting and metadata behavior.

Chroma should support multiple retrieval entries that converge to one `chunk_id`:

- `entry_kind=source`: embedding text built from English source text plus compact evidence metadata.
- `entry_kind=zh_enrichment`: embedding text built from `zh_semantic_summary`, `zh_key_points`, and bilingual terms.
- Existing `profile` and `summary` entries remain available for compatibility.

The retriever must merge results by `chunk_id`. Chinese enrichment entries can increase recall and score, but the final evidence pack always points back to `source_text_en`.

## Query Normalization

Before retrieval, user questions should be normalized into a bilingual query plan:

```json
{
  "query_zh": "这篇论文的方法怎么做？",
  "query_en_expansion": ["method", "approach", "pipeline", "optimization"],
  "terms": ["illumination map", "structure-aware smoothing"],
  "section_intent": ["method"]
}
```

The normalizer should support:

- Chinese questions.
- English questions.
- Mixed Chinese-English questions with paper titles, method names, datasets, metrics, and abbreviations.
- Section intent detection for method, experiment, result, limitation, motivation, and background questions.

The first version can use lightweight rules and the configured LLM only where needed. It should avoid adding expensive or brittle dependencies.

## Retrieval And Reranking

Retrieval should use three recall paths:

1. English source vector recall against `entry_kind=source`.
2. Chinese enrichment vector recall against `entry_kind=zh_enrichment`.
3. Term and lexical recall for canonical English terms, Chinese aliases, abbreviations, datasets, and metrics.

Candidates should be merged by `chunk_id`, then reranked with a lightweight scoring function:

```text
final_score =
  0.35 * source_dense_score +
  0.25 * zh_enrichment_score +
  0.20 * term_match_score +
  0.15 * section_intent_score +
  0.05 * metadata_quality_score
```

Rules:

- A chunk can receive score from multiple recall paths.
- Reference chunks remain excluded unless the user explicitly asks about references.
- Section intent boosts should follow the existing paper RAG design.
- Low-confidence metadata should reduce score or lower evidence status.
- Missing bilingual enrichment should degrade gracefully to English source retrieval.

## Evidence Pack Format

The generation context should separate source evidence from Chinese helper text:

```text
[Evidence S1]
title=...
section=Method
pages=2-3
labels=Eq. (8), Figure 4

source_text_en:
<English source text>

zh_helper:
<Chinese summary for understanding only. Not independently citable.>
```

Generation rules:

- Main answers and literature analysis outputs are written in Chinese.
- Important claims cite evidence IDs such as `[S1]`.
- If Chinese enrichment and English source text appear inconsistent, the English source text wins.
- If no English evidence directly supports a claim, the answer must say the current material lacks direct evidence.
- README/global context and Chinese helper text are never cited as paper evidence.

## Literature Analysis Reuse

Single-paper analysis should consume bilingual evidence chunks instead of directly summarizing raw English text.

Flow:

```text
BilingualEvidenceChunks
  -> section-aware evidence sampling
  -> focused signal extraction
  -> Chinese decision brief
  -> Chinese reading card, writing materials, and todo list
```

Each focused signal should include:

```json
{
  "text_zh": "论文的核心方法是先估计 illumination map，再通过结构感知约束细化。",
  "evidence_chunk_ids": ["S3", "S4"],
  "source_terms": ["illumination map", "structure-aware smoothing"],
  "signal_type": "method",
  "confidence": "high"
}
```

The decision brief should be derived from evidence-bound signals, not free-form model impressions. Writing materials and todo items should preserve enough evidence references to support later follow-up questions.

## Output Style

Wonder should use a dual-layer Chinese output style:

- Main prose: natural academic Chinese suitable for reading notes, literature review drafts, and research decisions.
- Evidence area: English paper title, section, page span, source terms, and short English source snippets where useful.

Term display:

```text
照明图（illumination map）
结构感知平滑（structure-aware smoothing）
```

After first mention, Chinese can be preferred in the main prose, while evidence references preserve English terms.

## Storage And Compatibility

The first implementation should preserve existing APIs and indexed documents.

- New fields can be stored in scalar Chroma metadata where practical.
- Rich arrays such as terms and key points may be JSON-encoded in SQLite metadata or a dedicated paper metadata table.
- Existing documents without bilingual enrichment still retrieve through source/profile/summary entries.
- Reindexing a paper should mark old vector indexes stale before writing enriched entries.
- Frontend source refs should remain compatible while gaining optional bilingual fields.

## Testing

Unit tests:

- Bilingual enrichment model serialization and defaults.
- Query normalization for Chinese, English, and mixed-language questions.
- Candidate merge by `chunk_id` across English source and Chinese enrichment entries.
- Rerank score calculation, including term and section boosts.
- Evidence pack formatting with `source_text_en` and non-citable `zh_helper`.
- Literature analysis signals preserve `evidence_chunk_ids`.
- Missing enrichment falls back to existing English/source retrieval.

Integration tests:

- Index a synthetic English paper with method, experiment, result, limitation, and references.
- Ask a Chinese method question and verify retrieved evidence points to English method chunks.
- Ask a mixed Chinese-English metric or dataset question and verify term recall.
- Run literature analysis and verify decision brief claims bind to evidence chunk IDs.
- Verify unsupported Chinese questions return weak or missing evidence status instead of unsupported claims.

Regression tests:

- Existing non-PDF documents still index and retrieve.
- Existing QA response fields remain available.
- Knowledge-base scope and mentioned-document scope still apply.
- Reference-list chunks do not support ordinary method or result claims.

## Implementation Phases

Phase 1: Data contract and enrichment generation

1. Add bilingual enrichment fields and serialization helpers.
2. Add a bilingual enrichment agent/helper that produces Chinese summaries, key points, terms, evidence roles, and confidence flags from English chunks.
3. Persist enrichment fields with chunk metadata.
4. Add tests for serialization and fallback behavior.

Phase 2: Index and retrieval

1. Add `entry_kind=zh_enrichment` Chroma entries.
2. Add bilingual query normalization.
3. Add multi-path recall and merge-by-chunk behavior.
4. Add term, section, and metadata quality scoring.
5. Add evidence pack formatting with explicit `zh_helper` constraints.

Phase 3: Literature analysis reuse

1. Update focused extraction to sample bilingual evidence chunks.
2. Bind analysis signals to evidence chunk IDs.
3. Derive decision brief, writing materials, and todo items from evidence-bound signals.
4. Preserve compatibility with legacy analysis history.

Phase 4: Frontend visibility

1. Show bilingual enrichment/index status for newly indexed papers.
2. Render Chinese answers with English source refs.
3. Display bilingual terms in source refs and analysis evidence sections.

## Risks And Mitigations

- Chinese enrichment drifts from English source: mark helper text non-citable and require citations to English chunks.
- Translation quality varies for technical terms: store canonical English terms and uncertainty flags.
- Index size grows: keep enrichment compact and use one additional enrichment entry per evidence chunk in the first version.
- Old documents lack enrichment: treat enrichment as optional and fall back to existing retrieval.
- Query normalization over-expands terms: combine expansion with source dense retrieval and section-aware scoring.

## Success Criteria

The design is successful when:

- Chinese questions can reliably retrieve English evidence chunks.
- Chinese answers cite evidence IDs backed by English source text.
- Literature analysis decision brief claims can trace to chunk IDs.
- Source refs show paper title, section, page span, and important English terms.
- Evidence gaps are reported explicitly instead of being filled by unsupported Chinese prose.
