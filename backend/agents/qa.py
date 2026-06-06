from typing import List, Dict, Optional, Literal
from .base import BaseAgent


class QAAgent(BaseAgent):
    SYSTEM_PROMPT = """
You are a research Q&A agent based on document evidence.
Requirements:
1. Prioritize uploaded paper evidence and existing analysis.
2. If the evidence blocks do not directly support the answer, explicitly state "当前资料中未找到直接证据".
3. Do not fabricate paper results, experiment data, or citations.
4. Output in Chinese.
5. Cite evidence block IDs like [S1] when making claims from papers.
6. Background and knowledge-base README are not paper evidence.
7. Research card context represents the user's previous synthesis. Do not present it as paper evidence unless source refs or paper chunks support it.
"""

    NO_EVIDENCE_RULE = (
        "If evidence_status is none, answer with the short no-evidence template. "
        "Do not invent paper findings. Do not cite knowledge-base sources."
    )

    WEAK_EVIDENCE_RULE = (
        "If evidence_status is weak, say the retrieved material is only weakly related. "
        "List possible related material briefly, then give clearly marked general guidance. "
        "Do not present weak material as proof."
    )

    README_RULE = (
        "Knowledge base README/background is not paper evidence. Never cite it as a source."
    )

    MODE_PROMPTS: Dict[str, str] = {
        "general": (
            "Answer as general research guidance. Start by saying the current knowledge base "
            "does not contain enough reliable evidence for this question. Do not claim that "
            "the answer is supported by uploaded papers."
        ),
        "rag_enhanced": (
            "Prioritize retrieved chunks. "
            "Qualify unsupported claims."
        ),
        "mentioned_docs": (
            "Answer using only the explicitly mentioned paper as paper evidence. If the "
            "retrieved evidence does not support a claim, say that the paper evidence is "
            "insufficient before giving general background."
        ),
        "compare_docs": (
            "Compare only the explicitly mentioned papers. Do not use unmentioned papers as "
            "evidence. Include common points, differences, research implications, and evidence gaps."
        ),
    }

    def run(
        self,
        document_context: str,
        analysis_report: str,
        question: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        user_name: str = "",
        answer_mode: Optional[str] = None,
        evidence_status: Optional[str] = None,
        max_answer_tokens: int = 1800,
        max_context_chars: int = 10000,
    ) -> str:
        context = document_context[:max_context_chars]

        system_prompt = self.SYSTEM_PROMPT
        if answer_mode and answer_mode in self.MODE_PROMPTS:
            system_prompt += f"\nMode: {self.MODE_PROMPTS[answer_mode]}"
        if evidence_status == "none":
            system_prompt += f"\n{self.NO_EVIDENCE_RULE}"
        elif evidence_status == "weak":
            system_prompt += f"\n{self.WEAK_EVIDENCE_RULE}"
        # README rule always applies
        system_prompt += f"\n{self.README_RULE}"
        if user_name:
            system_prompt += f"\nThe user's name is {user_name}. Address them by name when appropriate."

        history_text = ""
        if conversation_history:
            for msg in conversation_history[-6:]:  # Last 3 rounds
                role = msg.get("role", "")
                content = msg.get("content", "")
                history_text += f"\n{role}: {content}"

        user_prompt = f"""
Document excerpt:
{context}

Existing analysis report:
{analysis_report}

Conversation history:
{history_text}

User question:
{question}

Answer the user's question in Chinese. When using paper evidence, cite evidence IDs such as [S1]. If the evidence is weak or absent, state the limitation before giving general research guidance.
"""
        return self.call_llm(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=max_answer_tokens,
        )
