# 文答 Wonder — Research Desk

面向科研场景的 AI 文献分析桌面应用。支持上传论文与技术文档，通过多 Agent 协作自动生成阅读卡片、关联分析、写作素材和任务清单，并提供 RAG 知识库、文献发现、引用网络等辅助工具。

<img width="1200" height="820" alt="screenshot" src="https://github.com/user-attachments/assets/cd3ab1f3-9c14-4f48-911a-5795ed1e1d29" />

## 技术栈

| 层 | 技术 |
|---|------|
| 桌面框架 | Tauri v2 |
| 前端 | Vue 3 + TypeScript + Vite + Pinia + Element Plus |
| 后端 | Python FastAPI |
| 向量数据库 | ChromaDB (cosine) |
| 元数据存储 | SQLite |
| 嵌入服务 | OpenAI 兼容 API |

## 功能概览

### 前端（桌面客户端）

**单篇分析** — 上传 PDF / DOCX / TXT / MD，一键生成四维分析报告（阅读卡片、关联分析、写作素材、任务清单），支持流式输出预览。

**批量矩阵** — 批量上传多篇文献，生成交叉对比矩阵，横向比较方法、数据集、指标等维度。

**文献发现** — 通过 Semantic Scholar 搜索学术论文，查看摘要、引用数、年份等元数据，可一键复制摘要用于分析。

**引用网络** — 输入论文 ID，构建引用关系图谱（Canvas 渲染），支持 1-2 层展开，点击节点查看详情或继续展开。

**追溯问答** — 两种模式：
- 本地模式：基于已分析的历史文献进行多轮追问
- 知识库模式（RAG）：基于知识库中的文档集合进行检索增强问答，答案附带来源片段

**知识库** — 文档上传 → 自动分块 → 向量入库，支持搜索知识片段、查看文档详情（阅读卡片 / 关联分析 / 写作素材 / 四个 Tab）、删除管理。

**历史记录** — 浏览所有已分析记录，查看完整报告，支持删除。

**设置** — 四大配置区：
- 模型配置：服务商预设（MiniMax / OpenAI / Anthropic / DeepSeek / MiMo / 自定义）、API Key、Base URL、模型名
- 研究偏好：研究背景、写作风格（影响 Agent 分析角度）
- Embedding 配置：嵌入服务商、模型、维度
- 知识库配置：启用开关、自动入库开关、上下文 Token 上限

### 后端（API 服务）

**分析引擎** — 4 个专业 Agent 串联协作：
1. **文献解析 Agent** — 提取核心问题、方法流程、数据集、评价指标、创新点、局限性
2. **项目关联 Agent** — 结合研究背景进行关联分析
3. **写作辅助 Agent** — 生成论文写作可用素材
4. **待办 Agent** — 提取后续实验 / 阅读 / 学习任务

**RAG 知识库** — 两层检索架构：
1. 摘要层：文档级摘要向量检索，快速定位相关文档
2. 内容层：在命中文档内进行分块向量检索，组装上下文

**问答 Agent** — 基于 RAG 检索结果进行溯源问答，答案引用具体片段。

**Orchestrator** — 纯规则路由（无额外 LLM 调用），根据任务类型分发到对应 Agent。

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/analysis/single` | 单篇分析（上传文件） |
| POST | `/api/analysis/batch` | 批量分析 |
| GET | `/api/history` | 历史记录列表 |
| GET | `/api/history/{id}` | 历史记录详情 |
| DELETE | `/api/history/{id}` | 删除历史记录 |
| POST | `/api/knowledge/documents` | 上传文档入库 |
| GET | `/api/knowledge/documents` | 知识库文档列表 |
| GET | `/api/knowledge/documents/{id}` | 文档详情（含分析结果） |
| DELETE | `/api/knowledge/documents/{id}` | 删除文档 |
| POST | `/api/knowledge/ask` | RAG 问答 |
| POST | `/api/knowledge/search` | 知识片段搜索 |
| GET/POST | `/api/config` | 配置读写 |
| GET | `/api/health` | 健康检查 |

## 项目结构

```txt
note-forge/
├── src/                        # 前端源码
│   ├── views/                  # 页面组件
│   │   ├── Home.vue            # 单篇分析
│   │   ├── Batch.vue           # 批量矩阵
│   │   ├── Discovery.vue       # 文献发现
│   │   ├── CitationNetwork.vue # 引用网络
│   │   ├── QA.vue              # 追溯问答
│   │   ├── Knowledge.vue       # 知识库管理
│   │   ├── History.vue         # 历史记录
│   │   ├── HistoryDetail.vue   # 记录详情
│   │   └── Settings.vue        # 设置
│   ├── components/             # 通用组件
│   ├── stores/                 # Pinia 状态管理
│   ├── lib/
│   │   ├── api/                # 后端 HTTP 客户端
│   │   ├── agents/             # 前端 Agent（本地 LLM 调用）
│   │   ├── analysis/           # 分析 Pipeline
│   │   ├── core/               # 配置、历史、存储适配器
│   │   ├── discovery/          # Semantic Scholar 集成
│   │   ├── export/             # BibTeX / Markdown 导出
│   │   └── llm/                # LLM 类型定义
│   └── styles/                 # 设计系统
├── backend/                    # Python 后端
│   ├── api/                    # FastAPI 路由
│   ├── agents/                 # 多 Agent 系统
│   ├── core/                   # 配置、文件读取、分块、嵌入、存储
│   ├── rag/                    # RAG 检索与索引
│   ├── models/                 # Pydantic 数据模型
│   └── main.py                 # FastAPI 入口
├── src-tauri/                  # Tauri 配置与 Rust 壳
├── data/                       # 运行时数据（SQLite、ChromaDB、上传文件）
└── package.json
```

## 安装与运行

### 前置条件

- Node.js >= 18
- Python >= 3.10
- Rust（Tauri 构建需要）

### 后端

```bash
# 安装 Python 依赖
pip install -r backend/requirements.txt

# 启动 API 服务（默认 8000 端口）
python -m uvicorn backend.main:app --port 8000
```

### 前端（开发模式）

```bash
# 安装依赖
npm install

# 启动 Tauri 开发窗口
npm run tauri dev
```

### 构建桌面安装包

```bash
npm run tauri:build
```

构建完成后，Windows NSIS 安装包位于：

```txt
src-tauri/target/release/bundle/nsis/
```

## 下载与版本发布

当前目标版本为 `v0.1.0`，先只发布 Windows 安装包。发布仓库：

[https://github.com/BZ2116/wonder](https://github.com/BZ2116/wonder)

发布流程采用本地构建 + GitHub Release 手动上传：

```bash
npm run test
npm run build
npm run tauri:build
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

然后在 GitHub Releases 中创建 `Wonder v0.1.0`，上传 `src-tauri/target/release/bundle/nsis/` 下生成的 `.exe` 安装包。

应用内自动更新暂不包含在 `v0.1.0` 中，后续可以基于 Tauri updater 插件接入更新提醒和安装流程。详细发布清单见 [docs/release.md](docs/release.md)。

## 配置

启动后在「设置」页面填写：

1. **模型配置** — 选择服务商，填入 API Key 和 Base URL
2. **研究偏好** — 描述你的研究方向，帮助 Agent 更精准地关联分析
3. **Embedding** — 配置向量嵌入服务（用于知识库）
4. **知识库** — 启用 / 禁用、自动入库、上下文 Token 上限

配置存储在 `data/config.json`。

## 设计系统

采用「暖纸学术风」（Warm Paper Academic）设计语言：

- 宣纸纹理背景 + 5 级墨色层次
- 宋体衬线标题 + 无衬线正文
- `wonder-*` 动画体系（fade-up / scale-in / slide-left）
- CSS 自定义变量驱动，支持主题扩展
