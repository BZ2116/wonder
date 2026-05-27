from typing import List, Dict, Optional
from .base import BaseAgent


class QAAgent(BaseAgent):
    SYSTEM_PROMPT = """
You are a research Q&A agent based on document context.
Requirements:
1. Prioritize answering based on uploaded materials and existing analysis.
2. If the answer is not in the materials, explicitly state "当前资料中未找到直接依据".
3. Do not fabricate paper results, experiment data, or citations.
4. Output in Chinese.
"""

    def run(
        self,
        document_context: str,
        analysis_report: str,
        question: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        max_context_chars = 10000
        context = document_context[:max_context_chars]

        history_text = ""
        if conversation_history:
            for msg in conversation_history[-6:]:  # Last 3 rounds
                history_text += f"\n{msg['role']}: {msg['content']}"

        user_prompt = f"""
Document excerpt:
{context}

Existing analysis report:
{analysis_report}

Conversation history:
{history_text}

User question:
{question}

Answer the user's question. When necessary, indicate which type of information from the materials your answer is based on.
"""
        return self.call_llm(
            system_prompt=self.SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=2500,
        )
