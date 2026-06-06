import json
import re
from .base import BaseAgent


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

1. "writing_assets": a structured object with:
   - "usable_claims": array of 3-5 concise, citable claims extracted from this material that can be directly used in a paper
   - "method_references": array of 1-3 method descriptions that could be referenced or adapted
   - "theory_references": array of 1-3 theoretical frameworks or concepts that could be cited
   - "possible_literature_review_use": a markdown paragraph (2-4 sentences) explaining how this material fits into a literature review section
   - "limitations_or_critique": a markdown paragraph (2-4 sentences) noting limitations, counterarguments, or gaps

2. "writing_materials": the full markdown writing materials in this format:
   # Reusable Writing Materials
   ## 1. Literature Review Paragraphs
   Write 1-2 paragraphs for "Related Work" or "Research Background".
   ## 2. Method Inspiration Paragraph
   Write 1 paragraph explaining how this material inspires method design.
   ## 3. Experiment Design Reference Paragraph
   Write 1 paragraph explaining its reference value for experiment settings, metrics, or comparison experiments.
   ## 4. Concise Notes Version
   Summarize in 5 or fewer bullet points.
   ## 5. Writing Notes
   Point out where real citations, data, or experiment verification need to be added.

Output ONLY the JSON object, no other text. Use the same language as the user's writing style preference.
"""
        raw = self.call_llm(
            system_prompt=self.SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.25,
            max_tokens=5000,
        )

        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            result = json.loads(cleaned)
            # Validate structure
            if isinstance(result, dict) and "writing_assets" in result:
                return result
            return {
                "writing_assets": self._default_assets(),
                "writing_materials": raw,
            }
        except (json.JSONDecodeError, ValueError):
            return {
                "writing_assets": self._default_assets(),
                "writing_materials": raw,
            }

    @staticmethod
    def _default_assets() -> dict:
        return {
            "usable_claims": [],
            "method_references": [],
            "theory_references": [],
            "possible_literature_review_use": "",
            "limitations_or_critique": "",
        }
