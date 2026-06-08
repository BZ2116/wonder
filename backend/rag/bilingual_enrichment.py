import json
import re
from dataclasses import dataclass, field
from typing import Any

from backend.rag.paper_types import BilingualTerm


@dataclass(frozen=True)
class BilingualEnrichment:
    zh_semantic_summary: str = ""
    zh_key_points: list[str] = field(default_factory=list)
    terms: list[BilingualTerm] = field(default_factory=list)
    evidence_roles: list[str] = field(default_factory=list)
    confidence_flags: list[str] = field(default_factory=list)


def strip_json_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _list_of_strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _parse_terms(value: Any) -> list[BilingualTerm]:
    if not isinstance(value, list):
        return []
    terms: list[BilingualTerm] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        canonical_en = str(item.get("canonical_en", item.get("canonicalEn", ""))).strip()
        zh = str(item.get("zh", "")).strip()
        aliases = _list_of_strings(item.get("aliases", []))
        term_type = str(item.get("term_type", item.get("termType", "concept"))).strip() or "concept"
        if canonical_en or zh:
            terms.append(BilingualTerm(canonical_en=canonical_en, zh=zh, aliases=aliases, term_type=term_type))
    return terms


def parse_bilingual_enrichment(raw: str) -> BilingualEnrichment:
    try:
        parsed = json.loads(strip_json_fence(raw))
    except (TypeError, ValueError, json.JSONDecodeError):
        return BilingualEnrichment()
    if not isinstance(parsed, dict):
        return BilingualEnrichment()
    return BilingualEnrichment(
        zh_semantic_summary=str(parsed.get("zh_semantic_summary", parsed.get("zhSemanticSummary", ""))).strip(),
        zh_key_points=_list_of_strings(parsed.get("zh_key_points", parsed.get("zhKeyPoints", []))),
        terms=_parse_terms(parsed.get("terms", [])),
        evidence_roles=_list_of_strings(parsed.get("evidence_roles", parsed.get("evidenceRoles", []))),
        confidence_flags=_list_of_strings(parsed.get("confidence_flags", parsed.get("confidenceFlags", []))),
    )


def fallback_bilingual_enrichment(source_text: str, section_type: str) -> BilingualEnrichment:
    summary = source_text.strip().replace("\n", " ")[:180]
    role = section_type if section_type else "unknown"
    flags = ["zh_summary_uncertain"]
    if role == "unknown":
        flags.append("weak_section")
    return BilingualEnrichment(
        zh_semantic_summary=f"该英文片段与 {role} 部分相关，需要依据原文核验：{summary}",
        zh_key_points=[],
        terms=[],
        evidence_roles=[role],
        confidence_flags=flags,
    )