# RAG + 多 Agent 协同系统设计

## 概述

为 Note Forge 桌面应用设计 RAG（Retrieval-Augmented Generation）和多 Agent 协同系统，实现知识库积累和智能问答。

### 核心目标

1. **知识库积累**：用户上传文档 → 分析 → 入库，形成长期知识库
2. **智能问答**：基于知识库的语义检索 + Agent 生成回答
3. **双向协作**：RAG 为 Agent 提供上下文，Agent 为 RAG 提供索引

### 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 向量数据库 | ChromaDB | 纯 Python，本地文件存储，打包方便 |
| Embedding | 用户配置 API | 独立于 LLM，支持多 provider |
| 多 Agent 模式 | 中央调度器（纯规则路由） | 无额外 LLM 调用，token 可控 |
| 检索策略 | 层次检索（摘要 + 分块） | 平衡精度和效率 |
| 元数据存储 | SQLite | Python 内置，无额外依赖 |

---

## 第一节：数据模型

### ChromaDB 集合设计

```
Collection: "documents"
├── id: 文档 ID (UUID)
├── embedding: 向量 (用户配置的 embedding 模型)
├── metadata:
│   ├── file_name: 文件名
│   ├── chunk_index: 分块索引
│   ├── chunk_type: "summary" | "content"
│   ├── created_at: 创建时间
│   ├── doc_id: 所属文档 ID (用于关联)
│   └── tags: 标签列表
└── document: 文本内容
```

### SQLite 元数据表

```sql
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    summary TEXT,  -- Agent 生成的摘要
    reading_card TEXT,  -- 阅读卡片
    relation_analysis TEXT,
    writing_materials TEXT,
    todo_list TEXT,
    chunk_count INTEGER,
    total_tokens INTEGER
);

CREATE TABLE document_tags (
    doc_id TEXT,
    tag TEXT,
    PRIMARY KEY (doc_id, tag),
    FOREIGN KEY (doc_id) REFERENCES documents(id)
);
```

### 设计理由

- ChromaDB 存向量和文本，用于检索
- SQLite 存元数据和分析结果，用于展示和管理
- 两层结构支持层次检索

---

## 第二节：Embedding 服务

### 配置模型

```python
class EmbeddingConfig(BaseModel):
    provider: str = "OpenAI"  # OpenAI / MiniMax / 自定义
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    model_name: str = "text-embedding-3-small"
    dimensions: int = 1536  # 向量维度
```

### Embedding 客户端

```python
class EmbeddingClient:
    def __init__(self, config: EmbeddingConfig):
        self.config = config
        self.client = OpenAI(
            api_key=config.api_key,
            base_url=config.base_url
        )
    
    def embed(self, texts: List[str]) -> List[List[float]]:
        """批量获取文本向量"""
        response = self.client.embeddings.create(
            model=self.config.model_name,
            input=texts
        )
        return [item.embedding for item in response.data]
    
    def embed_single(self, text: str) -> List[float]:
        """单条文本向量化"""
        return self.embed([text])[0]
```

### Provider 预设

```python
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
```

### 设计理由

- 独立于 LLM 配置，用户可以选择不同的 embedding provider
- 统一接口，支持 OpenAI 兼容 API
- 预设常用 provider，简化配置

---

## 第三节：RAG 检索流程

### 层次检索策略

```
用户提问
    ↓
┌─────────────────────────────────┐
│  第一层：文档摘要检索            │
│  - 对用户问题 embedding         │
│  - 在 "summary" 类型分块中搜索  │
│  - 返回 top-3 相关文档         │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  第二层：文档内容检索            │
│  - 在命中文档的 "content" 分块中搜索 │
│  - 返回 top-5 相关分块         │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  上下文组装                      │
│  - 摘要 + 相关分块              │
│  - 控制总 token 数（< 8000）    │
└─────────────────────────────────┘
    ↓
传递给 Agent
```

### 检索器实现

```python
class RAGRetriever:
    def __init__(self, chroma_client, embedding_client):
        self.chroma = chroma_client
        self.embedding = embedding_client
    
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
        
        summaries = self.chroma.query(
            query_embeddings=[query_embedding],
            n_results=top_k_docs,
            where=where_filter
        )
        
        # 3. 第二层：内容检索
        matched_doc_ids = [m["doc_id"] for m in summaries["metadatas"][0]]
        content_where = {"chunk_type": "content", "doc_id": {"$in": matched_doc_ids}}
        
        chunks = self.chroma.query(
            query_embeddings=[query_embedding],
            n_results=top_k_chunks,
            where=content_where
        )
        
        # 4. 组装上下文
        context = self._build_context(summaries, chunks, max_context_tokens)
        
        return RetrievalResult(
            summaries=summaries,
            chunks=chunks,
            context=context,
            source_doc_ids=matched_doc_ids
        )
```

### 数据结构

```python
class RetrievalResult(BaseModel):
    summaries: List[dict]  # 命中的摘要
    chunks: List[dict]     # 命中的内容分块
    context: str           # 组装好的上下文文本
    source_doc_ids: List[str]  # 来源文档 ID
```

### 设计理由

- 层次检索减少向量搜索范围，提高效率
- 摘要检索快速定位相关文档，内容检索精确找到相关段落
- 控制上下文 token 数，避免传给 LLM 时超限
- 支持指定文档范围搜索

---

## 第四节：多 Agent 协同流程

### 中央调度器（纯规则路由）

```python
class Orchestrator:
    """根据任务类型路由到对应 Agent，不需要额外 LLM 调用"""
    
    def __init__(self, agents: Dict[str, BaseAgent], retriever: RAGRetriever):
        self.agents = agents
        self.retriever = retriever
    
    def route_task(self, task_type: str, **kwargs) -> str:
        """纯规则路由，根据 task_type 调用对应 Agent"""
        
        if task_type == "analyze_document":
            return self._analyze_document(**kwargs)
        
        elif task_type == "ask_question":
            return self._ask_question(**kwargs)
        
        elif task_type == "generate_writing":
            return self._generate_writing(**kwargs)
        
        elif task_type == "generate_todo":
            return self._generate_todo(**kwargs)
        
        else:
            raise ValueError(f"Unknown task type: {task_type}")
    
    def _analyze_document(self, text_chunks, research_context, writing_style):
        """文档分析流程：串联调用各 Agent"""
        # 1. 文献解析
        reading_card = self.agents["literature"].run(text_chunks=text_chunks)
        
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
        
        return reading_card, relation, writing, todo
    
    def _ask_question(self, question, doc_ids=None):
        """问答流程：RAG 检索 + QA Agent"""
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
            question=question
        )
        
        return answer, retrieval.source_doc_ids
```

### 任务类型定义

```python
class TaskType(str, Enum):
    ANALYZE_DOCUMENT = "analyze_document"  # 完整文档分析
    ASK_QUESTION = "ask_question"          # 知识库问答
    GENERATE_WRITING = "generate_writing"  # 写作素材
    GENERATE_TODO = "generate_todo"        # 任务规划
```

### 调用流程图

**文档分析流程：**

```
用户上传文档
    ↓
TaskType.ANALYZE_DOCUMENT
    ↓
Orchestrator.route_task()
    ↓
┌─────────────────────────────────┐
│  LiteratureAgent                │
│  → 生成阅读卡片                │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  RelationAgent                  │
│  → 项目关联分析                │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  WritingAgent                   │
│  → 写作素材                    │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  TodoAgent                      │
│  → 任务清单                    │
└─────────────────────────────────┘
    ↓
保存到知识库
```

**问答流程：**

```
用户提问
    ↓
TaskType.ASK_QUESTION
    ↓
Orchestrator.route_task()
    ↓
┌─────────────────────────────────┐
│  RAGRetriever                   │
│  → 层次检索                    │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  QAAgent                        │
│  → 基于检索结果回答            │
└─────────────────────────────────┘
    ↓
返回答案 + 来源
```

### 设计理由

- 纯规则路由，无额外 LLM 调用，token 消耗可控
- 任务类型清晰，易于扩展
- 串联调用保证分析流程的完整性
- 问答流程先检索再回答，保证答案有据可查

---

## 第五节：入库流程

### 文档入库流程

```
用户上传文档
    ↓
┌─────────────────────────────────┐
│  1. 文件读取 + 清洗            │
│     - PDF/DOCX/TXT/MD          │
│     - 编码处理                 │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  2. 文本切分                   │
│     - 按字符切分（7000字符/块） │
│     - 重叠 500 字符            │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  3. Agent 分析                 │
│     - LiteratureAgent → 摘要   │
│     - RelationAgent → 关联分析 │
│     - WritingAgent → 写作素材  │
│     - TodoAgent → 任务清单     │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  4. Embedding + 入库           │
│     ┌───────────────────────┐  │
│     │ ChromaDB 存储         │  │
│     │ - 摘要 embedding      │  │
│     │ - 各分块 embedding    │  │
│     └───────────────────────┘  │
│     ┌───────────────────────┐  │
│     │ SQLite 存储           │  │
│     │ - 文档元数据          │  │
│     │ - Agent 分析结果      │  │
│     └───────────────────────┘  │
└─────────────────────────────────┘
    ↓
返回入库结果
```

### 入库器实现

```python
class DocumentIndexer:
    def __init__(self, chroma_client, embedding_client, sqlite_conn):
        self.chroma = chroma_client
        self.embedding = embedding_client
        self.db = sqlite_conn
    
    def index_document(
        self,
        file_name: str,
        chunks: List[str],
        summary: str,
        analysis_result: dict
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
        self.chroma.add(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents
        )
        
        # 4. 存入 SQLite
        self.db.execute("""
            INSERT INTO documents (id, file_name, created_at, summary, 
                                   reading_card, relation_analysis, 
                                   writing_materials, todo_list, 
                                   chunk_count, total_tokens)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            doc_id, file_name, datetime.now(),
            summary,
            analysis_result["reading_card"],
            analysis_result["relation_analysis"],
            analysis_result["writing_materials"],
            analysis_result["todo_list"],
            len(chunks),
            sum(len(c) for c in chunks) // 1.5
        ))
        self.db.commit()
        
        return doc_id
```

### 设计理由

- 摘要和内容分开存储，支持层次检索
- ChromaDB 存向量用于检索，SQLite 存结构化数据用于展示
- 入库过程一次完成，避免重复 embedding 调用

---

## 第六节：API 设计

### 新增 API 端点

```python
router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

# 文档入库
@router.post("/documents")
async def index_document(
    file: UploadFile = File(...),
    max_chars: int = Form(7000),
    overlap: int = Form(500),
):
    """上传文档 → 分析 → 入库"""
    ...

# 知识库问答
@router.post("/ask")
async def ask_question(request: QuestionRequest):
    """基于知识库回答问题"""
    ...

# 知识库列表
@router.get("/documents")
async def list_documents():
    """获取知识库中的文档列表"""
    ...

# 知识库详情
@router.get("/documents/{doc_id}")
async def get_document(doc_id: str):
    """获取文档详情（含分析结果）"""
    ...

# 删除文档
@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    """从知识库删除文档"""
    ...

# 搜索文档（不触发 Agent）
@router.post("/search")
async def search_knowledge(request: SearchRequest):
    """搜索知识库，返回相关片段"""
    ...
```

### 请求/响应模型

```python
class QuestionRequest(BaseModel):
    question: str
    doc_ids: Optional[List[str]] = None  # 可选：指定搜索范围
    top_k_docs: int = 3
    top_k_chunks: int = 5

class QuestionResponse(BaseModel):
    answer: str
    source_doc_ids: List[str]
    source_chunks: List[dict]  # 命中的分块，用于展示来源

class SearchRequest(BaseModel):
    query: str
    doc_ids: Optional[List[str]] = None
    top_k: int = 10

class SearchResponse(BaseModel):
    results: List[dict]  # 命中的分块

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

### 与现有 API 的关系

| 端点 | 功能 | 说明 |
|------|------|------|
| `POST /api/analysis/single` | 单文档分析 | 保留，只分析不入库 |
| `POST /api/knowledge/documents` | 文档入库 | **新增**，分析 + 入库 |
| `POST /api/knowledge/ask` | 知识库问答 | **新增**，RAG + QA Agent |
| `POST /api/knowledge/search` | 搜索知识库 | **新增**，只检索不生成 |
| `GET /api/knowledge/documents` | 文档列表 | **新增** |
| `DELETE /api/knowledge/documents/{id}` | 删除文档 | **新增** |

### 设计理由

- 新增 `/api/knowledge` 前缀，与现有 `/api/analysis` 分离
- 单文档分析保留，不强制入库
- 问答和搜索分开，搜索可用于调试和预览

---

## 第七节：配置扩展

### 配置模型更新

```python
class EmbeddingConfig(BaseModel):
    provider: str = "OpenAI"
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    model_name: str = "text-embedding-3-small"
    dimensions: int = 1536

class KnowledgeConfig(BaseModel):
    enabled: bool = True
    chroma_path: str = "data/chroma"  # ChromaDB 存储路径
    sqlite_path: str = "data/knowledge.db"  # SQLite 路径
    auto_index: bool = True  # 分析后自动入库
    max_context_tokens: int = 8000  # 检索上下文最大 token 数

class ConfigModel(BaseModel):
    model: dict  # LLM 配置
    embedding: EmbeddingConfig  # Embedding 配置
    research: dict  # 研究背景
    watch: dict  # 监听文件夹
    analysis: dict  # 分析参数
    knowledge: KnowledgeConfig  # 知识库配置
```

### 默认配置

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

### 设计理由

- Embedding 独立配置，与 LLM 分离
- 知识库配置控制存储路径和行为
- 支持单独更新各模块配置，避免全量覆盖

---

## 第八节：依赖和打包

### 新增 Python 依赖

```txt
# backend/requirements.txt
fastapi>=0.100.0
uvicorn>=0.23.0
python-dotenv>=1.0.0
openai>=1.0.0
pypdf>=3.0.0
python-docx>=0.8.11
pydantic>=2.0.0
chromadb>=0.4.0  # 新增
```

### 依赖说明

| 包 | 用途 | 大小 |
|---|---|---|
| chromadb | 向量数据库 | ~100MB（含依赖） |
| openai | Embedding API 调用 | ~5MB |
| sqlite3 | 元数据存储 | Python 内置 |

### 目录结构

```
data/
├── config.json          # 配置文件
├── outputs/             # 分析结果（现有）
├── chroma/              # ChromaDB 数据（新增）
│   └── chroma.sqlite3
└── knowledge.db         # SQLite 元数据（新增）
```

### 初始化代码

```python
class StorageManager:
    def __init__(self, config: dict):
        self.chroma_path = config["knowledge"]["chroma_path"]
        self.sqlite_path = config["knowledge"]["sqlite_path"]
        
        # 创建目录
        os.makedirs(self.chroma_path, exist_ok=True)
        os.makedirs(os.path.dirname(self.sqlite_path), exist_ok=True)
        
        # 初始化 ChromaDB
        self.chroma_client = chromadb.PersistentClient(path=self.chroma_path)
        self.collection = self.chroma_client.get_or_create_collection(
            name="documents",
            metadata={"hnsw:space": "cosine"}
        )
        
        # 初始化 SQLite
        self.db = sqlite3.connect(self.sqlite_path)
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
```

### 设计理由

- ChromaDB 是唯一新增的大依赖，其他都是现有依赖
- 数据目录独立，便于用户备份和迁移
- 初始化代码自动处理目录和表创建

---

## 总结

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      Note Forge 后端                        │
├─────────────────────────────────────────────────────────────┤
│  API 层                                                     │
│  ├── /api/analysis  (现有)                                  │
│  ├── /api/config    (现有)                                  │
│  ├── /api/history   (现有)                                  │
│  └── /api/knowledge (新增)                                  │
│      ├── POST /documents  (入库)                            │
│      ├── POST /ask        (问答)                            │
│      ├── POST /search     (搜索)                            │
│      ├── GET  /documents  (列表)                            │
│      └── DELETE /documents/{id} (删除)                      │
├─────────────────────────────────────────────────────────────┤
│  核心层                                                     │
│  ├── Orchestrator (中央调度器)                              │
│  ├── RAGRetriever (层次检索器)                              │
│  ├── DocumentIndexer (入库器)                               │
│  ├── EmbeddingClient (Embedding 客户端)                     │
│  └── StorageManager (存储管理器)                            │
├─────────────────────────────────────────────────────────────┤
│  Agent 层                                                   │
│  ├── LiteratureParserAgent (文献解析)                       │
│  ├── ProjectRelationAgent (项目关联)                        │
│  ├── WritingAgent (写作辅助)                                │
│  ├── TodoAgent (任务规划)                                   │
│  └── QAAgent (问答)                                         │
├─────────────────────────────────────────────────────────────┤
│  存储层                                                     │
│  ├── ChromaDB (向量存储)                                    │
│  └── SQLite (元数据存储)                                    │
└─────────────────────────────────────────────────────────────┘
```

### 核心流程

1. **文档入库**：上传 → 切分 → Agent 分析 → Embedding → 存入 ChromaDB + SQLite
2. **知识库问答**：提问 → Embedding → 层次检索 → QA Agent → 返回答案 + 来源
3. **文档管理**：列表 / 详情 / 删除 / 搜索

### 关键设计决策

1. **ChromaDB**：纯 Python，本地文件存储，打包方便
2. **层次检索**：先摘要后分块，平衡精度和效率
3. **纯规则路由**：无额外 LLM 调用，token 可控
4. **双向协作**：RAG 为 Agent 提供上下文，Agent 为 RAG 提供索引
5. **独立配置**：Embedding 和 LLM 分离，用户可自由选择 provider
