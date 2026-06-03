import os
import threading
from fastapi import APIRouter, HTTPException
from typing import Optional

from backend.core.config import ConfigManager
from backend.core.embedding import EmbeddingClient
from backend.core.storage import StorageManager
from backend.core.providers.factory import create_chat_provider, create_embedding_provider
from backend.rag.retriever import RAGRetriever
from backend.rag.indexer import DocumentIndexer
from backend.agents.orchestrator import Orchestrator
from backend.agents.literature import LiteratureParserAgent
from backend.agents.relation import ProjectRelationAgent
from backend.agents.writing import WritingAgent
from backend.agents.todo import TodoAgent
from backend.agents.qa import QAAgent
from backend.models.schemas import (
    KnowledgeIndexRequest,
    KnowledgeQARequest, KnowledgeQAResponse,
    ChatConfig, NormalizedEmbeddingConfig,
)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

_config_path = os.environ.get("NOTE_FORGE_CONFIG_PATH", "data/config.json")
config_manager = ConfigManager(_config_path)


# Module-level singletons (created once)
_storage = None
_embedding = None
_singleton_lock = threading.Lock()


def get_storage_and_embedding():
    """获取存储和 embedding (单例，线程安全)"""
    global _storage, _embedding
    if _storage is None:
        with _singleton_lock:
            if _storage is None:
                config = config_manager.load()
                knowledge_config = config.get("knowledge", {})

                _storage = StorageManager(
                    chroma_path=knowledge_config.get("chroma_path", "data/chroma"),
                )
                embedding_provider = _build_embedding_provider()
                norm = config_manager.load_normalized()
                emb = norm.get("embedding", {})
                _embedding = EmbeddingClient(
                    provider=embedding_provider,
                    model_name=emb.get("model", "text-embedding-3-small"),
                    dimensions=emb.get("dimensions", 1536),
                )

    return _storage, _embedding


def _build_provider(chat_config: Optional[ChatConfig] = None):
    """Build a ChatProvider from normalized config or legacy config."""
    if chat_config is not None:
        return create_chat_provider({
            "provider": chat_config.provider,
            "api_key": chat_config.api_key,
            "base_url": chat_config.base_url,
            "model": chat_config.model,
        })
    config = config_manager.load_normalized()
    chat = config.get("chat", {})
    return create_chat_provider({
        "provider": chat.get("provider", "openai_compatible"),
        "api_key": chat.get("apiKey", ""),
        "base_url": chat.get("baseUrl", "https://api.anthropic.com"),
        "model": chat.get("model", "claude-sonnet-4-20250514"),
    })


def _build_embedding_provider(embedding_config: Optional[NormalizedEmbeddingConfig] = None):
    """Build an EmbeddingProvider from normalized config or legacy config."""
    if embedding_config is not None:
        return create_embedding_provider({
            "provider": embedding_config.provider,
            "api_key": embedding_config.api_key,
            "base_url": embedding_config.base_url,
            "model": embedding_config.model,
        })
    config = config_manager.load_normalized()
    emb = config.get("embedding", {})
    return create_embedding_provider({
        "provider": emb.get("provider", "openai_compatible"),
        "api_key": emb.get("apiKey", ""),
        "base_url": emb.get("baseUrl", "https://api.openai.com/v1"),
        "model": emb.get("model", "text-embedding-3-small"),
    })


def get_orchestrator(chat_config: Optional[ChatConfig] = None, embedding_config: Optional[NormalizedEmbeddingConfig] = None):
    """获取配置好的 Orchestrator"""
    config = config_manager.load_normalized()
    chat = config.get("chat", {})
    model_name = chat.get("model", "claude-sonnet-4-20250514")

    storage, _ = get_storage_and_embedding()
    embedding_provider = _build_embedding_provider(embedding_config)
    config = config_manager.load_normalized()
    emb = config.get("embedding", {})
    embedding_client = EmbeddingClient(
        provider=embedding_provider,
        model_name=emb.get("model", "text-embedding-3-small"),
        dimensions=emb.get("dimensions", 1536),
    )
    retriever = RAGRetriever(storage, embedding_client)

    provider = _build_provider(chat_config)

    agents = {
        "literature": LiteratureParserAgent(model_name, provider=provider),
        "relation": ProjectRelationAgent(model_name, provider=provider),
        "writing": WritingAgent(model_name, provider=provider),
        "todo": TodoAgent(model_name, provider=provider),
        "qa": QAAgent(model_name, provider=provider)
    }

    return Orchestrator(agents=agents, retriever=retriever)


@router.post("/documents/gateway")
async def index_gateway_document(request: KnowledgeIndexRequest):
    try:
        storage, _ = get_storage_and_embedding()
        if request.embedding_config is not None:
            embedding_provider = _build_embedding_provider(request.embedding_config)
            emb_cfg = request.embedding_config
            embedding = EmbeddingClient(
                provider=embedding_provider,
                model_name=emb_cfg.model,
                dimensions=emb_cfg.dimensions,
            )
        else:
            _, embedding = get_storage_and_embedding()
        indexer = DocumentIndexer(storage, embedding)
        doc_id = indexer.index_document(
            doc_id=request.doc_id,
            knowledge_base_id=request.knowledge_base_id,
            file_name=request.file_name,
            file_path=request.file_path,
            chunks=request.chunks,
            summary=request.summary,
            analysis_result=request.analysis_result,
            tags=request.tags,
        )
        return {"doc_id": doc_id, "message": "Document indexed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ask")
async def ask_question(request: KnowledgeQARequest):
    """基于知识库回答问题"""
    try:
        orchestrator = get_orchestrator(request.chat_config, request.embedding_config)
        result = orchestrator.route_task(
            task_type="ask_question",
            question=request.question,
            knowledge_base_id=request.knowledge_base_id,
            knowledge_base_readme=request.knowledge_base_readme,
            global_profile=request.global_profile,
            nickname=request.nickname,
            doc_ids=request.doc_ids,
            top_k_docs=request.top_k_docs,
            top_k_chunks=request.top_k_chunks,
            conversation_history=request.conversation_history,
        )
        return KnowledgeQAResponse(
            answer=result["answer"],
            source_doc_ids=result["source_doc_ids"],
            source_chunks=result["source_chunks"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    """从知识库删除文档"""
    try:
        storage, embedding = get_storage_and_embedding()
        indexer = DocumentIndexer(storage, embedding)
        indexer.delete_document(doc_id)
        return {"message": "Document deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
