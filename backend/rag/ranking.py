import re
from collections import OrderedDict

from backend.rag.paper_types import RetrievalCandidate


def query_terms(query: str) -> list[str]:
    return [
        term.lower()
        for term in re.findall(r"[\w一-鿿]+", query)
        if len(term.strip()) >= 2
    ]


def lexical_score(query: str, text: str) -> float:
    terms = query_terms(query)
    if not terms:
        return 0.0
    haystack = text.lower()
    hits = sum(1 for term in terms if term in haystack)
    return hits / len(terms)


def section_intent_score(query: str, metadata: dict) -> float:
    q = query.lower()
    section = (metadata.get("section_type") or "").lower()
    intent_map = {
        "method": ["method", "algorithm", "architecture", "framework", "方法", "模型", "架构", "怎么设计"],
        "experiment": ["experiment", "dataset", "metric", "ablation", "实验", "数据集", "指标", "消融"],
        "result": ["result", "performance", "效果", "结果", "表现"],
        "introduction": ["motivation", "gap", "problem", "动机", "问题", "背景"],
        "related_work": ["related", "prior", "相关工作", "已有"],
        "discussion": ["limitation", "discussion", "局限", "限制", "讨论"],
        "conclusion": ["conclusion", "总结", "结论"],
    }
    for target, markers in intent_map.items():
        if section == target and any(marker in q for marker in markers):
            return 1.0
    return 0.0


def rerank_candidates(candidates: list[RetrievalCandidate]) -> list[RetrievalCandidate]:
    deduped: OrderedDict[tuple[str, str], RetrievalCandidate] = OrderedDict()
    for candidate in candidates:
        key = (candidate.doc_id, candidate.metadata.get("chunk_id") or candidate.content[:80])
        previous = deduped.get(key)
        if previous is None or candidate.final_score > previous.final_score:
            deduped[key] = candidate
    return sorted(deduped.values(), key=lambda item: item.final_score, reverse=True)


def page_span(meta: dict) -> str:
    start = int(meta.get("page_start") or 0)
    end = int(meta.get("page_end") or start)
    if start <= 0:
        return "unknown"
    return str(start) if start == end else f"{start}-{end}"


def build_evidence_pack(
    candidates: list[RetrievalCandidate],
    *,
    max_chars: int,
    background: str = "",
) -> tuple[str, list[dict]]:
    parts = []
    if background.strip():
        parts.append("[Background]\n" + background.strip())
    evidence_parts = ["[Evidence]"]
    refs = []
    used = 0
    for idx, candidate in enumerate(candidates, start=1):
        meta = candidate.metadata
        source_id = f"S{idx}"
        title = meta.get("paper_title") or meta.get("title") or ""
        section = meta.get("section_title") or meta.get("section_type") or "unknown"
        pages = page_span(meta)
        header = (
            f"[{source_id}] file={candidate.file_name} title={title} "
            f"section={section} pages={pages} score={candidate.final_score:.3f}"
        )
        block = f"{header}\n{candidate.content.strip()}"
        if used + len(block) > max_chars:
            break
        evidence_parts.append(block)
        used += len(block)
        refs.append({
            "source_id": source_id,
            "doc_id": candidate.doc_id,
            "file_name": candidate.file_name,
            "chunk_id": meta.get("chunk_id"),
            "chunk_index": meta.get("chunk_index"),
            "chunk_type": meta.get("chunk_type", "content"),
            "content": candidate.content,
            "score": candidate.final_score,
            "section_type": meta.get("section_type", ""),
            "section_title": meta.get("section_title", ""),
            "page_start": meta.get("page_start"),
            "page_end": meta.get("page_end"),
        })
    parts.append("\n\n".join(evidence_parts))
    return "\n\n---\n\n".join(parts), refs