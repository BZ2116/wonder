from typing import Dict, Any, Optional, List, Generator, Literal, Tuple
from enum import Enum
from concurrent.futures import ThreadPoolExecutor
import re as _re
from backend.agents.base import BaseAgent
from backend.agents.literature import LiteratureParserAgent
from backend.agents.relation import ProjectRelationAgent
from backend.agents.writing import WritingAgent
from backend.agents.todo import TodoAgent
from backend.agents.qa import QAAgent
from backend.agents.qa_policy import build_initial_policy, finalize_policy_after_retrieval
from backend.rag.retriever import RAGRetriever


def classify_evidence(refs: list[dict]) -> Literal["none", "weak", "reliable"]:
    paper_refs = [
        ref for ref in refs
        if ref.get("chunk_type") == "content"
        and ref.get("section_type") != "references"
        and not ref.get("is_reference")
    ]
    if not paper_refs:
        return "none"
    best = max((ref.get("score") or 0) for ref in paper_refs)
    if best >= 0.35:
        return "reliable"
    return "weak"

class TaskType(str, Enum):
    ANALYZE_DOCUMENT = "analyze_document"
    ASK_QUESTION = "ask_question"
    GENERATE_WRITING = "generate_writing"
    GENERATE_TODO = "generate_todo"

_TITLE_PATTERN = _re.compile(
    r'^\s*\*{0,2}'                     # optional leading whitespace + markdown bold open
    r'(?:Paper\s*Title|论文标题|标题)'   # label: Paper Title / 论文标题 / 标题
    r'\s*\*{0,2}'                       # optional markdown bold close
    r'\s*[:：]\s*'                       # colon (Chinese or English)
    r'(.+)'                             # capture the title (greedy)
    r'\s*$',                            # trailing whitespace + line end
    _re.MULTILINE | _re.IGNORECASE,
)

# Common non-title lines to skip when guessing from raw text
_SKIP_LINE_PREFIXES = (
    'abstract', '摘要', 'keywords', '关键词', 'introduction', '引言',
    'http', 'doi:', 'arxiv', '©', 'copyright',
    'this paper', 'in this', 'we present', 'we propose', 'our approach',
    '本文', '在这篇', '摘要：', '摘要:',
)


def _extract_paper_title(reading_card: str) -> Tuple[str, str]:
    """Extract paper title from reading card. Returns (title, cleaned_reading_card)."""
    match = _TITLE_PATTERN.search(reading_card)
    if match:
        title = match.group(1).strip().strip('*').strip()
        # Remove the matched line from the reading card
        start, end = match.span()
        cleaned = (reading_card[:start] + reading_card[end:]).lstrip('\n')
        return title, cleaned
    return '', reading_card


def _guess_title_from_text(text: str) -> str:
    """Heuristic: extract a plausible title from the first few lines of raw text."""
    lines = text.split('\n')[:10]
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if len(line) < 8 or len(line) > 300:
            continue
        # Skip lines that are clearly not titles
        lower = line.lower()
        if any(lower.startswith(p) for p in _SKIP_LINE_PREFIXES):
            continue
        # Skip lines that are mostly punctuation or numbers
        alpha_ratio = sum(1 for c in line if c.isalpha() or '一' <= c <= '鿿') / len(line)
        if alpha_ratio < 0.4:
            continue
        return line
    return ''


def _resolve_title(
    llm_title: str,
    text_chunks: List[str],
    pdf_title: str = '',
) -> str:
    """Pick the best title from available sources (priority order)."""
    if llm_title and llm_title != '未知标题':
        return llm_title
    if text_chunks:
        guessed = _guess_title_from_text(text_chunks[0])
        if guessed:
            return guessed
    if pdf_title and pdf_title.strip():
        return pdf_title.strip()
    return ''


class Orchestrator:
    """中央调度器，根据任务类型路由到对应 Agent"""

    def __init__(self, agents: Dict[str, BaseAgent], retriever: Optional[RAGRetriever] = None, card_retriever: Optional[Any] = None):
        self.agents = agents
        self.retriever = retriever
        self.card_retriever = card_retriever

    def route_task(self, task_type: str, **kwargs) -> Any:
        """纯规则路由，根据 task_type 调用对应 Agent"""
        try:
            task = TaskType(task_type)
        except ValueError:
            raise ValueError(f"Unknown task type: {task_type}. Valid types: {[t.value for t in TaskType]}")

        if task == TaskType.ANALYZE_DOCUMENT:
            return self._analyze_document(**kwargs)
        elif task == TaskType.ASK_QUESTION:
            return self._ask_question(**kwargs)
        elif task == TaskType.GENERATE_WRITING:
            return self._generate_writing(**kwargs)
        elif task == TaskType.GENERATE_TODO:
            return self._generate_todo(**kwargs)

    @staticmethod
    def _extract_relation_text(relation: Any) -> str:
        """Extract markdown analysis text from relation result (dict or legacy string)."""
        if isinstance(relation, dict):
            return relation.get("analysis", "")
        return relation

    def _analyze_document(self, text_chunks: List[str], research_context: str,
                          writing_style: str, progress_callback=None,
                          pdf_title: str = '') -> Dict[str, Any]:
        """文档分析流程：chunk 并行提取，后续 agent 串行"""
        # 1. 文献解析（chunk 并行提取）
        literature_result = self.agents["literature"].run(
            text_chunks=text_chunks,
            progress_callback=progress_callback
        )
        if isinstance(literature_result, dict):
            raw_reading_card = literature_result.get("reading_card", "")
            focused_signals = literature_result.get("focused_signals", [])
        else:
            raw_reading_card = literature_result
            focused_signals = []
        llm_title, reading_card = _extract_paper_title(raw_reading_card)
        paper_title = _resolve_title(llm_title, text_chunks, pdf_title)

        # 2. 项目关联
        relation = self.agents["relation"].run(
            reading_card=reading_card,
            user_research_context=research_context
        )
        relation_text = self._extract_relation_text(relation)
        decision_brief = relation.get("decision_brief", {}) if isinstance(relation, dict) else None

        # 3. 写作 + 任务规划并行（都依赖 reading_card + relation_text + decision_brief）
        with ThreadPoolExecutor(max_workers=2) as executor:
            future_writing = executor.submit(
                self.agents["writing"].run,
                reading_card=reading_card,
                relation_analysis=relation_text,
                writing_style=writing_style,
                decision_brief=decision_brief,
            )
            future_todo = executor.submit(
                self.agents["todo"].run,
                reading_card=reading_card,
                relation_analysis=relation_text,
                decision_brief=decision_brief,
            )
            writing_result = future_writing.result()
            todo = future_todo.result()

        # Writing agent now returns dict with writing_assets + writing_materials
        if isinstance(writing_result, dict):
            writing_text = writing_result.get("writing_materials", "")
            writing_assets = writing_result.get("writing_assets", {})
        else:
            writing_text = writing_result
            writing_assets = {}

        result = {
            "paper_title": paper_title,
            "reading_card": reading_card,
            "focused_signals": focused_signals,
            "relation_analysis": relation_text if isinstance(relation, dict) else relation,
            "writing_materials": writing_text,
            "writing_assets": writing_assets,
            "todo_list": todo,
        }
        if isinstance(relation, dict):
            result["fit_score"] = relation.get("fit_score")
            result["fit_reason"] = relation.get("fit_reason", "")
            result["relation_type"] = relation.get("relation_type", "unrelated")
            result["recommended_action"] = relation.get("recommended_action", "")
            result["suggested_placement"] = relation.get("suggested_placement", {})
            result["novelty_for_kb"] = relation.get("novelty_for_kb", "")
            result["readme_suggestions"] = relation.get("readme_suggestions", [])
            result["decision_brief"] = relation.get("decision_brief", {})
            result["knowledge_increment_score"] = relation.get("knowledge_increment_score")
            result["evidence_strength_score"] = relation.get("evidence_strength_score")
            result["actionability_score"] = relation.get("actionability_score")
        return result

    def run_streaming(self, task_type: str, **kwargs):
        """流式版本：chunk 并行提取，writing + todo 并行执行"""
        task = TaskType(task_type)
        if task != TaskType.ANALYZE_DOCUMENT:
            raise ValueError("Streaming only supports analyze_document")

        text_chunks = kwargs["text_chunks"]
        research_context = kwargs.get("research_context", "")
        writing_style = kwargs.get("writing_style", "")
        progress_callback = kwargs.get("progress_callback")
        pdf_title = kwargs.get("pdf_title", "")

        # 1. 文献解析（chunk 并行提取）
        yield {"step": "literature", "status": "running"}
        literature_result = self.agents["literature"].run(
            text_chunks=text_chunks,
            progress_callback=progress_callback,
        )
        if isinstance(literature_result, dict):
            raw_reading_card = literature_result.get("reading_card", "")
            focused_signals = literature_result.get("focused_signals", [])
        else:
            raw_reading_card = literature_result
            focused_signals = []
        llm_title, reading_card = _extract_paper_title(raw_reading_card)
        paper_title = _resolve_title(llm_title, text_chunks, pdf_title)
        yield {"step": "literature", "status": "done", "data": reading_card}
        if paper_title:
            yield {"step": "literature_meta", "data": {"paper_title": paper_title}}
        yield {"step": "focused_signals", "data": focused_signals}

        # 2. 关联分析
        yield {"step": "relation", "status": "running"}
        relation = self.agents["relation"].run(
            reading_card=reading_card,
            user_research_context=research_context,
        )
        relation_text = self._extract_relation_text(relation)
        decision_brief = relation.get("decision_brief", {}) if isinstance(relation, dict) else None
        yield {"step": "relation", "status": "done", "data": relation_text}

        # 3. 写作 + 待办并行
        yield {"step": "writing", "status": "running"}
        yield {"step": "todo", "status": "running"}
        with ThreadPoolExecutor(max_workers=2) as executor:
            future_writing = executor.submit(
                self.agents["writing"].run,
                reading_card=reading_card,
                relation_analysis=relation_text,
                writing_style=writing_style,
                decision_brief=decision_brief,
            )
            future_todo = executor.submit(
                self.agents["todo"].run,
                reading_card=reading_card,
                relation_analysis=relation_text,
                decision_brief=decision_brief,
            )
            writing_result = future_writing.result()
            todo = future_todo.result()

        # Writing agent now returns dict with writing_assets + writing_materials
        if isinstance(writing_result, dict):
            writing_text = writing_result.get("writing_materials", "")
            writing_assets = writing_result.get("writing_assets", {})
        else:
            writing_text = writing_result
            writing_assets = {}

        yield {"step": "writing", "status": "done", "data": writing_text}
        yield {"step": "todo", "status": "done", "data": todo}

        # Emit structured relation metadata as a separate event
        if isinstance(relation, dict):
            yield {"step": "relation_meta", "status": "done", "data": {
                "fit_score": relation.get("fit_score"),
                "fit_reason": relation.get("fit_reason", ""),
                "relation_type": relation.get("relation_type", "unrelated"),
                "recommended_action": relation.get("recommended_action", ""),
                "suggested_placement": relation.get("suggested_placement", {}),
                "novelty_for_kb": relation.get("novelty_for_kb", ""),
                "readme_suggestions": relation.get("readme_suggestions", []),
                "decision_brief": relation.get("decision_brief", {}),
                "knowledge_increment_score": relation.get("knowledge_increment_score"),
                "evidence_strength_score": relation.get("evidence_strength_score"),
                "actionability_score": relation.get("actionability_score"),
            }}

        # Emit structured writing assets as a separate event
        if writing_assets:
            yield {"step": "writing_meta", "status": "done", "data": writing_assets}

    def _ask_question(self, question: str, knowledge_base_id: Optional[str] = None,
                      knowledge_base_readme: str = "", global_profile: str = "",
                      nickname: str = "",
                      doc_ids: Optional[List[str]] = None,
                      mentioned_doc_ids: Optional[List[str]] = None,
                      conversation_history: Optional[List[Dict]] = None,
                      top_k_docs: int = 3, top_k_chunks: int = 5,
                      collection_names: Optional[List[str]] = None) -> Dict[str, Any]:
        if not self.retriever:
            raise ValueError("RAG retriever not configured")

        # --- Phase 1: Build initial policy from mention state ---
        policy = build_initial_policy(
            knowledge_base_id=knowledge_base_id,
            doc_ids=doc_ids,
            mentioned_doc_ids=mentioned_doc_ids,
            top_k_docs=top_k_docs,
            top_k_chunks=top_k_chunks,
        )

        # --- Phase 2a: Retrieve research cards first ---
        card_refs: List[Dict] = []
        if self.card_retriever:
            card_refs = self.card_retriever.retrieve(
                query=question,
                knowledge_base_id=policy.retrieval_scope.knowledge_base_id,
                doc_ids=policy.retrieval_scope.doc_ids,
                top_k=5,
            )

        # Filter card refs to respect strict mention scope
        if policy.retrieval_scope.strict_doc_scope and policy.retrieval_scope.doc_ids:
            allowed_doc_ids = set(policy.retrieval_scope.doc_ids)
            filtered_card_refs = []
            for ref in card_refs:
                linked_doc_ids = set(ref.get("linked_doc_ids") or [])
                if linked_doc_ids and not linked_doc_ids.intersection(allowed_doc_ids):
                    continue
                if ref.get("doc_id") and ref["doc_id"] not in allowed_doc_ids:
                    continue
                filtered_card_refs.append(ref)
            card_refs = filtered_card_refs

        # --- Phase 2b: Retrieve using policy scope ---
        retrieval = self.retriever.retrieve(
            query=question,
            knowledge_base_id=policy.retrieval_scope.knowledge_base_id,
            doc_ids=policy.retrieval_scope.doc_ids,
            top_k_docs=policy.limits.top_k_docs,
            top_k_chunks=policy.limits.top_k_chunks,
            collection_names=collection_names,
        )

        # --- Phase 3: Finalize policy based on retrieval quality ---
        reliable_card_refs = [ref for ref in card_refs if (ref.get("score") or 0) >= 0.35]
        all_source_refs = reliable_card_refs + retrieval.source_refs
        evidence_status = classify_evidence(all_source_refs)
        policy = finalize_policy_after_retrieval(policy, evidence_status=evidence_status)

        # Keep weak no-mention refs out of general answers
        if policy.answer_mode == "general":
            all_source_refs = []

        # --- Phase 4: Build context ---
        # README and global profile are background only, never evidence
        background_parts = []
        if global_profile.strip():
            background_parts.append(f"[Global Profile]\n{global_profile}")
        if knowledge_base_readme.strip():
            background_parts.append(f"[Knowledge Base Background]\n{knowledge_base_readme}")

        if policy.evidence_status == "none":
            # No evidence: background only, no source refs
            all_source_refs = []
            document_context = "\n\n".join(background_parts)
        else:
            # Weak or reliable: background labeled separately + evidence context
            context_parts = list(background_parts)
            if reliable_card_refs:
                card_context = "\n\n---\n\n".join(
                    f"[Research Card] {ref.get('card_id')}\n{ref.get('content')}"
                    for ref in reliable_card_refs[:5]
                )
                context_parts.append(card_context)
            if retrieval.context:
                context_parts.append(retrieval.context)
            document_context = "\n\n---\n\n".join(part for part in context_parts if part)

        # --- Phase 5: Call QA agent with mode, limits, and evidence status ---
        answer = self.agents["qa"].run(
            document_context=document_context,
            analysis_report="",
            question=question,
            conversation_history=conversation_history or [],
            user_name=nickname,
            answer_mode=policy.answer_mode,
            evidence_status=policy.evidence_status,
            max_answer_tokens=policy.limits.max_answer_tokens,
            max_context_chars=policy.limits.max_context_chars,
        )

        return {
            "answer": answer,
            "source_doc_ids": retrieval.source_doc_ids,
            "source_chunks": retrieval.chunks,
            "answer_mode": policy.answer_mode,
            "source_refs": all_source_refs,
            "evidence_status": policy.evidence_status,
        }

    def _generate_writing(self, reading_card: str, relation_analysis: str,
                          writing_style: str, decision_brief: dict | None = None) -> str:
        """生成写作素材"""
        return self.agents["writing"].run(
            reading_card=reading_card,
            relation_analysis=relation_analysis,
            writing_style=writing_style,
            decision_brief=decision_brief,
        )

    def _generate_todo(self, reading_card: str, relation_analysis: str,
                       decision_brief: dict | None = None) -> str:
        """生成任务清单"""
        return self.agents["todo"].run(
            reading_card=reading_card,
            relation_analysis=relation_analysis,
            decision_brief=decision_brief,
        )
