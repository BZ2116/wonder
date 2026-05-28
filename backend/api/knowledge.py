import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import List, Optional

from backend.core.config import ConfigManager
from backend.core.file_reader import read_file, clean_text
from backend.core.chunker import chunk_text
from backend.core.embedding import EmbeddingClient
from backend.core.storage import StorageManager
from backend.rag.retriever import RAGRetriever
from backend.rag.indexer import DocumentIndexer
from backend.agents.orchestrator import Orchestrator
from backend.agents.literature import LiteratureParserAgent
from backend.agents.relation import ProjectRelationAgent
from backend.agents.writing import WritingAgent
from backend.agents.todo import TodoAgent
from backend.agents.qa import QAAgent
from backend.models.schemas import (
    KnowledgeQARequest, KnowledgeQAResponse,
    SearchRequest, SearchResponse,
    DocumentListResponse, DocumentDetailResponse
)
from openai import OpenAI

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

config_manager = ConfigManager("data/config.json")


# Module-level singletons (created once)
_storage = None
_embedding = None


def get_storage_and_embedding():
    """获取存储和 embedding (单例)"""
    global _storage, _embedding
    if _storage is None:
        config = config_manager.load()
        knowledge_config = config.get("knowledge", {})
        embedding_config = config.get("embedding", {})

        _storage = StorageManager(
            chroma_path=knowledge_config.get("chroma_path", "data/chroma"),
            sqlite_path=knowledge_config.get("sqlite_path", "data/knowledge.db")
        )
        _embedding = EmbeddingClient.from_config(embedding_config)

    return _storage, _embedding


def get_orchestrator():
    """获取配置好的 Orchestrator"""
    config = config_manager.load()
    model_config = config.get("model", {})

    storage, embedding = get_storage_and_embedding()
    retriever = RAGRetriever(storage, embedding)

    # Create LLM client (same pattern as analysis.py)
    provider = model_config.get("provider", "MiniMax")
    api_type = "anthropic" if provider == "Anthropic" else "openai"

    if api_type == "openai":
        client = OpenAI(
            api_key=model_config.get("api_key", ""),
            base_url=model_config.get("base_url", "")
        )
    else:
        client = None  # Anthropic uses direct HTTP

    client_params = {
        "client": client,
        "model": model_config.get("model_name", "MiniMax-M2.7"),
        "api_type": api_type,
        "api_key": model_config.get("api_key", ""),
        "base_url": model_config.get("base_url", "")
    }

    agents = {
        "literature": LiteratureParserAgent(**client_params),
        "relation": ProjectRelationAgent(**client_params),
        "writing": WritingAgent(**client_params),
        "todo": TodoAgent(**client_params),
        "qa": QAAgent(**client_params)
    }

    return Orchestrator(agents=agents, retriever=retriever)


@router.post("/documents")
async def index_document(
    file: UploadFile = File(...),
    max_chars: int = Form(7000),
    overlap: int = Form(500),
):
    """上传文档 → 分析 → 入库"""
    try:
        # 1. 读取文档
        file_bytes = await file.read()
        safe_filename = os.path.basename(file.filename) if file.filename else ""
        if not safe_filename or '/' in safe_filename or '\\' in safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        file_path = f"data/uploads/{safe_filename}"
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(file_bytes)

        raw_text = read_file(safe_filename, file_bytes)
        text = clean_text(raw_text)

        if not text.strip():
            raise HTTPException(status_code=400, detail="No text extracted from file.")

        # 2. 分块
        chunks = chunk_text(text, max_chars, overlap)

        # 3. Agent 分析
        config = config_manager.load()
        orchestrator = get_orchestrator()
        analysis_result = orchestrator.route_task(
            task_type="analyze_document",
            text_chunks=chunks,
            research_context=config.get("research", {}).get("background", ""),
            writing_style=config.get("research", {}).get("writing_style", "")
        )

        # 4. 生成摘要
        summary = analysis_result["reading_card"].split("\n")[0][:200]

        # 5. 入库
        storage, embedding = get_storage_and_embedding()
        indexer = DocumentIndexer(storage, embedding)
        doc_id = indexer.index_document(
            file_name=safe_filename,
            file_path=file_path,
            chunks=chunks,
            summary=summary,
            analysis_result=analysis_result
        )

        return {"doc_id": doc_id, "message": "Document indexed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ask")
async def ask_question(request: KnowledgeQARequest):
    """基于知识库回答问题"""
    try:
        orchestrator = get_orchestrator()
        result = orchestrator.route_task(
            task_type="ask_question",
            question=request.question,
            doc_ids=request.doc_ids,
            top_k_docs=request.top_k_docs,
            top_k_chunks=request.top_k_chunks
        )
        return KnowledgeQAResponse(
            answer=result["answer"],
            source_doc_ids=result["source_doc_ids"],
            source_chunks=result["source_chunks"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search_knowledge(request: SearchRequest):
    """搜索知识库，返回相关片段"""
    try:
        storage, embedding = get_storage_and_embedding()
        retriever = RAGRetriever(storage, embedding)
        results = retriever.search(
            query=request.query,
            doc_ids=request.doc_ids,
            top_k=request.top_k
        )
        return SearchResponse(results=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents")
async def list_documents():
    """获取知识库中的文档列表"""
    try:
        storage, _ = get_storage_and_embedding()
        documents = storage.list_documents()
        return DocumentListResponse(
            documents=documents,
            total=len(documents)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{doc_id}")
async def get_document(doc_id: str):
    """获取文档详情（含分析结果）"""
    try:
        storage, _ = get_storage_and_embedding()
        doc = storage.get_document(doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return DocumentDetailResponse(**doc)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    """从知识库删除文档"""
    try:
        storage, embedding = get_storage_and_embedding()
        doc = storage.get_document(doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        indexer = DocumentIndexer(storage, embedding)
        indexer.delete_document(doc_id)
        return {"message": "Document deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
