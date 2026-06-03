# React UX 审计

日期：2026-06-03
范围：React 前端 — Zustand stores、API 客户端、页面组件、用户反馈、错误/加载/空状态、重复操作防护。

## 运行的命令

| 命令 | 结果 | 备注 |
|---|---|---|
| `rg "fetch\(|api\.|try \{|catch\|throw new\|message\.error\|loading\|disabled\|set\(\{" src` | 通过 | 29.7KB 输出，覆盖全部 stores/pages/components |
| `npx vitest --run` | 失败 | 2 文件失败、43 用例失败；均为 `better-sqlite3` Node 版本不匹配导致的服务端测试，前端 14 文件 123 用例全部通过 |
| `npx tsc -p tsconfig.json --noEmit` | 通过（1 警告） | `baseUrl` 在 TS 7.0 废弃警告，非阻塞 |

## 发现

| ID | 优先级 | 区域 | 问题 | 证据 | 建议修复 | 建议验证 |
|---|---|---|---|---|---|---|
| UX-P1-001 | P1 | `services/api.ts:9-11` | 错误消息直接暴露 HTTP 状态码和原始响应文本给用户 | `throw new Error(\`API ${method} ${path} failed (${res.status}): ${text}\`)` — 当 store 中 catch 后调用 `message.error(err.message)` 时，用户看到如 `API GET /api/history failed (500): Internal Server Error` 的技术信息 | 封装为用户友好的错误消息；保留原始信息用于 console.error；按状态码映射中文提示（401=认证失败，500=服务器异常，网络错误=无法连接） | 触发一个 500 响应，验证 UI 显示中文提示而非原始 HTTP 错误 |
| UX-P1-002 | P1 | `stores/history.ts:14-17` | `loadHistory` 无 try/catch，API 失败时 `loading` 永远为 true | `const items = await api.get('/api/history'); set({ items, loading: false })` — 若 fetch 抛异常，`set({ loading: false })` 永不执行，UI 永久显示"加载中..." | 添加 try/catch/finally 确保 loading 状态重置 | 断网后访问历史页面，验证 loading 状态能正确恢复并显示错误提示 |
| UX-P1-003 | P1 | `stores/knowledge.ts:142-146` | `loadDocuments`（legacy）无 try/catch，与 history store 同样的问题 | `set({ loading: true }); const docs = await api.get('/api/knowledge'); set({ documents, loading: false })` | 添加 try/catch/finally | 同上 |
| UX-P1-004 | P1 | `stores/knowledge.ts:114-116` | `loadReadmeSuggestions` 无错误处理 | `const suggestions = await api.get(...)` 直接 await 无 try/catch，失败时 promise rejection 未被捕获 | 包裹在 try/catch 中 | 断网时打开知识库详情，验证不会出现未捕获异常 |
| UX-P1-005 | P1 | `stores/knowledge.ts:52-56,57-63` | `createKnowledgeBase` / `updateKnowledgeBase` 无 try/catch，API 失败时 UI 无反馈 | `const kb = await api.post(...)` — 若失败，Modal 保持打开，用户无任何提示 | 在 store 层或调用层添加错误处理和 `message.error` | 输入超长名称触发 400 错误，验证有错误提示 |
| UX-P1-006 | P1 | `stores/discovery.ts:80-86` | `searchPapers` 吞掉错误，用户搜索失败无任何反馈 | `catch { set({ searchLoading: false, hasSearched: true }) }` — 搜索出错时页面显示空结果，用户无法区分"无结果"和"搜索失败" | catch 中设置 error 状态，UI 展示"搜索失败，请重试" | 断网后搜索，验证显示错误提示而非空白 |
| UX-P1-007 | P1 | `stores/discovery.ts:93-101` | `loadCandidates` 吞掉错误 | 同上模式：`catch { set({ candidatesLoading: false }) }` | 同上 | 同上 |
| UX-P1-008 | P1 | `stores/batch.ts:216-223` | `loadRuns` 吞掉错误 | `catch { set({ runsLoading: false }) }` — 批次历史加载失败无反馈 | 同上 | 同上 |
| UX-P1-009 | P1 | `stores/config.ts:16-59` | `loadConfig` 无 try/catch，配置加载失败时 `loaded` 不会被设为 true | `const data = await api.get(...)` — 若失败，`loaded` 保持 false，`ApiGuard` 永远返回 null，用户看到空白页面且无错误提示 | 添加 try/catch，失败时仍设置 `loaded: true` 并设置 error 状态 | 断网后刷新页面，验证显示错误提示而非永久空白 |
| UX-P1-010 | P1 | `components/ApiGuard.tsx:16` | `!loaded` 时返回 null，用户看到空白页面 | `if (!loaded) return null` — 配置加载期间（或加载失败）无任何加载指示器 | 返回 `<Spin />` 或 skeleton 占位 | 首次加载时观察是否有 loading 反馈 |
| UX-P1-011 | P1 | `pages/HistoryDetail.tsx:15-20` | API 请求失败时显示"记录不存在"而非网络错误 | `.then(setData).finally(() => setLoading(false))` — 无 catch，失败时 data=null 显示误导性文案 | 区分"404 记录不存在"和"网络错误" | 断网后访问 /history/xxx，验证显示正确的错误信息 |
| UX-P1-012 | P1 | `pages/DocumentDetail.tsx:106-110` | 同 HistoryDetail，API 失败显示"文档不存在" | 同上模式 | 同上 | 同上 |
| UX-P2-013 | P2 | `pages/Analysis.tsx:148-160` | fallback fetch 获取全部历史记录再客户端过滤，低效且无 loading 反馈 | `api.get('/api/history').then(items => { ... find(h => h.document_id === documentId) })` — 无 loading 状态，大历史库时慢 | 改用 `/api/history?documentId=xxx` 服务端过滤，或添加 loading 状态 | 有大量历史记录时从历史详情进入分析页，观察是否有延迟 |
| UX-P2-014 | P2 | `pages/Analysis.tsx:30-95` 与 `pages/HistoryDetail.tsx:39-104` 与 `pages/DocumentDetail.tsx:29-98` | `normalizeAnalysisResult` 逻辑在三处重复实现 | 三处几乎相同的 snake_case→camelCase 转换和 legacy 格式处理 | 抽取为 `src/lib/normalize-result.ts` 共享工具函数 | 修改一处后验证三处行为一致 |
| UX-P2-015 | P2 | `pages/Knowledge.tsx:43-53,55-65,68-78` | `handleCreate`/`handleEditReadme`/`handleEditName` 的 catch 块为空，API 失败无用户反馈 | `catch { // validation error }` — 注释说 validation error 但实际也捕获 API 错误 | 区分 validation error 和 API error，API 失败时 `message.error` | 断网时创建知识库，验证有错误提示 |
| UX-P2-016 | P2 | `pages/QA.tsx:42-49` | 发送消息无超时机制，长时间无响应时用户只能看到"正在思考..." | `sendMessage(question)` 调用无 timeout，loading 状态可能持续数分钟 | 添加请求超时（如 60s），超时后自动取消并提示 | 模拟 API 无响应，验证超时行为 |
| UX-P2-017 | P2 | `pages/Discovery.tsx:79-87` | 搜索无结果时用户无法区分"搜索完成但无结果"与"搜索失败" | `hasSearched` 标志仅在搜索完成（含失败）时设为 true，失败时 `searchResults` 为空 | 在 store 中维护独立的 error 状态 | 同 UX-P1-006 验证 |
| UX-P2-018 | P2 | `pages/CitationNetwork.tsx:29-36` | 引用图谱部分加载失败时无警告 | `buildCitationGraph` 整体失败有 message.error，但部分节点获取失败时静默跳过 | 在结果中标记不完整的节点 | 搜索引用数很多的论文，验证部分失败时有提示 |
| UX-P2-019 | P2 | `pages/Settings.tsx:69-85` | `researchBackground` 字段未从 config 初始化 | `setForm(...)` 中无 `researchBackground` 的值来源，始终为空 | 从 `config.research.background` 初始化 | 打开设置页，验证研究背景字段显示已保存的值 |
| UX-P2-020 | P2 | `pages/Welcome.tsx:469-475` | 步骤 1 有"跳过此步"按钮，步骤 2 也有可选字段但无跳过按钮 | 步骤 1 底部有 `<Button type="link">跳过此步</Button>`，步骤 2 没有 | 为步骤 2 也添加跳过按钮，或移除步骤 1 的跳过按钮保持一致 | 走完 Welcome 流程，对比步骤 1 和步骤 2 的导航体验 |
| UX-P2-021 | P2 | `components/SettingsModal.tsx:127` | `loadConfig` 失败时无错误处理 | `useEffect(() => { loadConfig() }, [loadConfig])` — 依赖 store 的 loadConfig，若失败则 form 保持初始空值 | 同 UX-P1-009 | 同上 |
| UX-P2-022 | P2 | `components/SettingsModal.tsx:254-276` | 保存配置无 try/catch | `handleSaveChat` 等直接 `await saveConfig(payload)` 无错误处理 | 添加 try/catch 并 `message.error('保存失败')` | 断网时保存设置，验证有错误提示 |
| UX-P2-023 | P2 | `components/ChatMessage.tsx:39-43` | assistant 消息无 sources 时显示"无匹配的已索引来源"，措辞可能误导 | 即使回答基于通用知识而非索引文档，也显示此文案 | 区分"无来源"和"基于通用知识回答" | 使用"全部"作用域提问通用问题，验证文案准确 |
| UX-P2-024 | P2 | 全局 | 无重复提交防护 — 多个 store action 可被重复触发 | `handleCreate`（Knowledge.tsx:43）、`handleSend`（QA.tsx:42）、`handleSaveCandidate`（Discovery.tsx:89）等均无防抖/锁机制，快速双击会发送两次请求 | 为写操作添加 loading 锁或 disabled 状态；UI 按钮在请求期间设为 disabled | 快速双击"创建知识库"按钮，验证不会创建两个 |
| UX-P2-025 | P2 | `stores/qa.ts:53-60` | `loadSessions` 有 try/catch 但失败时无用户反馈 | `catch { set({ sessionsLoading: false }) }` — 吞掉错误 | 添加 `message.error` 或 store 级 error 状态 | 断网后打开问答页，验证有错误提示 |
| UX-P2-026 | P2 | `stores/history.ts:19-21` | `deleteHistory` 无 try/catch，删除失败时 UI 已移除但服务端未删除 | `await api.delete(...); set({ items: get().items.filter(...) })` — 若 delete 失败，filter 不执行但 error 未被捕获 | 添加 try/catch，失败时提示用户 | 断网时删除历史记录，验证有错误提示且记录不消失 |
| UX-P2-027 | P2 | `components/KBSelector.tsx:17` | 每次挂载都重新加载知识库列表，即使已缓存 | `useEffect(() => { loadKnowledgeBases() }, [loadKnowledgeBases])` — 每次组件 mount 都触发 API 调用 | 添加缓存检查：`if (knowledgeBases.length === 0) loadKnowledgeBases()` | 在多个使用 KBSelector 的页面间快速切换，观察网络请求 |

## 覆盖缺口

| 缺口 | 风险 | 建议测试 |
|---|---|---|
| SSE 流中断恢复 | 分析过程中网络断开，stream reader 可能卡死 | 模拟分析中途断网，验证 `running` 状态能正确重置 |
| 批量分析大文件并发 | 高并发时浏览器内存和 SSE 连接数限制 | 上传 10+ 大 PDF 并行分析，观察内存和连接稳定性 |
| 配置格式兼容性 | `loadConfig` 中 legacy→normalized 转换可能遗漏字段 | 用旧格式 config JSON 测试 loadConfig，验证所有字段正确映射 |
| 移动端响应式 | 当前 CSS 未见 media query，sidebar 和表格在窄屏可能溢出 | 在 375px 宽度下测试各页面布局 |
| Electron 环境降级 | `window.electronAPI` 在浏览器中为 undefined，TitleBar 正确处理但需验证 | 在纯浏览器环境下完整走一遍核心流程 |
| 长文本渲染性能 | `AnalysisResult` 中 Markdown 渲染大量文本无虚拟化 | 分析一篇超长论文，观察渲染卡顿 |
| Knowledge store 一致性 | `addDocumentToKB` 调用 `loadKBDocuments` 但不 await，可能产生竞态 | 快速连续添加多篇文档到同一知识库 |

## 后续任务

| 优先级 | 任务 | 负责区域 | 阻塞 |
|---|---|---|---|
| P1 | 为所有 store 的 list-loading action 添加 try/catch/finally | stores/history, knowledge, discovery, batch, config, qa | 无 |
| P1 | 封装 api.ts 错误为用户友好消息，按 HTTP 状态码映射中文提示 | services/api.ts | 无 |
| P1 | ApiGuard 添加 loading 骨架屏替代 null 返回 | components/ApiGuard.tsx | 无 |
| P1 | HistoryDetail/DocumentDetail 区分 404 和网络错误 | pages/HistoryDetail.tsx, DocumentDetail.tsx | 无 |
| P2 | 抽取 normalizeAnalysisResult 为共享工具函数 | lib/normalize-result.ts（新建） | 无 |
| P2 | 为写操作添加重复提交防护（loading 锁或 disabled） | 多个 pages/components | 无 |
| P2 | 修复 Settings.tsx researchBackground 未从 config 初始化 | pages/Settings.tsx | 无 |
| P2 | SettingsModal 保存操作添加错误处理 | components/SettingsModal.tsx | 无 |
| P2 | 统一 Welcome 各步骤的跳过/导航行为 | pages/Welcome.tsx | 无 |
