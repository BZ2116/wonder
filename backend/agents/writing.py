import json
import re
from .base import BaseAgent, AgentError
from backend.core.providers.base import ProviderError


class WritingAgent(BaseAgent):
    SYSTEM_PROMPT = """
You are a Chinese academic writing assistant agent.
Your task is to transform structured materials into paper writing materials.
Requirements:
1. Maintain undergraduate/graduate thesis style.
2. Avoid colloquial or exaggerated expressions.
3. Do not fabricate specific data or citations.
4. Mark missing references as "需补充参考文献".
5. Output ONLY a JSON object, no other text.
"""

    def run(self, reading_card: str, relation_analysis: str, writing_style: str, decision_brief: dict | None = None) -> dict:
        user_prompt = f"""
Material reading card:
{reading_card}

Project relation analysis:
{relation_analysis}

User's preferred writing style:
{writing_style}

Decision brief:
{json.dumps(decision_brief or {}, ensure_ascii=False)}

Adapt output to the decision brief's best_use. If best_use is "not_useful", keep writing materials short and do not invent value.

Generate a JSON object with two top-level keys:

1. "writing_assets": a machine-readable structured object. This key name is for software parsing only and MUST NOT appear inside user-facing prose:
   - "usable_claims": array of 3-5 concise, citable claims extracted from this material that can be directly used in a paper
   - "method_references": array of 1-3 method descriptions that could be referenced or adapted
   - "theory_references": array of 1-3 theoretical frameworks or concepts that could be cited
   - "possible_literature_review_use": a markdown paragraph (2-4 sentences) explaining how this material fits into a literature review section
   - "limitations_or_critique": a markdown paragraph (2-4 sentences) noting limitations, counterarguments, or gaps

2. "writing_materials": user-facing markdown writing materials. Do NOT mention JSON keys such as "writing_assets", "usable_claims", or "method_references" in this text. Use this format:
   # 可复用写作素材
   ## 1. 文献综述段落
   Write 1-2 paragraphs for "Related Work" or "Research Background".
   ## 2. 方法启发段落
   Write 1 paragraph explaining how this material inspires method design.
   ## 3. 实验设计参考
   Write 1 paragraph explaining its reference value for experiment settings, metrics, or comparison experiments.
   ## 4. 简明记录
   Summarize in 5 or fewer bullet points.
   ## 5. 写作提醒
   Point out where real citations, data, or experiment verification need to be added.

Output ONLY the JSON object, no other text. Use the same language as the user's writing style preference.
"""
        try:
            raw = self.call_llm(
                system_prompt=self.SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=0.25,
                max_tokens=8000,
            )
            result = self._try_parse_result(raw)
            if result and self._validate_assets(result.get("writing_assets", {})):
                result["writing_materials"] = self._sanitize_writing_materials(
                    result.get("writing_materials", "")
                )
                return result
            # Retry once with higher temperature if validation fails
            raw = self.call_llm(
                system_prompt=self.SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=0.4,
                max_tokens=8000,
            )
            result = self._try_parse_result(raw)
            if result:
                result["writing_materials"] = self._sanitize_writing_materials(
                    result.get("writing_materials", "")
                )
                return result
            return {
                "writing_assets": self._default_assets(),
                "writing_materials": self._sanitize_writing_materials(raw),
            }
        except ProviderError as e:
            return {
                "writing_assets": self._default_assets(),
                "writing_materials": self._sanitize_writing_materials(""),
            }

    def _try_parse_result(self, raw: str) -> dict | None:
        """Parse LLM raw output as JSON. Returns None if parsing fails."""
        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict) and "writing_assets" in parsed:
                return parsed
            return None
        except (json.JSONDecodeError, ValueError):
            return None

    @staticmethod
    def _validate_assets(assets: dict) -> bool:
        """Check that writing_assets contains the minimum required number of items."""
        usable = assets.get("usable_claims", [])
        methods = assets.get("method_references", [])
        theories = assets.get("theory_references", [])
        if not isinstance(usable, list) or not isinstance(methods, list) or not isinstance(theories, list):
            return False
        if len(usable) < 1 or len(methods) < 1 or len(theories) < 1:
            return False
        # Check for truncated strings: if any string is suspiciously short or empty
        for claim in usable:
            if not isinstance(claim, str) or len(claim) < 5:
                return False
        for ref in methods:
            if not isinstance(ref, str) or len(ref) < 5:
                return False
        for ref in theories:
            if not isinstance(ref, str) or len(ref) < 5:
                return False
        return True

    @staticmethod
    def _default_assets() -> dict:
        return {
            "usable_claims": [],
            "method_references": [],
            "theory_references": [],
            "possible_literature_review_use": "",
            "limitations_or_critique": "",
        }

    @staticmethod
    def _sanitize_writing_materials(value) -> str:
        text = value if isinstance(value, str) else str(value or "")
        text = re.sub(r"(?im)^\s{0,3}#{1,6}\s*writing[_\s-]*assets\s*$", "", text)
        text = re.sub(r"(?im)^\s{0,3}[-*]?\s*writing[_\s-]*assets\s*:?\s*$", "", text)
        text = re.sub(r"\bwriting_assets\b", "写作素材", text)
        text = re.sub(r"\bwriting assets\b", "写作素材", text, flags=re.I)
        return re.sub(r"\n{3,}", "\n\n", text).strip()
