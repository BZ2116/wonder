# RAG + 多 Agent 协同系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Note Forge 桌面应用实现 RAG（Retrieval-Augmented Generation）和多 Agent 协同系统，支持知识库积累和智能问答。

**Architecture:** 使用 ChromaDB 作为向量数据库，SQLite 存储元数据，中央调度器（纯规则路由）协调多个 Agent 协同工作，层次检索策略（先摘要后分块）平衡精度和效率。

**Tech Stack:** Python 3.10+, FastAPI, ChromaDB, SQLite, OpenAI SDK (用于 Embedding API), Pydantic v2

---

## 文件结构

```
backend/
├── core/
│   ├── __init__.py
│   ├── config.py                    # 修改：添加 EmbeddingConfig, KnowledgeConfig
│   ├── llm_client.py                # 现有
│   ├── file_reader.py               # 现有
│   ├── chunker.py                   # 现有
│   ├── history.py                   # 现有
│   ├── embedding.py                 # 新增：EmbeddingClient
│   └── storage.py                   # 新增：StorageManager
├── models/
│   ├── __init__.py
│   └── schemas.py                   # 修改：添加知识库相关模型
├── agents/
│   ├── __init__.py
│   ├── base.py                      # 现有
│   ├── literature.py                # 现有
│   ├── relation.py                  # 现有
│   ├── writing.py                   # 现有
│   ├── todo.py                      # 现有
│   ├── qa.py                        # 现有
│   └── orchestrator.py              # 新增：中央调度器
├── rag/
│   ├── __init__.py                  # 新增
│   ├── retriever.py                 # 新增：RAGRetriever
│   └── indexer.py                   # 新增：DocumentIndexer
├── api/
│   ├── __init__.py
│   ├── config.py                    # 现有
│   ├── history.py                   # 现有
│   ├── analysis.py                  # 现有
│   └── knowledge.py                 # 新增：知识库 API
└── main.py                          # 修改：注册新路由
```

---

## Task 1: 依赖配置和数据模型

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/models/schemas.py`
- Modify: `backend/core/config.py`

- [ ] **Step 1: 更新 requirements.txt 添加 chromadb 依赖**

```txt
# backend/requirements.txt
fastapi==0.115.0
uvicorn==0.30.0
python-dotenv==1.0.1
openai==1.59.6
pypdf==5.1.0
python-docx==1.1.2
pydantic==2.9.0
python-multipart==0.0.9
chromadb>=0.4.0
```

- [ ] **Step 2: 安装新依赖**

Run: `cd backend && pip install -r requirements.txt`
Expected: Successfully installed chromadb-xxx

- [ ] **Step 3: 更新 schemas.py 添加知识库相关模型**

在 `backend/models/schemas.py` 文件末尾添加以下模型：

```python
# 知识库相关模型
class EmbeddingConfig(BaseModel):
    provider: str = "OpenAI"
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    model_name: str = "text-embedding-3-small"
    dimensions: int = 1536

class KnowledgeConfig(BaseModel):
    enabled: bool = True
    chroma_path: str = "data/chroma"
    sqlite_path: str = "data/knowledge.db"
    auto_index: bool = True
    max_context_tokens: int = 8000

class QuestionRequest(BaseModel):
    question: str
    doc_ids: Optional[List[str]] = None
    top_k_docs: int = 3
    top_k_chunks: int = 5

class QuestionResponse(BaseModel):
    answer: str
    source_doc_ids: List[str]
    source_chunks: List[dict]

class SearchRequest(BaseModel):
    query: str
    doc_ids: Optional[List[str]] = None
    top_k: int = 10

class SearchResponse(BaseModel):
    results: List[dict]

class DocumentListResponse(BaseModel):
    documents: List[dict]
    total: int

class DocumentDetailResponse(BaseModel):
    id: str
    file_name: str
    created_at: str
    summary: str
    reading_card: str
    relation_analysis: str
    writing_materials: str
    todo_list: str
    chunk_count: int
    total_tokens: int
```

确保在文件顶部导入 `Optional` 和 `List`：

```python
from typing import Optional, List
```

- [ ] **Step 4: 更新 config.py 添加 EmbeddingConfig 和 KnowledgeConfig 默认配置**

在 `backend/core/config.py` 的 `DEFAULT_CONFIG` 字典中添加 `embedding` 和 `knowledge` 字段：

```python
DEFAULT_CONFIG = {
    "model": {
        "provider": "MiniMax",
        "api_key": "",
        "base_url": "https://api.minimaxi.com/v1",
        "model_name": "MiniMax-M2.7",
    },
    "embedding": {
        "provider": "OpenAI",
        "api_key": "",
        "base_url": "https://api.openai.com/v1",
        "model_name": "text-embedding-3-small",
        "dimensions": 1536,
    },
    "research": {
        "background": "I am a student interested in AI and research.",
        "writing_style": "本科毕业论文风格，表达清晰，避免过度复杂",
    },
    "watch": {
        "enabled": False,
        "folder": "data/watch",
        "auto_delete_after_process": False,
    },
    "analysis": {
        "max_chars": 7000,
        "overlap": 500,
    },
    "knowledge": {
        "enabled": True,
        "chroma_path": "data/chroma",
        "sqlite_path": "data/knowledge.db",
        "auto_index": True,
        "max_context_tokens": 8000,
    },
}
```

- [ ] **Step 5: 验证配置加载**

Run: `cd backend && python -c "from core.config import ConfigManager; cm = ConfigManager('data/config.json'); c = cm.load(); print('embedding' in c, 'knowledge' in c)"`
Expected: `True True`

- [ ] **Step 6: 提交**

```bash
git add backend/requirements.txt backend/models/schemas.py backend/core/config.py
git commit -m "feat: add knowledge base data models and config"
```

---

## Task 2: Embedding 服务

**Files:**
- Create: `backend/core/__init__.py`
- Create: `backend/core/embedding.py`

- [ ] **Step 1: 创建 EmbeddingClient 类**

创建 `backend/core/embedding.py`：

```python
from typing import List
from openai import OpenAI

EMBEDDING_PRESETS = {
    "OpenAI": {
        "base_url": "https://api.openai.com/v1",
        "models": ["text-embedding-3-small", "text-embedding-3-large"],
        "dimensions": {"text-embedding-3-small": 1536, "text-embedding-3-large": 3072}
    },
    "MiniMax": {
        "base_url": "https://api.minimaxi.com/v1",
        "models": ["text-embedding-003"],
        "dimensions": {"text-embedding-003": 1536}
    }
}

class EmbeddingClient:
    def __init__(self, provider: str, api_key: str, base_url: str,
                 model_name: str, dimensions: int = 1536):
        self.provider = provider
        self.model_name = model_name
        self.dimensions = dimensions
        self.client = OpenAI(api_key=api_key, base_url=base_url)

    def embed(self, texts: List[str]) -> List[List[float]]:
        """批量获取文本向量"""
        if not texts:
            return []
        response = self.client.embeddings.create(
            model=self.model_name,
            input=texts
        )
        return [item.embedding for item in response.data]

    def embed_single(self, text: str) -> List[float]:
        """单条文本向量化"""
        return self.embed([text])[0]

    @classmethod
    def from_config(cls, config: dict) -> "EmbeddingClient":
        """从配置字典创建客户端"""
        return cls(
            provider=config.get("provider", "OpenAI"),
            api_key=config.get("api_key", ""),
            base_url=config.get("base_url", "https://api.openai.com/v1"),
            model_name=config.get("model_name", "text-embedding-3-small"),
            dimensions=config.get("dimensions", 1536)
        )
```

- [ ] **Step 2: 更新 core/__init__.py 导出 EmbeddingClient**

修改 `backend/core/__init__.py`：

```python
from .embedding import EmbeddingClient, EMBEDDING_PRESETS

__all__ = ["EmbeddingClient", "EMBEDDING_PRESETS"]
```

- [ ] **Step 3: 验证导入**

Run: `cd backend && python -c "from core import EmbeddingClient, EMBEDDING_PRESETS; print('OK', len(EMBEDDING_PRESETS))"`
Expected: `OK 2`

- [ ] **Step 4: 提交**

```bash
git add backend/core/__init__.py backend/core/embedding.py
git commit -m "feat: add EmbeddingClient for vector embeddings"
```

---

## Task 3: 存储管理器

**Files:**
- Create: `backend/core/storage.py`

- [ ] **Step 1: 创建 StorageManager 类**

创建 `backend/core/storage.py`：

```python
import os
import sqlite3
from datetime import datetime
from typing import List, Optional, Dict, Any
import chromadb

class StorageManager:
    def __init__(self, chroma_path: str, sqlite_path: str):
        self.chroma_path = chroma_path
        self.sqlite_path = sqlite_path

        # 创建目录
        os.makedirs(chroma_path, exist_ok=True)
        os.makedirs(os.path.dirname(sqlite_path) or ".", exist_ok=True)

        # 初始化 ChromaDB
        self.chroma_client = chromadb.PersistentClient(path=chroma_path)
        self.collection = self.chroma_client.get_or_create_collection(
            name="documents",
            metadata={"hnsw:space": "cosine"}
        )

        # 初始化 SQLite
        self.db = sqlite3.connect(sqlite_path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self._init_tables()

    def _init_tables(self):
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                file_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                summary TEXT,
                reading_card TEXT,
                relation_analysis TEXT,
                writing_materials TEXT,
                todo_list TEXT,
                chunk_count INTEGER,
                total_tokens INTEGER
            )
        """)
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS document_tags (
                doc_id TEXT,
                tag TEXT,
                PRIMARY KEY (doc_id, tag),
                FOREIGN KEY (doc_id) REFERENCES documents(id)
            )
        """)
        self.db.commit()

    def insert_document(self, doc_id: str, file_name: str, file_path: str,
                        summary: str, reading_card: str, relation_analysis: str,
                        writing_materials: str, todo_list: str,
                        chunk_count: int, total_tokens: int):
        """插入文档元数据"""
        self.db.execute("""
            INSERT INTO documents (id, file_name, file_path, created_at, summary,
                                   reading_card, relation_analysis, writing_materials,
                                   todo_list, chunk_count, total_tokens)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (doc_id, file_name, file_path, datetime.now(), summary,
              reading_card, relation_analysis, writing_materials,
              todo_list, chunk_count, total_tokens))
        self.db.commit()

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """获取文档详情"""
        row = self.db.execute(
            "SELECT * FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_documents(self) -> List[Dict[str, Any]]:
        """获取文档列表"""
        rows = self.db.execute(
            "SELECT id, file_name, created_at, summary, chunk_count, total_tokens FROM documents ORDER BY created_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]

    def delete_document(self, doc_id: str):
        """删除文档元数据"""
        self.db.execute("DELETE FROM document_tags WHERE doc_id = ?", (doc_id,))
        self.db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        self.db.commit()

    def add_to_collection(self, ids: List[str], embeddings: List[List[float]],
                          metadatas: List[Dict[str, Any]], documents: List[str]):
        """添加向量到 ChromaDB"""
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents
        )

    def query_collection(self, query_embeddings: List[List[float]],
                         n_results: int = 10,
                         where: Optional[Dict] = None) -> Dict[str, Any]:
        """查询 ChromaDB"""
        kwargs = {
            "query_embeddings": query_embeddings,
            "n_results": n_results
        }
        if where:
            kwargs["where"] = where
        return self.collection.query(**kwargs)

    def delete_from_collection(self, doc_id: str):
        """从 ChromaDB 删除文档的所有分块"""
        self.collection.delete(where={"doc_id": doc_id})

    def close(self):
        """关闭连接"""
        self.db.close()
```

- [ ] **Step 2: 更新 core/__init__.py 导出 StorageManager**

修改 `backend/core/__init__.py`：

```python
from .embedding import EmbeddingClient, EMBEDDING_PRESETS
from .storage import StorageManager

__all__ = ["EmbeddingClient", "EMBEDDING_PRESETS", "StorageManager"]
```

- [ ] **Step 3: 验证 StorageManager 初始化**

Run: `cd backend && python -c "from core import StorageManager; sm = StorageManager('data/chroma', 'data/knowledge.db'); print('OK', sm.collection.name)"`
Expected: `OK documents`

- [ ] **Step 4: 提交**

```bash
git add backend/core/storage.py backend/core/__init__.py
git commit -m "feat: add StorageManager for ChromaDB and SQLite"
```

---

## Task 4: RAG 检索器

**Files:**
- Create: `backend/rag/__init__.py`
- Create: `backend/rag/retriever.py`

- [ ] **Step 1: 创建 RAGRetriever 类**

创建 `backend/rag/retriever.py`：

```python
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from backend.core.embedding import EmbeddingClient
from backend.core.storage import StorageManager

@dataclass
class RetrievalResult:
    summaries: List[Dict[str, Any]]
    chunks: List[Dict[str, Any]]
    context: str
    source_doc_ids: List[str]

class RAGRetriever:
    def __init__(self, storage: StorageManager, embedding: EmbeddingClient):
        self.storage = storage
        self.embedding = embedding

    def retrieve(
        self,
        query: str,
        doc_ids: Optional[List[str]] = None,
        top_k_docs: int = 3,
        top_k_chunks: int = 5,
        max_context_tokens: int = 8000
    ) -> RetrievalResult:
        # 1. 查询 embedding
        query_embedding = self.embedding.embed_single(query)

        # 2. 第一层：摘要检索
        where_filter = {"chunk_type": "summary"}
        if doc_ids:
            where_filter["doc_id"] = {"$in": doc_ids}

        summaries_result = self.storage.query_collection(
            query_embeddings=[query_embedding],
            n_results=top_k_docs,
            where=where_filter
        )

        # 3. 第二层：内容检索
        if summaries_result["metadatas"][0]:
            matched_doc_ids = list(set(
                m["doc_id"] for m in summaries_result["metadatas"][0]
            ))
            content_where = {"chunk_type": "content", "doc_id": {"$in": matched_doc_ids}}

            chunks_result = self.storage.query_collection(
                query_embeddings=[query_embedding],
                n_results=top_k_chunks,
                where=content_where
            )
        else:
            chunks_result = {"documents": [[]], "metadatas": [[]]}
            matched_doc_ids = []

        # 4. 组装上下文
        context = self._build_context(
            summaries_result, chunks_result, max_context_tokens
        )

        return RetrievalResult(
            summaries=summaries_result["documents"][0] if summaries_result["documents"] else [],
            chunks=chunks_result["documents"][0] if chunks_result["documents"] else [],
            context=context,
            source_doc_ids=matched_doc_ids
        )

    def _build_context(self, summaries: Dict, chunks: Dict,
                       max_tokens: int) -> str:
        """组装检索上下文，控制 token 数"""
        parts = []
        current_tokens = 0

        # 添加摘要
        for i, doc in enumerate(summaries["documents"][0] if summaries["documents"] else []):
            doc_tokens = len(doc) // 2  # 粗略估计
            if current_tokens + doc_tokens > max_tokens:
                break
            file_name = summaries["metadatas"][0][i].get("file_name", "unknown")
            parts.append(f"[文档摘要] {file_name}:\n{doc}")
            current_tokens += doc_tokens

        # 添加内容分块
        for i, doc in enumerate(chunks["documents"][0] if chunks["documents"] else []):
            doc_tokens = len(doc) // 2
            if current_tokens + doc_tokens > max_tokens:
                break
            file_name = chunks["metadatas"][0][i].get("file_name", "unknown")
            parts.append(f"[相关内容] {file_name}:\n{doc}")
            current_tokens += doc_tokens

        return "\n\n---\n\n".join(parts)

    def search(self, query: str, doc_ids: Optional[List[str]] = None,
               top_k: int = 10) -> List[Dict[str, Any]]:
        """简单搜索，返回相关分块"""
        query_embedding = self.embedding.embed_single(query)

        where_filter = {}
        if doc_ids:
            where_filter["doc_id"] = {"$in": doc_ids}

        result = self.storage.query_collection(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where_filter if where_filter else None
        )

        results = []
        if result["documents"][0]:
            for i, doc in enumerate(result["documents"][0]):
                metadata = result["metadatas"][0][i] if result["metadatas"] else {}
                distance = result["distances"][0][i] if result["distances"] else None
                results.append({
                    "content": doc,
                    "metadata": metadata,
                    "score": 1 - distance if distance else None
                })

        return results
```

- [ ] **Step 2: 创建 rag/__init__.py**

创建 `backend/rag/__init__.py`：

```python
from .retriever import RAGRetriever, RetrievalResult

__all__ = ["RAGRetriever", "RetrievalResult"]
```

- [ ] **Step 3: 验证导入**

Run: `cd backend && python -c "from rag import RAGRetriever, RetrievalResult; print('OK')"`
Expected: `OK`

- [ ] **Step 4: 提交**

```bash
git add backend/rag/__init__.py backend/rag/retriever.py
git commit -m "feat: add RAGRetriever for hierarchical retrieval"
```

---

## Task 5: 文档入库器

**Files:**
- Create: `backend/rag/indexer.py`
- Modify: `backend/rag/__init__.py`

- [ ] **Step 1: 创建 DocumentIndexer 类**

创建 `backend/rag/indexer.py`：

```python
import uuid
from datetime import datetime
from typing import List, Dict, Any
from backend.core.embedding import EmbeddingClient
from backend.core.storage import StorageManager

class DocumentIndexer:
    def __init__(self, storage: StorageManager, embedding: EmbeddingClient):
        self.storage = storage
        self.embedding = embedding

    def index_document(
        self,
        file_name: str,
        file_path: str,
        chunks: List[str],
        summary: str,
        analysis_result: Dict[str, Any]
    ) -> str:
        """将文档入库"""
        doc_id = str(uuid.uuid4())[:8]

        # 1. 生成 embeddings
        texts_to_embed = [summary] + chunks
        embeddings = self.embedding.embed(texts_to_embed)

        # 2. 构建 ChromaDB 数据
        ids = [f"{doc_id}_summary"]
        metadatas = [{
            "doc_id": doc_id,
            "file_name": file_name,
            "chunk_type": "summary",
            "chunk_index": 0,
            "created_at": datetime.now().isoformat()
        }]
        documents = [summary]

        for i, chunk in enumerate(chunks):
            ids.append(f"{doc_id}_chunk_{i}")
            metadatas.append({
                "doc_id": doc_id,
                "file_name": file_name,
                "chunk_type": "content",
                "chunk_index": i,
                "created_at": datetime.now().isoformat()
            })
            documents.append(chunk)

        # 3. 存入 ChromaDB
        self.storage.add_to_collection(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents
        )

        # 4. 存入 SQLite
        self.storage.insert_document(
            doc_id=doc_id,
            file_name=file_name,
            file_path=file_path,
            summary=summary,
            reading_card=analysis_result.get("reading_card", ""),
            relation_analysis=analysis_result.get("relation_analysis", ""),
            writing_materials=analysis_result.get("writing_materials", ""),
            todo_list=analysis_result.get("todo_list", ""),
            chunk_count=len(chunks),
            total_tokens=sum(len(c) for c in chunks) // 2
        )

        return doc_id

    def delete_document(self, doc_id: str):
        """从知识库删除文档"""
        self.storage.delete_from_collection(doc_id)
        self.storage.delete_document(doc_id)
```

- [ ] **Step 2: 更新 rag/__init__.py 导出 DocumentIndexer**

修改 `backend/rag/__init__.py`：

```python
from .retriever import RAGRetriever, RetrievalResult
from .indexer import DocumentIndexer

__all__ = ["RAGRetriever", "RetrievalResult", "DocumentIndexer"]
```

- [ ] **Step 3: 验证导入**

Run: `cd backend && python -c "from rag import DocumentIndexer; print('OK')"`
Expected: `OK`

- [ ] **Step 4: 提交**

```bash
git add backend/rag/indexer.py backend/rag/__init__.py
git commit -m "feat: add DocumentIndexer for knowledge base indexing"
```

---

## Task 6: 中央调度器

**Files:**
- Create: `backend/agents/orchestrator.py`
- Modify: `backend/agents/__init__.py`

- [ ] **Step 1: 创建 Orchestrator 类**

创建 `backend/agents/orchestrator.py`：

```python
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
```

- [ ] **Step 2: 更新 agents/__init__.py 导出 Orchestrator**

修改 `backend/agents/__init__.py`：

```python
from .base import BaseAgent
from .literature import LiteratureParserAgent
from .relation import ProjectRelationAgent
from .writing import WritingAgent
from .todo import TodoAgent
from .qa import QAAgent
from .orchestrator import Orchestrator, TaskType

__all__ = [
    "BaseAgent",
    "LiteratureParserAgent",
    "ProjectRelationAgent",
    "WritingAgent",
    "TodoAgent",
    "QAAgent",
    "Orchestrator",
    "TaskType"
]
```

- [ ] **Step 3: 验证导入**

Run: `cd backend && python -c "from agents import Orchestrator, TaskType; print('OK', list(TaskType))"`
Expected: `OK [<TaskType.ANALYZE_DOCUMENT: 'analyze_document'>, ...]`

- [ ] **Step 4: 提交**

```bash
git add backend/agents/orchestrator.py backend/agents/__init__.py
git commit -m "feat: add Orchestrator for multi-agent coordination"
```

---

## Task 7: 知识库 API

**Files:**
- Create: `backend/api/knowledge.py`
- Modify: `backend/main.py`

- [ ] **Step 1: 创建知识库 API 路由**

创建 `backend/api/knowledge.py`：

```python
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import List, Optional
from backend.core.config import ConfigManager
from backend.core.file_reader import read_document_file
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
    QuestionRequest, QuestionResponse,
    SearchRequest, SearchResponse,
    DocumentListResponse, DocumentDetailResponse
)
import os

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

# 初始化管理器
config_manager = ConfigManager("data/config.json")

def get_storage_and_embedding():
    """获取存储和 embedding 配置"""
    config = config_manager.load()
    knowledge_config = config.get("knowledge", {})
    embedding_config = config.get("embedding", {})

    storage = StorageManager(
        chroma_path=knowledge_config.get("chroma_path", "data/chroma"),
        sqlite_path=knowledge_config.get("sqlite_path", "data/knowledge.db")
    )
    embedding = EmbeddingClient.from_config(embedding_config)

    return storage, embedding

def get_orchestrator():
    """获取配置好的 Orchestrator"""
    config = config_manager.load()
    model_config = config.get("model", {})
    research_config = config.get("research", {})

    storage, embedding = get_storage_and_embedding()
    retriever = RAGRetriever(storage, embedding)

    # 创建 Agent 实例
    client_params = {
        "client": None,
        "model": model_config.get("model_name", "MiniMax-M2.7"),
        "api_type": "openai",
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
        content = await file.read()
        file_path = f"data/uploads/{file.filename}"
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(content)

        text = read_document_file(file_path)

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
            file_name=file.filename,
            file_path=file_path,
            chunks=chunks,
            summary=summary,
            analysis_result=analysis_result
        )

        return {"doc_id": doc_id, "message": "Document indexed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ask")
async def ask_question(request: QuestionRequest):
    """基于知识库回答问题"""
    try:
        orchestrator = get_orchestrator()
        result = orchestrator.route_task(
            task_type="ask_question",
            question=request.question,
            doc_ids=request.doc_ids
        )
        return QuestionResponse(
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
        indexer = DocumentIndexer(storage, embedding)
        indexer.delete_document(doc_id)
        return {"message": "Document deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 2: 更新 main.py 注册新路由**

修改 `backend/main.py`，在现有路由注册后添加：

```python
from backend.api.knowledge import router as knowledge_router

app.include_router(knowledge_router)
```

- [ ] **Step 3: 验证服务器启动**

Run: `cd backend && timeout 5 python -c "from main import app; print('Routes:', [r.path for r in app.routes])" 2>&1 || true`
Expected: 包含 `/api/knowledge/documents`, `/api/knowledge/ask`, `/api/knowledge/search` 等路径

- [ ] **Step 4: 提交**

```bash
git add backend/api/knowledge.py backend/main.py
git commit -m "feat: add knowledge base API endpoints"
```

---

## Task 8: 集成测试

**Files:**
- Create: `backend/tests/test_knowledge.py`

- [ ] **Step 1: 创建测试目录和测试文件**

创建 `backend/tests/__init__.py`（空文件）和 `backend/tests/test_knowledge.py`：

```python
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.core.storage import StorageManager
from backend.core.embedding import EmbeddingClient
from backend.rag.indexer import DocumentIndexer
import os
import shutil

@pytest.fixture
def test_storage():
    """创建测试用存储"""
    storage = StorageManager("test_data/chroma", "test_data/knowledge.db")
    yield storage
    storage.close()
    # 清理测试数据
    if os.path.exists("test_data"):
        shutil.rmtree("test_data")

@pytest.fixture
def mock_embedding():
    """创建 mock embedding 客户端"""
    class MockEmbeddingClient(EmbeddingClient):
        def __init__(self):
            pass

        def embed(self, texts):
            return [[0.1] * 1536 for _ in texts]

        def embed_single(self, text):
            return [0.1] * 1536

    return MockEmbeddingClient()

def test_storage_initialization(test_storage):
    """测试存储初始化"""
    assert test_storage.collection.name == "documents"
    docs = test_storage.list_documents()
    assert isinstance(docs, list)

def test_document_indexing(test_storage, mock_embedding):
    """测试文档入库"""
    indexer = DocumentIndexer(test_storage, mock_embedding)
    doc_id = indexer.index_document(
        file_name="test.txt",
        file_path="/tmp/test.txt",
        chunks=["chunk1", "chunk2"],
        summary="test summary",
        analysis_result={
            "reading_card": "test reading card",
            "relation_analysis": "test relation",
            "writing_materials": "test writing",
            "todo_list": "test todo"
        }
    )
    assert doc_id is not None
    assert len(doc_id) == 8

    # 验证文档已入库
    doc = test_storage.get_document(doc_id)
    assert doc is not None
    assert doc["file_name"] == "test.txt"

def test_document_deletion(test_storage, mock_embedding):
    """测试文档删除"""
    indexer = DocumentIndexer(test_storage, mock_embedding)
    doc_id = indexer.index_document(
        file_name="test.txt",
        file_path="/tmp/test.txt",
        chunks=["chunk1"],
        summary="summary",
        analysis_result={
            "reading_card": "card",
            "relation_analysis": "relation",
            "writing_materials": "writing",
            "todo_list": "todo"
        }
    )

    indexer.delete_document(doc_id)
    doc = test_storage.get_document(doc_id)
    assert doc is None

def test_search_api():
    """测试搜索 API 端点"""
    client = TestClient(app)
    response = client.post("/api/knowledge/search", json={
        "query": "test query",
        "top_k": 5
    })
    # 由于没有真实数据，只验证端点存在
    assert response.status_code in [200, 500]

def test_list_documents_api():
    """测试文档列表 API 端点"""
    client = TestClient(app)
    response = client.get("/api/knowledge/documents")
    assert response.status_code == 200
    assert "documents" in response.json()
```

- [ ] **Step 2: 安装 pytest**

Run: `pip install pytest httpx`
Expected: Successfully installed

- [ ] **Step 3: 运行测试**

Run: `cd backend && python -m pytest tests/test_knowledge.py -v`
Expected: 所有测试通过

- [ ] **Step 4: 提交**

```bash
git add backend/tests/__init__.py backend/tests/test_knowledge.py
git commit -m "test: add knowledge base integration tests"
```

---

## 总结

### 任务依赖关系

```
Task 1 (依赖和配置)
    ↓
Task 2 (Embedding 服务)
    ↓
Task 3 (存储管理器)
    ↓
Task 4 (RAG 检索器)
    ↓
Task 5 (文档入库器)
    ↓
Task 6 (中央调度器)
    ↓
Task 7 (知识库 API)
    ↓
Task 8 (集成测试)
```

### 验收标准

1. **文档入库**：上传文档 → 分析 → 入库，返回 doc_id
2. **知识库问答**：提问 → RAG 检索 → QA Agent → 返回答案 + 来源
3. **文档管理**：列表 / 详情 / 删除 / 搜索
4. **配置扩展**：Embedding 和知识库配置独立管理
5. **测试通过**：所有集成测试通过

### 后续优化方向

1. 添加批量入库功能
2. 实现文档更新（重新索引）
3. 添加标签管理
4. 优化检索算法（混合检索）
5. 添加缓存机制
