from typing import Dict, Any, Optional, List
from enum import Enum
from backend.agents.base import BaseAgent
from backend.agents.literature import LiteratureParserAgent
from backend.agents.relation import ProjectRelationAgent
from backend.agents.writing import WritingAgent
from backend.agents.todo import TodoAgent
from backend.agents.qa import QAAgent
from backend.rag.retriever import RAGRetriever

class TaskType(str, Enum):
    ANALYZE_DOCUMENT = "analyze_document"
    ASK_QUESTION = "ask_question"
    GENERATE_WRITING = "generate_writing"
    GENERATE_TODO = "generate_todo"

class Orchestrator:
    """中央调度器，根据任务类型路由到对应 Agent"""

    def __init__(self, agents: Dict[str, BaseAgent], retriever: Optional[RAGRetriever] = None):
        self.agents = agents
        self.retriever = retriever

    def route_task(self, task_type: str, **kwargs) -> Any:
        """纯规则路由，根据 task_type 调用对应 Agent"""
        if task_type == TaskType.ANALYZE_DOCUMENT:
            return self._analyze_document(**kwargs)
        elif task_type == TaskType.ASK_QUESTION:
            return self._ask_question(**kwargs)
        elif task_type == TaskType.GENERATE_WRITING:
            return self._generate_writing(**kwargs)
        elif task_type == TaskType.GENERATE_TODO:
            return self._generate_todo(**kwargs)
        else:
            raise ValueError(f"Unknown task type: {task_type}")

    def _analyze_document(self, text_chunks: List[str], research_context: str,
                          writing_style: str, progress_callback=None) -> Dict[str, Any]:
        """文档分析流程：串联调用各 Agent"""
        # 1. 文献解析
        reading_card = self.agents["literature"].run(
            text_chunks=text_chunks,
            progress_callback=progress_callback
        )

        # 2. 项目关联
        relation = self.agents["relation"].run(
            reading_card=reading_card,
            user_research_context=research_context
        )

        # 3. 写作辅助
        writing = self.agents["writing"].run(
            reading_card=reading_card,
            relation_analysis=relation,
            writing_style=writing_style
        )

        # 4. 任务规划
        todo = self.agents["todo"].run(
            reading_card=reading_card,
            relation_analysis=relation
        )

        return {
            "reading_card": reading_card,
            "relation_analysis": relation,
            "writing_materials": writing,
            "todo_list": todo
        }

    def _ask_question(self, question: str, doc_ids: Optional[List[str]] = None,
                      conversation_history: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """问答流程：RAG 检索 + QA Agent"""
        if not self.retriever:
            raise ValueError("RAG retriever not configured")

        # 1. RAG 检索
        retrieval = self.retriever.retrieve(
            query=question,
            doc_ids=doc_ids,
            top_k_docs=3,
            top_k_chunks=5
        )

        # 2. QA Agent 回答
        answer = self.agents["qa"].run(
            document_context=retrieval.context,
            analysis_report="",
            question=question,
            conversation_history=conversation_history or []
        )

        return {
            "answer": answer,
            "source_doc_ids": retrieval.source_doc_ids,
            "source_chunks": retrieval.chunks
        }

    def _generate_writing(self, reading_card: str, relation_analysis: str,
                          writing_style: str) -> str:
        """生成写作素材"""
        return self.agents["writing"].run(
            reading_card=reading_card,
            relation_analysis=relation_analysis,
            writing_style=writing_style
        )

    def _generate_todo(self, reading_card: str, relation_analysis: str) -> str:
        """生成任务清单"""
        return self.agents["todo"].run(
            reading_card=reading_card,
            relation_analysis=relation_analysis
        )
