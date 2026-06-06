# MinerU Structured PDF Evidence Design

Date: 2026-06-06

## Goal

Add a MinerU-backed structured PDF evidence layer for Wonder's paper RAG flow. The goal is to turn coarse fixed-size PDF chunks into section-aware, page-aware, citation-ready evidence blocks that can support traceable paper QA.

This design is a focused extension of `2026-06-06-paper-rag-redesign.md`. It does not replace the existing SQLite metadata store, Chroma vector store, QA routes, or knowledge-base index ledger. It improves what is parsed, chunked, indexed, and cited for PDF papers.

## Problem

Current indexed PDF papers can be stored and retrieved, but the evidence granularity is too coarse. A paper may appear as:

```text
chunk_0: first ~7000 characters
chunk_1: next ~7000 characters
chunk_2: final ~6700 characters
```

This makes retrieval fragile for paper questions because section title, page number, figure captions, table captions, formulas, and reference boundaries are not reliably attached to each chunk. The QA layer may know that a paper was retrieved, but it cannot consistently say "this answer comes from Section 2.2, pages 2-3, Figure 4, Eq. (8)-(10)."

## Desired User Experience

For a question such as:

```text
@LIME 这篇论文的结构感知光照图优化是怎么做的？
```

Wonder should be able to answer with explicit evidence:

```text
LIME 先用 RGB 最大通道估计初始光照图，再在 Section 2.2 中通过结构感知平滑细化光照图。核心优化目标由 Eq. (8) 给出，权重矩阵由 Eq. (9) 构造，并用 Eq. (10) 的二次近似直接求解。[S1][S2]

证据：
[S1] LIME: A Method for Low-light IMage Enhancement, Section 2.2 Illumination Map Refinement, pp. 2-3
[S2] Eq. (8)-(10), Figure 4, pp. 2-3
```

The important product promise is:

- Answer claims cite paper evidence blocks.
- Evidence blocks show paper title, section, page span, and evidence snippet.
- Unsupported answers say evidence is missing instead of guessing.

## Internal Data Model

MinerU output must be normalized into a parser-independent internal structure. MinerU should not leak directly into retriever or prompt code.

```python
PaperDocument(
    document_id: str,
    file_name: str,
    title: str | None,
    authors: list[str],
    year: int | None,
    venue: str | None,
    doi: str | None,
    abstract: str | None,
    page_count: int | None,
    pages: list[PaperPage],
    blocks: list[PaperBlock],
    parser: Literal["mineru_precision", "mineru_agent", "pypdf"],
    parser_version: str | None,
    raw_markdown: str | None,
)

PaperBlock(
    block_id: str,
    block_type: Literal[
        "title",
        "abstract",
        "heading",
        "paragraph",
        "figure_caption",
        "table_caption",
        "formula",
        "reference",
        "appendix",
    ],
    text: str,
    page_start: int | None,
    page_end: int | None,
    section_title: str | None,
    section_type: str | None,
    label: str | None,
    order: int,
)
```

`section_type` should use stable normalized values:

```text
abstract
introduction
related_work
background
method
experiment
result
discussion
conclusion
limitation
reference
appendix
unknown
```

## MinerU Parse Flow

The PDF parse flow should be:

```text
PDF file
  -> MinerUClient
  -> MinerUNormalizer
  -> PaperDocument
  -> PaperCleaner
  -> PaperEvidenceChunker
  -> SQLite text/evidence storage
  -> Chroma section-aware vector entries
  -> document_vector_indexes ledger update
```

MinerU client behavior:

- Prefer precision API when an API token is configured.
- Use agent/lightweight API only when configured and the PDF fits its size/page limits.
- Fall back to local PDF extraction when MinerU is disabled, unavailable, over limit, times out, or returns unusable output.
- Store parser status in metadata so the UI can distinguish `mineru_precision`, `mineru_agent`, and fallback extraction.

The normalizer must produce `PaperDocument` for all parser paths, even when fallback extraction only has plain text and weak page structure.

## Cleaning And Section Detection

The cleaner should:

- Merge hyphenated line breaks.
- Merge broken PDF lines into paragraphs where safe.
- Normalize whitespace.
- Remove repeated headers and footers when they appear on many pages.
- Preserve page spans as metadata, not as repeated body text.
- Keep figure captions, table captions, and formulas as separate blocks when MinerU exposes them.
- Mark references as `block_type=reference` and `section_type=reference`.

Section detection should:

- Use MinerU headings when available.
- Detect numbered headings such as `1 Introduction`, `2.1 Method`, and `3 Experimental Results`.
- Detect common paper headings in English and Chinese.
- Assign every non-reference content block to the nearest preceding section.
- Treat references and appendices as special regions so they are not mixed into ordinary evidence chunks.

## Evidence Chunking

The first implementation should replace fixed character chunking for PDFs with semantic evidence chunking.

Chunk rules:

- Chunk by section first, paragraph second.
- Target 1200-1800 characters for normal content chunks.
- Use 150-250 characters of overlap only when a long section must be split.
- Keep abstracts, conclusions, figure captions, table captions, and formulas intact when possible.
- Do not merge reference entries into content evidence chunks.
- Preserve `prev_chunk_id` and `next_chunk_id` for neighboring evidence expansion.

The chunk object should be:

```python
PaperChunk(
    chunk_id: str,
    document_id: str,
    chunk_index: int,
    chunk_type: Literal[
        "abstract",
        "content",
        "figure_caption",
        "table_caption",
        "formula",
        "reference",
        "summary",
        "profile",
    ],
    content: str,
    section_title: str | None,
    section_type: str,
    page_start: int | None,
    page_end: int | None,
    labels: list[str],
    is_reference: bool,
    prev_chunk_id: str | None,
    next_chunk_id: str | None,
)
```

Example target chunk:

```text
chunk_id: chunk_lime_method_002
paper_title: LIME: A Method for Low-light IMage Enhancement
section_title: 2.2 Illumination Map Refinement
section_type: method
page_start: 2
page_end: 3
chunk_type: content
labels: ["Eq. (8)", "Eq. (9)", "Eq. (10)", "Figure 4"]
is_reference: false
content: As aforementioned, the illumination estimation can benefit...
```

## SQLite Storage

First pass can continue using the existing `chunks` table for plain content compatibility, but it should also preserve paper evidence metadata in one of two ways:

Recommended first pass:

- Keep existing `chunks(id, document_id, content, embedding, chunk_index)` for compatibility.
- Add a new `paper_chunk_metadata` table keyed by `chunk_id`.

```sql
CREATE TABLE paper_chunk_metadata (
  chunk_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  chunk_type TEXT NOT NULL,
  section_title TEXT,
  section_type TEXT,
  page_start INTEGER,
  page_end INTEGER,
  labels TEXT,
  is_reference INTEGER DEFAULT 0,
  prev_chunk_id TEXT,
  next_chunk_id TEXT,
  parser TEXT,
  parser_version TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
```

Also extend `document_metadata` or add document-level metadata fields for:

- `pdf_page_count`
- `parser`
- `parser_version`
- `parser_status`
- `parser_error`

If avoiding schema expansion in the first implementation is preferred, these can initially be stored in existing JSON-like metadata payloads, but the Chroma metadata still needs the scalar fields listed below.

## Chroma Indexing

Every Chroma entry should contain compact scalar metadata:

```text
doc_id
knowledge_base_id
file_name
paper_title
chunk_id
chunk_index
chunk_type
section_title
section_type
page_start
page_end
labels
is_reference
prev_chunk_id
next_chunk_id
parser
embedding_model
embedding_dimensions
```

Embedding text for content chunks should include a compact header:

```text
Title: LIME: A Method for Low-light IMage Enhancement
Section: 2.2 Illumination Map Refinement
Pages: 2-3
Labels: Eq. (8), Eq. (9), Eq. (10), Figure 4

<chunk body>
```

This keeps the current vector store architecture but makes section-aware questions much easier to retrieve.

Reference chunks:

- May be indexed only as low-priority `chunk_type=reference` if needed for citation-network features.
- Must be excluded from evidence packs by default.
- Must never support factual claims about the paper's own method or results.

## Retrieval And QA Behavior

Retrieval should use the new metadata to improve traceability:

- Method questions boost `section_type=method`.
- Experiment/dataset/metric questions boost `experiment` and `result`.
- Motivation/gap questions boost `abstract`, `introduction`, and `related_work`.
- Limitation questions boost `discussion`, `limitation`, and `conclusion`.
- Reference chunks are filtered out unless the user explicitly asks about references.

Evidence refs should include:

```json
{
  "doc_id": "...",
  "file_name": "2964284.2967188.pdf",
  "paper_title": "LIME: A Method for Low-light IMage Enhancement",
  "chunk_id": "chunk_lime_method_002",
  "chunk_index": 2,
  "chunk_type": "content",
  "section_title": "2.2 Illumination Map Refinement",
  "section_type": "method",
  "page_start": 2,
  "page_end": 3,
  "labels": ["Eq. (8)", "Eq. (9)", "Eq. (10)", "Figure 4"],
  "snippet": "As aforementioned...",
  "score": 0.82
}
```

The generation prompt should cite evidence IDs and render them with title, section, page span, and labels.

## Frontend Visibility

The user should be able to tell whether a PDF was indexed as structured evidence.

Knowledge document rows should eventually show:

```text
已索引 · MinerU · 18 证据块 · 12 页 · BAAI/bge-small-zh-v1.5
```

Source references in QA should show:

```text
[S1] LIME: A Method for Low-light IMage Enhancement
Section 2.2 Illumination Map Refinement · pp. 2-3 · Eq. (8)-(10), Figure 4
```

Click-to-PDF-page preview is useful, but it is not required for the first implementation.

## Compatibility

Existing indexed documents must continue to work:

- If a document lacks paper metadata, retriever treats metadata as neutral.
- Existing `profile`, `summary`, and `content` Chroma entries remain valid.
- The existing QA API continues returning `answer`, `source_doc_ids`, `source_chunks`, `source_refs`, `answer_mode`, and `evidence_status`.
- Reindexing a PDF with MinerU should mark old vector indexes stale before writing the new structured index version.

## Testing

Unit tests:

- MinerU Markdown/JSON normalization into `PaperDocument`.
- Fallback plain-text parser also returns `PaperDocument`.
- Header/footer cleanup.
- Heading and section type detection.
- Reference region detection.
- Evidence chunk sizing, overlap, and neighbor links.
- Figure/table/formula label extraction.
- Chroma metadata contains section/page/label fields.
- Reference chunks are excluded from evidence packs by default.

Integration tests:

- Index a synthetic paper with abstract, method, experiment, conclusion, figure caption, formula, and references.
- Ask a method question and verify answer cites method chunks.
- Ask an experiment question and verify answer cites experiment/result chunks.
- Ask an unsupported claim question and verify `evidence_status` is `none` or `weak`.
- Verify source refs include title, section, page span, and chunk id.

Regression tests:

- Existing non-PDF document indexing still works.
- Existing fixed text chunks still retrieve when no structured metadata exists.
- Mentioned-document scope still restricts retrieval to the mentioned documents.
- Knowledge-base scope still restricts retrieval to indexed collections for that KB.

## Implementation Phases

Phase 1: Evidence data path

1. Add `PaperDocument`, `PaperBlock`, and enriched `PaperChunk` models.
2. Add MinerU normalizer fixtures and tests.
3. Add parser status metadata.
4. Add `paper_chunk_metadata` or equivalent scalar metadata persistence.

Phase 2: Structured chunking and indexing

1. Add cleaner and section detector.
2. Replace PDF fixed-window chunking with evidence chunking.
3. Write section/page/label metadata to Chroma.
4. Mark stale indexes correctly when reindexing.

Phase 3: Retrieval and citation quality

1. Use section intent boosts.
2. Exclude references from evidence packs.
3. Expand neighboring chunks when helpful.
4. Format QA citations with title, section, page span, and labels.

Phase 4: UI polish

1. Show parser/index status in knowledge rows.
2. Show structured source refs in QA.
3. Add PDF page preview later if the document file path is available.

## Risks And Mitigations

- MinerU result shape changes: isolate all parser-specific code in `MinerUNormalizer`.
- MinerU API failures: keep pypdf fallback and expose parser status.
- Incomplete page/section metadata: still index chunks, but mark unknown fields explicitly.
- Metadata bloat in Chroma: keep values scalar and compact; store rich parse output outside Chroma if needed.
- Over-indexing captions/formulas: first version indexes them only when text is meaningful and tied to a section/page.
- Old documents remain coarse: structured evidence appears after reindexing.

## Success Criteria

The first implementation is successful when a newly indexed PDF paper can answer paper-specific questions with:

- `evidence_status` based on retrieved paper evidence.
- Source refs containing `paper_title`, `section_title`, `page_start`, `page_end`, and `chunk_id`.
- Chroma entries that are split by semantic paper sections rather than fixed 7000-character windows.
- Reference-list content excluded from normal evidence answers.
