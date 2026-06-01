# 文答 Wonder — Research Desk

面向科研场景的 AI 文献分析桌面应用。支持上传论文与技术文档，通过多 Agent 协作自动生成阅读卡片、关联分析、写作素材和任务清单，并提供 RAG 知识库、文献发现、引用网络等辅助工具。

<img width="1234" height="747" alt="image" src="https://github.com/user-attachments/assets/3f20ec2b-c6e5-4c7f-ba9b-f9227017d84a" />


## 技术栈

| 层 | 技术 |
|---|------|
| 桌面框架 | Electron |
| 前端 | React 19 + TypeScript + Vite + Zustand + Ant Design |
| Node 网关 | Hono (HTTP) + better-sqlite3 (SQLite) |
| Python AI Core | FastAPI + ChromaDB (cosine) |
| Provider 适配层 | OpenAI SDK + Anthropic SDK（Protocol 接口） |

## 架构

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  React 前端  │────▶│  Node/Hono   │────▶│  Python AI Core  │
│  (Electron)  │◀────│  (SQLite KV)  │◀────│  (FastAPI + RAG) │
└─────────────┘     └──────────────┘     └──────────────────┘
```

**边界规则：**
- 前端只调用 Node/Hono API，不直接访问 Python
- Node/Hono 负责 SQLite 持久化、请求校验、配置加载、转发到 Python
- Python AI Core 是唯一执行 LLM 调用和 Embedding 的层
- Provider 适配层通过 Protocol 接口支持 Anthropic、OpenAI 兼容、MiniMax 等多个 provider

## 功能概览

### 前端（桌面客户端）

**单篇分析** — 上传 PDF / DOCX / TXT / MD，一键生成四维分析报告（阅读卡片、关联分析、写作素材、任务清单），支持流式输出预览。

**批量矩阵** — 批量上传多篇文献，生成交叉对比矩阵，横向比较方法、数据集、指标等维度。

**文献发现** — 通过 Semantic Scholar 搜索学术论文，查看摘要、引用数、年份等元数据，可一键复制摘要用于分析。

**引用网络** — 输入论文 ID，构建引用关系图谱（Canvas 渲染），支持 1-2 层展开，点击节点查看详情或继续展开。

**追溯问答** — 两种模式：
- 本地模式：基于已分析的历史文献进行多轮追问
- 知识库模式（RAG）：基于知识库中的文档集合进行检索增强问答，答案附带来源片段

**知识库** — 文档上传 → 自动分块 → 向量入库，支持搜索知识片段、查看文档详情、删除管理。

**历史记录** — 浏览所有已分析记录，查看完整报告，支持删除。

**设置** — 配置 Chat Provider、Embedding Provider、研究偏好、知识库参数。

### 后端（Python AI Core）

**Provider 适配层** — 统一接口支持多个 LLM/Embedding provider：
- `ChatProvider`：`chat()`, `stream_chat()`, `health_check()`
- `EmbeddingProvider`：`embed()`, `health_check()`
- 内置适配器：`anthropic`, `openai_compatible`, `minimax`

**分析引擎** — 4 个专业 Agent 串联协作：
1. **文献解析 Agent** — 提取核心问题、方法流程、数据集、评价指标、创新点、局限性
2. **项目关联 Agent** — 结合研究背景进行关联分析
3. **写作辅助 Agent** — 生成论文写作可用素材
4. **待办 Agent** — 提取后续实验 / 阅读 / 学习任务

**RAG 知识库** — 两层检索架构：
1. 摘要层：文档级摘要向量检索，快速定位相关文档
2. 内容层：在命中文档内进行分块向量检索，组装上下文

**问答 Agent** — 基于 RAG 检索结果进行溯源问答，答案引用具体片段。

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/analysis/single` | 单篇分析（SSE 流式） |
| POST | `/api/qa` | 追溯问答 |
| GET | `/api/history` | 历史记录列表 |
| GET | `/api/history/{id}` | 历史记录详情 |
| DELETE | `/api/history/{id}` | 删除历史记录 |
| POST | `/api/knowledge/documents` | 上传文档入库 |
| GET | `/api/knowledge/documents` | 知识库文档列表 |
| GET | `/api/knowledge/documents/{id}` | 文档详情 |
| DELETE | `/api/knowledge/documents/{id}` | 删除文档 |
| POST | `/api/knowledge/ask` | RAG 问答 |
| POST | `/api/knowledge/search` | 知识片段搜索 |
| GET | `/api/config` | 读取配置 |
| PUT | `/api/config` | 更新配置 |
| GET | `/api/health` | Node 健康检查 |
| GET | `/api/health/ai-core` | Python AI Core 健康检查 |
| GET | `/api/health/llm` | Chat Provider 健康检查 |
| POST | `/api/config/health/chat` | Chat Provider 连通性检查 |
| POST | `/api/config/health/embedding` | Embedding Provider 连通性检查 |

## 项目结构

```txt
wonder/
├── src/                            # React 前端源码
│   ├── pages/                      # 页面组件
│   ├── components/                 # 通用组件
│   ├── stores/                     # Zustand 状态管理
│   ├── types/                      # TypeScript 类型定义
│   │   ├── config.ts               # NormalizedAppConfig
│   │   └── analysis.ts             # AnalysisResult, AppConfig (legacy)
│   └── services/                   # API 客户端
├── server/                         # Node/Hono 网关
│   ├── routes/                     # API 路由（analysis, qa, config, ...）
│   ├── services/                   # storage, python-backend
│   ├── config/                     # normalize.ts — 配置兼容层
│   ├── db/                         # SQLite schema
│   └── index.ts                    # 入口
├── backend/                        # Python AI Core
│   ├── api/                        # FastAPI 路由
│   ├── agents/                     # 多 Agent 系统
│   ├── core/
│   │   ├── providers/              # Provider 适配层
│   │   │   ├── base.py             # ChatProvider, EmbeddingProvider Protocol
│   │   │   ├── anthropic.py        # Anthropic 适配器
│   │   │   ├── openai_compatible.py# OpenAI 兼容适配器
│   │   │   └── factory.py          # Provider 工厂
│   │   ├── config.py               # ConfigManager (JSON file)
│   │   ├── embedding.py            # EmbeddingClient
│   │   └── llm_client.py           # Legacy + provider-aware call_llm
│   ├── rag/                        # RAG 检索与索引
│   ├── models/                     # Pydantic 数据模型
│   └── main.py                     # FastAPI 入口
├── tests/server/                   # Node 测试
├── backend/tests/                  # Python 测试
├── data/                           # 运行时数据
└── package.json
```

## 安装与运行

### 前置条件

- Node.js >= 18
- Python >= 3.10

### Python AI Core

```bash
pip install -r backend/requirements.txt

# 启动 AI Core（默认 8000 端口）
python -m uvicorn backend.main:app --port 8000
```

### Node 网关 + 前端

```bash
npm install

# 开发模式（同时启动 Vite + Node）
npm run dev

# Electron 桌面模式
npm run dev:electron
```

### 构建

```bash
npm run build:installer
```

## 配置

启动后在「设置」页面配置：

1. **Chat Provider** — 选择 provider（anthropic / openai_compatible / minimax / custom），填入 API Key、Base URL、模型名
2. **Embedding Provider** — 独立配置嵌入服务 provider 和参数
3. **研究偏好** — 描述你的研究方向，帮助 Agent 更精准地关联分析
4. **知识库** — 启用/禁用、自动入库、上下文 Token 上限

配置存储在两处：
- Node 侧：SQLite `config` 表（KV 存储，`appConfig` key 存 JSON）
- Python 侧：`data/config.json`（含 `normalized_config` 和 legacy keys）

## 扩展 Provider

添加新的 Chat Provider：

1. 在 `backend/core/providers/` 下新建适配器文件，实现 `ChatProvider` Protocol
2. 在 `backend/core/providers/factory.py` 的 `_PROVIDER_MAP` 中注册
3. 在 `src/types/config.ts` 的 `ChatProvider` 联合类型中添加新值

详见 `docs/provider-extension.md`。

## 设计系统

采用「暖纸学术风」（Warm Paper Academic）设计语言：

- 宣纸纹理背景 + 5 级墨色层次
- 宋体衬线标题 + 无衬线正文
- `wonder-*` 动画体系（fade-up / scale-in / slide-left）
- CSS 自定义变量驱动，支持主题扩展
