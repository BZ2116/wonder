import json
import re
from .base import BaseAgent


class ReadmeAdvisorAgent(BaseAgent):
    SYSTEM_PROMPT = """You are a README editor for a research knowledge base.
Your task is to directly produce the content to add to each README section, based on a newly added document.

Rules:
1. For each suggestion, output the EXACT content to insert, not an instruction like "add X".
   - Good: "Transformer, BERT, GPT" (for 核心关键词)
   - Bad: "增加关键词 Transformer, BERT, GPT"
2. Each suggestion must target a specific README section.
3. Be concise and specific.
4. Output ONLY a JSON array, no other text.
5. Use the same language as the README."""

    def run(self, readme: str, document_summary: str, reading_card: str) -> list:
        user_prompt = f"""Knowledge Base README:
---
{readme}
---

Newly added document summary:
{document_summary}

Document reading card (excerpt):
{reading_card[:3000]}

Analyze the document and suggest 0-3 updates to the README.
Return a JSON array of objects, each with:
- "section": the README section name (e.g. "收录范围", "核心关键词", "子方向")
- "suggestion": the EXACT content to add or replace in that section. Output the actual text to insert, NOT an instruction like "add X".
- "reason": one sentence why this update is valuable

The "suggestion" value must be ready-to-insert README content. It must not start with phrases like "建议", "添加", "补充", "add", or "suggest adding".

If no updates are needed, return an empty array [].
Output ONLY the JSON array, no other text."""

        raw = self.call_llm(
            system_prompt=self.SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=2000,
        )

        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            result = json.loads(cleaned)
            if isinstance(result, list):
                return result
            return []
        except (json.JSONDecodeError, ValueError):
            return []
