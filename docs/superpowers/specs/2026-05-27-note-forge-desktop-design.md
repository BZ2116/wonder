# Note-Forge Desktop Design Spec

> **Date:** 2026-05-27
> **Author:** 赵sir + Claude
> **Status:** Draft

## Goal

将 note-forge 从 FastAPI + Vue 3 web 应用重写为 Tauri 2 桌面应用。消除 Python 依赖，实现双击即用的独立桌面工具。保持现有功能（单篇分析、历史记录、设置），为后续批量文献矩阵、可追溯问答、文献发现等研究生科研功能打下基础。

## Architecture

**技术栈：** Tauri 2 + Vue 3 + TypeScript + Element Plus + Pinia + pdf.js

**核心决策：**

| 决策 | 选择 | 理由 |
|------|------|------|
| 桌面框架 | Tauri 2 | 轻量、安全、原生性能，比 Electron 包体小 10 倍 |
| 后端语言 | TypeScript | 与前端统一，开发效率最高，PDF 论文体积性能足够 |
| LLM 调用 | 前端直接调用 | 桌面应用本地进程，API Key 安全可控 |
| PDF 解析 | pdf.js | JS 原生，Tauri 环境直接运行，社区成熟 |
| 数据存储 | JSON 文件 | 迁移成本最低，后续可升级 SQLite |

**架构分层：**

```
┌─────────────────────────────────────────┐
│              Tauri 2 Shell              │
│  (Rust: 窗口管理、系统托盘、打包)         │
├─────────────────────────────────────────┤
│           Vue 3 + Element Plus          │
│  (UI 层: 页面、组件、路由、状态管理)       │
├─────────────────────────────────────────┤
│           TypeScript 业务逻辑            │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Agents  │ │ LLM 客户端│ │ 文件解析  │ │
│  │ (5个)   │ │ (流式)   │ │ (pdf.js) │ │
│  └─────────┘ └──────────┘ └──────────┘ │
├─────────────────────────────────────────┤
│          Tauri JS API                   │
│  (文件系统、对话框、通知)                 │
└─────────────────────────────────────────┘
```

## Project Structure

```
note-forge/
├── src-tauri/                     # Tauri Rust 层（最小化）
│   ├── Cargo.toml
│   ├── tauri.conf.json            # 窗口配置、权限声明、打包配置
│   ├── src/
│   │   ├── main.rs                # Tauri 入口
│   │   └── lib.rs                 # 注册命令（目前基本为空）
│   └── icons/                     # 应用图标
│
├── src/                           # Vue 3 前端 + TypeScript 业务逻辑
│   ├── main.ts                    # Vue 入口
│   ├── App.vue
│   ├── router/index.ts
│   │
│   ├── views/                     # 页面
│   │   ├── Home.vue               # 单篇分析
│   │   ├── History.vue            # 历史列表
│   │   ├── HistoryDetail.vue      # 历史详情
│   │   └── Settings.vue           # 设置
│   │
│   ├── components/                # UI 组件
│   │   ├── AppLayout.vue
│   │   ├── FileUpload.vue
│   │   ├── AnalysisResult.vue
│   │   └── WorkflowStatus.vue
│   │
│   ├── stores/                    # Pinia 状态管理
│   │   ├── config.ts
│   │   └── analysis.ts
│   │
│   ├── lib/                       # 核心业务逻辑（原 Python 后端）
│   │   ├── agents/
│   │   │   ├── base.ts            # BaseAgent 基类
│   │   │   ├── literature.ts      # 文献解析 Agent
│   │   │   ├── relation.ts        # 项目关联 Agent
│   │   │   ├── writing.ts         # 写作素材 Agent
│   │   │   ├── todo.ts            # 待办清单 Agent
│   │   │   └── qa.ts              # 问答 Agent
│   │   │
│   │   ├── llm/
│   │   │   ├── client.ts          # 统一 LLM 客户端
│   │   │   └── types.ts           # 类型定义
│   │   │
│   │   ├── core/
│   │   │   ├── file-reader.ts     # 文件读取（pdf.js + 文本）
│   │   │   ├── chunker.ts         # 文本分块
│   │   │   ├── config.ts          # 配置管理（JSON 读写）
│   │   │   └── history.ts         # 历史记录管理
│   │   │
│   │   └── utils/
│   │       └── markdown.ts        # Markdown 渲染（markdown-it）
│   │
│   └── styles/
│       └── main.css
│
├── data/                          # 运行时数据目录（Tauri app data）
│   ├── config.json
│   └── outputs/                   # 分析结果
│
├── package.json
├── vite.config.ts
├── tsconfig.json
└── index.html
```

## LLM Client

统一接口，支持 OpenAI 兼容格式和 Anthropic 格式，支持流式输出。

```typescript
interface LLMConfig {
  provider: string       // 'MiniMax' | 'GPT/OpenAI' | 'Claude/Anthropic' | 'DeepSeek' | 'MiMo/Xiaomi' | '自定义'
  apiKey: string
  baseUrl: string
  modelName: string
}

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LLMResponse {
  content: string
  usage?: { prompt: number; completion: number }
}

// 同步调用
async function callLLM(config: LLMConfig, messages: Message[]): Promise<LLMResponse>

// 流式调用
async function callLLMStream(
  config: LLMConfig,
  messages: Message[],
  onChunk: (text: string) => void
): Promise<LLMResponse>
```

**两种调用路径：**
- OpenAI 兼容（MiniMax、GPT、DeepSeek、MiMo、自定义）：`fetch` → `{baseUrl}/chat/completions`，SSE 解析
- Anthropic：`fetch` → `{baseUrl}/messages`，`x-api-key` header，SSE 格式单独处理

## Agent Pipeline

翻译现有 Python Agent 为 TypeScript，逻辑不变，新增流式输出支持。

```typescript
abstract class BaseAgent {
  constructor(protected config: LLMConfig) {}

  protected async callLLM(systemPrompt: string, userPrompt: string): Promise<string>
  protected async callLLMStream(systemPrompt: string, userPrompt: string,
                                 onChunk: (text: string) => void): Promise<string>

  abstract run(input: Record<string, any>): Promise<Record<string, any>>
}
```

**5 个 Agent：**

| Agent | 输入 | 输出 | LLM 调用次数 |
|-------|------|------|-------------|
| LiteratureParserAgent | 文件内容 + 分块 | 阅读卡片 | ≥2（逐块 + 合并） |
| ProjectRelationAgent | 阅读卡片 + 研究背景 | 关联分析 + 评分 | 1 |
| WritingAgent | 阅读卡片 + 关联 + 写作风格 | 写作素材 | 1 |
| TodoAgent | 阅读卡片 + 关联 | 待办清单 | 1 |
| QAAgent | 文档内容 + 用户问题 | 回答 | 每次问答 1 |

**单篇分析流程：**
```
用户选文件 → file-reader 读取 → chunker 分块
→ LiteratureParserAgent（流式）
→ ProjectRelationAgent（流式）
→ WritingAgent（流式）
→ TodoAgent（流式）
→ 保存结果到 history
```

## Data Layer

### 文件读取

```typescript
async function readFile(filePath: string): Promise<{ content: string; fileName: string }>
// PDF: pdf.js 逐页提取文本，拼接
// TXT/MD: 直接读取，UTF-8 优先，GBK fallback
// DOCX: mammoth.js 提取纯文本
```

### 配置管理

存储位置：Tauri app data 目录（Windows: `%APPDATA%/note-forge/`）

```typescript
interface AppConfig {
  model: {
    provider: string
    apiKey: string
    baseUrl: string
    modelName: string
  }
  research: {
    background: string
    writingStyle: string
  }
}

async function loadConfig(): Promise<AppConfig>
async function saveConfig(config: AppConfig): Promise<void>
```

### 历史记录

每条记录一个 `{id}_record.json`，存储在 app data 的 `outputs/` 下。

```typescript
interface HistoryRecord {
  id: string
  fileName: string
  model: string
  summary: string
  createdAt: string
  readingCard: string
  relationAnalysis: string
  writingMaterials: string
  todoList: string
  fullReport: string
}

async function saveRecord(record: HistoryRecord): Promise<void>
async function listRecords(): Promise<HistoryRecord[]>
async function getRecord(id: string): Promise<HistoryRecord | null>
async function deleteRecord(id: string): Promise<void>
```

### 运行时目录

```
%APPDATA%/note-forge/
├── config.json
└── outputs/
    ├── {id}_record.json
    └── ...
```

## Frontend UI

保持现有设计风格：深色侧边栏（`#1a1a2e`）+ 金色强调（`#f0c040`）+ 纸白内容区（`#faf8f5`）。

**路由：**
- `/` — 单篇分析（Home）
- `/history` — 历史列表
- `/history/:id` — 历史详情
- `/settings` — 设置

**与 Web 版的差异：**

| 组件 | Web 版 | 桌面版 |
|------|--------|--------|
| FileUpload | el-upload HTTP 上传 | Tauri 文件对话框，选完直接读到内存 |
| WorkflowStatus | 假进度（10s 定时器） | 真实进度，每个 Agent 开始/完成时更新 |
| AnalysisResult | 简陋正则 Markdown | markdown-it 正式渲染 |
| Settings | Axios 调后端 API | 直接调 config.ts |
| Home | HTTP 调分析 API | 直接编排 Agent pipeline，流式更新 |

**桌面版天然能力：**
- 系统通知：分析完成弹通知
- 文件拖拽：拖 PDF 到窗口直接分析
- 离线可用：除 LLM API 外全部本地

## Implementation Phases

### Phase 1：核心功能迁移

搭建 Tauri 2 项目，TypeScript 重写全部功能：

1. Tauri 2 项目初始化 + Vue 3 + Vite + TypeScript + Element Plus
2. LLM 统一客户端（OpenAI 兼容 + Anthropic，支持流式）
3. 文件读取（pdf.js + 文本文件 + DOCX）
4. 文本分块
5. 5 个 Agent（literature、relation、writing、todo、qa）
6. 配置管理（JSON 读写，Tauri app data）
7. 历史记录管理
8. UI 迁移（Home、History、HistoryDetail、Settings）
9. 打包测试

**Phase 1 完成 = 现有 web 版全部功能，独立桌面应用，双击即用，流式输出。**

### Phase 2：新功能迭代

在桌面版基础上逐步加入：

1. 批量文献矩阵 — 多文件上传 → 横向对比表格
2. 可追溯问答 — 回答带页码/原文证据
3. 文献发现 — 接 Semantic Scholar API
4. 引用网络 — seed paper → references/citations 追踪
5. Obsidian/Zotero 导出 — Markdown 带 frontmatter，BibTeX
6. 个人研究方向匹配 — 基于用户研究背景的个性化分析

Phase 2 每个功能独立设计、独立实现。

## Dependencies

**前端：**
- vue 3.4+, vite 5+, typescript 5+
- element-plus 2.7+
- pinia 2+, vue-router 4+
- pdfjs-dist (PDF 解析)
- mammoth (DOCX 解析)
- markdown-it (Markdown 渲染)
- @tauri-apps/api 2.x, @tauri-apps/plugin-fs, @tauri-apps/plugin-dialog

**Tauri Rust：**
- tauri 2.x (minimal features)

## Testing

- 单元测试：Vitest 测试 core/ 和 lib/ 模块
- E2E：Tauri WebDriver 或 Playwright
- 手动测试：打包后在 Windows/macOS/Linux 上验证
