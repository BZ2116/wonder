from dataclasses import dataclass, field
from typing import Literal

ParserName = Literal["mineru_precision", "mineru_agent", "pypdf"]
PaperBlockType = Literal[
    "title",
    "abstract",
    "heading",
    "paragraph",
    "figure_caption",
    "table_caption",
    "formula",
    "reference",
    "appendix",
]
PaperChunkType = Literal[
    "abstract",
    "content",
    "figure_caption",
    "table_caption",
    "formula",
    "reference",
    "summary",
    "profile",
]


@dataclass(frozen=True)
class PaperPage:
    page_number: int
    text: str


@dataclass(frozen=True)
class PaperBlock:
    text: str
    page_start: int = 0
    page_end: int = 0
    block_type: str = "paragraph"
    section_type: str = "unknown"
    section_title: str = ""
    is_reference: bool = False
    block_id: str = ""
    order: int = 0
    label: str = ""


@dataclass(frozen=True)
class PaperDocument:
    title: str | None
    authors: list[str]
    abstract: str | None
    pages: list[PaperPage]
    blocks: list[PaperBlock]
    raw_markdown: str
    parser: ParserName
    document_id: str | None = None
    file_name: str | None = None
    year: int | None = None
    venue: str | None = None
    doi: str | None = None
    page_count: int | None = None
    parser_version: str | None = None


@dataclass(frozen=True)
class BilingualTerm:
    canonical_en: str
    zh: str
    aliases: list[str] = field(default_factory=list)
    term_type: str = "concept"


@dataclass(frozen=True)
class PaperChunk:
    chunk_id: str
    text: str
    chunk_index: int
    section_type: str
    section_title: str
    page_start: int
    page_end: int
    is_reference: bool = False
    prev_chunk_id: str | None = None
    next_chunk_id: str | None = None
    block_types: list[str] = field(default_factory=list)
    chunk_type: str = "content"
    labels: list[str] = field(default_factory=list)
    parser: ParserName = "pypdf"
    parser_version: str | None = None
    source_language: str = "en"
    zh_semantic_summary: str = ""
    zh_key_points: list[str] = field(default_factory=list)
    terms: list[BilingualTerm] = field(default_factory=list)
    evidence_roles: list[str] = field(default_factory=list)
    confidence_flags: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class RetrievalCandidate:
    doc_id: str
    file_name: str
    content: str
    metadata: dict
    dense_score: float
    lexical_score: float = 0.0
    section_intent_score: float = 0.0
    metadata_score: float = 0.0
    neighbor_bonus: float = 0.0

    @property
    def final_score(self) -> float:
        return (
            0.55 * self.dense_score
            + 0.20 * self.lexical_score
            + 0.15 * self.section_intent_score
            + 0.05 * self.metadata_score
            + 0.05 * self.neighbor_bonus
        )


def chroma_safe_metadata(chunk: PaperChunk) -> dict:
    return {
        "chunk_id": chunk.chunk_id,
        "chunk_index": chunk.chunk_index,
        "chunk_type": chunk.chunk_type,
        "section_type": chunk.section_type,
        "section_title": chunk.section_title,
        "page_start": chunk.page_start,
        "page_end": chunk.page_end,
        "labels": ",".join(chunk.labels),
        "is_reference": chunk.is_reference,
        "prev_chunk_id": chunk.prev_chunk_id or "",
        "next_chunk_id": chunk.next_chunk_id or "",
        "block_types": ",".join(chunk.block_types),
        "parser": chunk.parser,
        "parser_version": chunk.parser_version or "",
        "source_language": chunk.source_language,
        "zh_semantic_summary": chunk.zh_semantic_summary,
        "zh_key_points": _join_scalar(chunk.zh_key_points),
        "terms_en": _join_scalar([term.canonical_en for term in chunk.terms]),
        "terms_zh": _join_scalar([term.zh for term in chunk.terms]),
        "term_aliases": _join_scalar([alias for term in chunk.terms for alias in term.aliases]),
        "term_types": _join_scalar([term.term_type for term in chunk.terms]),
        "evidence_roles": _join_scalar(chunk.evidence_roles),
        "confidence_flags": _join_scalar(chunk.confidence_flags),
    }


def _join_scalar(values: list[str], sep: str = "|") -> str:
    def _to_str(value) -> str:
        if isinstance(value, bool):
            return str(value).lower()
        return str(value).strip()
    return sep.join(_to_str(value) for value in values if _to_str(value))


def enrichment_embedding_text(paper_title: str | None, chunk: PaperChunk) -> str:
    title = paper_title or "Unknown"
    key_points = "; ".join(chunk.zh_key_points)
    terms = "; ".join(
        f"{term.canonical_en} / {term.zh}"
        for term in chunk.terms
        if term.canonical_en or term.zh
    )
    aliases = "; ".join(alias for term in chunk.terms for alias in term.aliases)
    roles = ", ".join(chunk.evidence_roles)
    parts = [
        f"Title: {title}",
        f"Section: {chunk.section_title or chunk.section_type or 'unknown'}",
        f"Chinese summary: {chunk.zh_semantic_summary}",
    ]
    if key_points:
        parts.append(f"Chinese key points: {key_points}")
    if terms:
        parts.append(f"Terms: {terms}")
    if aliases:
        parts.append(f"Aliases: {aliases}")
    if roles:
        parts.append(f"Evidence roles: {roles}")
    return "\n".join(part for part in parts if part.strip())