from __future__ import annotations

import re
from typing import Any

from backend.rag.paper_types import PaperBlock, PaperDocument, PaperPage, ParserName


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _block_type(value: str) -> str:
    normalized = value.lower().strip()
    mapping = {
        "text": "paragraph",
        "para": "paragraph",
        "paragraph": "paragraph",
        "title": "title",
        "heading": "heading",
        "header": "heading",
        "formula": "formula",
        "equation": "formula",
        "figure": "figure_caption",
        "figure_caption": "figure_caption",
        "table": "table_caption",
        "table_caption": "table_caption",
        "reference": "reference",
        "references": "reference",
    }
    return mapping.get(normalized, "paragraph")


def _extract_pages(payload: dict[str, Any]) -> list[dict[str, Any]]:
    pages = payload.get("pages")
    if isinstance(pages, list):
        return [page for page in pages if isinstance(page, dict)]
    return []


def normalize_mineru_payload(
    payload: dict[str, Any],
    *,
    document_id: str,
    file_name: str,
    parser: ParserName,
    parser_version: str | None = None,
) -> PaperDocument:
    pages: list[PaperPage] = []
    blocks: list[PaperBlock] = []
    order = 0

    for page in _extract_pages(payload):
        page_number = int(page.get("page") or page.get("page_number") or len(pages) + 1)
        page_blocks = page.get("blocks") if isinstance(page.get("blocks"), list) else []
        page_text_parts: list[str] = []

        for raw in page_blocks:
            if not isinstance(raw, dict):
                continue
            text = _as_text(raw.get("text") or raw.get("content") or raw.get("markdown"))
            if not text:
                continue
            kind = _block_type(_as_text(raw.get("type") or raw.get("block_type")))
            label = _as_text(raw.get("label"))
            blocks.append(PaperBlock(
                block_id=_as_text(raw.get("id")) or f"block-{order}",
                block_type=kind,
                text=text,
                page_start=page_number,
                page_end=page_number,
                label=label,
                order=order,
                is_reference=kind == "reference",
                section_type="reference" if kind == "reference" else "unknown",
            ))
            page_text_parts.append(text)
            order += 1

        pages.append(PaperPage(page_number=page_number, text="\n".join(page_text_parts)))

    raw_markdown = _as_text(payload.get("markdown") or payload.get("md") or payload.get("raw_markdown"))
    return PaperDocument(
        document_id=document_id,
        file_name=file_name,
        title=_as_text(payload.get("title")) or None,
        authors=[_as_text(a) for a in payload.get("authors", []) if _as_text(a)],
        year=payload.get("year") if isinstance(payload.get("year"), int) else None,
        venue=_as_text(payload.get("venue")) or None,
        doi=_as_text(payload.get("doi")) or None,
        abstract=_as_text(payload.get("abstract")) or None,
        page_count=len(pages) or None,
        pages=pages,
        blocks=blocks,
        raw_markdown=raw_markdown,
        parser=parser,
        parser_version=parser_version,
    )


def normalize_plain_pdf_text(*, text: str, document_id: str, file_name: str) -> PaperDocument:
    cleaned = text.strip()
    blocks = []
    for order, part in enumerate(re.split(r"\n\s*\n+", cleaned)):
        part = part.strip()
        if not part:
            continue
        blocks.append(PaperBlock(
            block_id=f"fallback-{order}",
            text=part,
            page_start=1,
            page_end=1,
            block_type="paragraph",
            order=order,
        ))
    return PaperDocument(
        document_id=document_id,
        file_name=file_name,
        title=None,
        authors=[],
        abstract=None,
        page_count=1 if cleaned else 0,
        pages=[PaperPage(page_number=1, text=cleaned)] if cleaned else [],
        blocks=blocks,
        raw_markdown=cleaned,
        parser="pypdf",
        parser_version=None,
    )
