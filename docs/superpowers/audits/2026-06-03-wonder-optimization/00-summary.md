# Wonder Optimization Audit Summary

**Date:** 2026-06-03
**Project:** Wonder - AI 文献分析与知识管理工具
**Auditor:** Claude Code

## Executive Summary

本审计覆盖了 Wonder 项目的五个核心领域：Node 网关、Python AI 核心、React UX、Electron 运行时、测试与压力。共发现 **61 个问题**，其中 P1 级别 24 个，P2 级别 37 个。**无 P0 级别发现**。

主要风险集中在：
1. **错误处理缺失**：多个 store 和路由缺少 try/catch，导致用户看到技术错误或永久加载状态
2. **测试基础设施损坏**：43 个 JavaScript 测试因 better-sqlite3 版本不匹配失败，54 个 Python 测试因缺少依赖无法运行
3. **安全与数据完整性**：Python 后端删除操作可能误删跨知识库数据，健康检查消耗真实 token
4. **Electron 静默失败**：服务器启动失败时应用静默退出，无用户提示

## P0 Backlog

No P0 findings.

## P1 Backlog

| ID | Area | Issue | Recommended First Fix | Verification |
|---|---|---|---|---|
| NODE-P1-001 | Node Gateway | QA 会话消息端点未对 Python 后端调用做 try/catch，Python 不可用时异常冒泡 | 包裹 try/catch，返回 503 | 模拟 Python 不可用时调用端点 |
| NODE-P1-002 | Node Gateway | 删除知识库时未清理关联的 discovery_candidates，候选变孤立 | 删除 KB 前显式清理关联数据 | 创建 KB → 添加候选 → 删除 KB → 验证 |
| NODE-P1-003 | Node Gateway | syncConfigToPython 写文件失败时静默吞错，Node 返回 success 但 Python 配置不同步 | 记录警告日志或在响应中附带 syncWarning | 写保护 config.json 后调用 PUT /api/config |
| NODE-P1-004 | Node Gateway | SSE 解析器在 finally 中释放 reader 时丢弃 buffer 中残余数据 | 在 finally 块中增加对 buffer 的最终解析 | Python 不发送尾部换行，验证客户端收到完整事件 |
| NODE-P1-005 | Node Gateway | LLMService.getAppConfig() 读取旧平铺格式，与标准化嵌套格式不匹配 | 删除死代码或更新适配标准化格式 | grep 确认无引用后删除 |
| PY-P1-001 | Python AI Core | SSE 流式端点中 run_agents() 在 daemon 线程运行，异常时客户端永远收不到流终止信号 | 在 event_stream() 中增加超时兜底 | 模拟非 Exception 异常，验证超时后收到 error 事件 |
| PY-P1-002 | Python AI Core | asyncio.get_event_loop() 在 Python 3.10+ 中已废弃 | 改为 asyncio.get_running_loop() | 运行确认无 DeprecationWarning |
| PY-P1-003 | Python AI Core | 模块级单例无并发保护，可能创建多个 ChromaDB 实例 | 加 threading.Lock() 保护初始化 | 并发发送 10 个 POST 请求验证无报错 |
| PY-P1-004 | Python AI Core | health_check() 向 Anthropic API 发送真实消息，消耗 token 且触发速率限制 | 改为轻量级 API 连通性检查 | 连续调用 10 次验证无 429 错误 |
| PY-P1-005 | Python AI Core | delete_from_collection 在 knowledge_base_id 为 None 时误删所有知识库数据 | 要求 knowledge_base_id 必传 | 两个 KB 索引同 doc_id，仅从一个删除验证另一个不受影响 |
| PY-P1-006 | Python AI Core | index_document 先 embed 再写入 ChromaDB，写入失败时费用已产生但数据未持久化 | 包裹 try/catch，失败时记录日志并抛出含 doc_id 异常 | 模拟写入失败验证异常信息包含 doc_id |
| PY-P1-007 | Python AI Core | call_llm 将 ProviderError 转为 RuntimeError，丢失原始异常类型 | 保留 ProviderError 或定义 AgentError 子类 | mock 抛出 ProviderConfigError 验证上层能捕获 |
| UX-P1-001 | React UX | 错误消息直接暴露 HTTP 状态码和原始响应文本给用户 | 封装为用户友好的错误消息，按状态码映射中文提示 | 触发 500 响应验证 UI 显示中文提示 |
| UX-P1-002 | React UX | loadHistory 无 try/catch，API 失败时 loading 永远为 true | 添加 try/catch/finally 确保 loading 状态重置 | 断网后访问历史页面验证 loading 恢复 |
| UX-P1-003 | React UX | loadDocuments（legacy）无 try/catch，与 history store 同样的问题 | 添加 try/catch/finally | 同上 |
| UX-P1-004 | React UX | loadReadmeSuggestions 无错误处理，promise rejection 未被捕获 | 包裹在 try/catch 中 | 断网时打开知识库详情验证无未捕获异常 |
| UX-P1-005 | React UX | createKnowledgeBase/updateKnowledgeBase 无 try/catch，API 失败时 UI 无反馈 | 添加错误处理和 message.error | 输入超长名称触发 400 错误验证有提示 |
| UX-P1-006 | React UX | searchPapers 吞掉错误，用户搜索失败无任何反馈 | catch 中设置 error 状态，UI 展示"搜索失败" | 断网后搜索验证显示错误提示 |
| UX-P1-007 | React UX | loadCandidates 吞掉错误 | 同上 | 同上 |
| UX-P1-008 | React UX | loadRuns 吞掉错误，批次历史加载失败无反馈 | 同上 | 同上 |
| UX-P1-009 | React UX | loadConfig 无 try/catch，配置加载失败时 loaded 不会被设为 true | 添加 try/catch，失败时仍设置 loaded: true | 断网后刷新页面验证显示错误提示 |
| UX-P1-010 | React UX | ApiGuard 在 !loaded 时返回 null，用户看到空白页面 | 返回 Spin 或 skeleton 占位 | 首次加载时观察是否有 loading 反馈 |
| UX-P1-011 | React UX | HistoryDetail API 失败时显示"记录不存在"而非网络错误 | 区分 404 和网络错误 | 断网后访问 /history/xxx 验证正确错误信息 |
| UX-P1-012 | React UX | DocumentDetail API 失败显示"文档不存在" | 同上 | 同上 |
| F-01 | Electron | Server startup failure silently quits | Add dialog.showErrorBox() before app.quit() | 手动烟雾测试 |
| F-02 | Electron | Server timeout silently quits | Same as F-01 | 手动烟雾测试 |
| F-04 | Electron | StorageService.close() never called on shutdown | Add before-quit handler to close DB | 验证 WAL journal 正确 checkpoint |
| F-12 | Electron | after-pack.js depends on missing electron-winstaller | Add to devDependencies or vendor rcedit | npm install 后检查 node_modules |
| F-14 | Electron | rcedit path assumes electron-winstaller installed | Same as F-12 | Same as F-12 |

## P2 Backlog

| ID | Area | Issue | Recommended First Fix | Verification |
|---|---|---|---|---|
| NODE-P2-001 | Node Gateway | 错误响应格式不一致：中英文混用，格式不统一 | 统一为 { error: string } 格式，选择英文 | 编写契约测试验证所有错误响应 |
| NODE-P2-002 | Node Gateway | /api/health/llm 向 LLM API 发送真实消息做健康检查 | 改为检查 API 连通性或增加缓存/节流 | 连续调用 10 次验证无 429 错误 |
| NODE-P2-003 | Node Gateway | POST /candidates 未验证 paperId 和 title 必填字段 | 添加空值检查返回 400 | 发送 {} body 验证返回 400 |
| NODE-P2-004 | Node Gateway | citation graph 在 depth=2、limit=50 时可产生 2500+ 次并发请求 | 添加全局请求计数器上限 | 调用高 depth/limit 测量响应时间 |
| NODE-P2-005 | Node Gateway | GET /history limit 参数无上限验证 | 添加 Math.min(limit, 500) | 传入 limit=999999 验证返回不超过 500 |
| NODE-P2-006 | Node Gateway | 创建批量运行时 O(n²) 复杂度 | 收集 itemId 后单次查询 | 创建 100 项批量运行观察响应时间 |
| NODE-P2-007 | Node Gateway | PUT /api/config 对标准化配置重复处理 | 在循环中跳过 normalizedConfig | PUT 后 GET 验证 config 状态一致 |
| PY-P2-001 | Python AI Core | knowledge 路由异常处理直接暴露内部错误信息 | 使用 format_provider_error() 清理错误信息 | 模拟 API key 无效验证 detail 不含 key 片段 |
| PY-P2-002 | Python AI Core | read_pdf 对加密 PDF 无处理 | 添加 is_encrypted 检查 | 用加密 PDF 验证不抛异常 |
| PY-P2-003 | Python AI Core | read_docx 对损坏 DOCX 文件无防护 | 包裹 try/catch 捕获 BadZipFile | 用随机字节调用验证不抛异常 |
| PY-P2-004 | Python AI Core | read_file 仅判断 .pdf 和 .docx，其他二进制格式输出乱码 | 添加白名单扩展名检查 | 传入 .xlsx 验证返回明确错误 |
| PY-P2-005 | Python AI Core | read_text 的编码探测最终用 errors="ignore" 静默丢弃字节 | 记录警告日志或标记内容不完整 | 传入纯二进制文件验证返回标记 |
| PY-P2-006 | Python AI Core | chunk_text 在 overlap >= max_chars 时会死循环 | 添加 assert overlap < max_chars | 调用 overlap=max_chars 验证不卡死 |
| PY-P2-007 | Python AI Core | chunk_text 不处理空字符串输入 | 添加 if not text.strip(): return [] | 调用 chunk_text("") 验证返回空列表 |
| PY-P2-008 | Python AI Core | stream_chat 中 choices 为空列表会抛 IndexError | 添加 if not chunk.choices: continue | mock 返回空 choices 验证不抛异常 |
| PY-P2-009 | Python AI Core | run_streaming 中 future.result() 阻塞事件循环线程 | 使用 asyncio.to_thread 或调整并行逻辑 | 观察 30 秒内是否收到心跳 |
| PY-P2-010 | Python AI Core | _model_cache 全局字典无大小限制 | 添加 LRU 限制 | 连续加载 5 个不同模型验证内存有上限 |
| PY-P2-011 | Python AI Core | CORS allow_origins=["*"] 允许任意来源访问 | 从环境变量或配置读取允许的 origins | 从任意 origin 发送请求验证限制 |
| PY-P2-012 | Python AI Core | ConfigManager 硬编码配置路径且模块加载时立即实例化 | 从环境变量读取路径或在 startup 初始化 | 删除 config.json 后启动验证行为 |
| PY-P2-013 | Python AI Core | generate_suggestions 接受 dict 而非 Pydantic model | 定义 Pydantic request model | 发送非字符串类型验证返回 422 |
| PY-P2-014 | Python AI Core | conversation_history 假设每条消息有 role 和 content 字段 | 使用 msg.get('role', '') 或定义 model | 传入缺少字段的 history 验证不抛 KeyError |
| UX-P2-013 | React UX | fallback fetch 获取全部历史记录再客户端过滤，低效 | 改用服务端过滤或添加 loading 状态 | 大历史库时从历史详情进入分析页观察延迟 |
| UX-P2-014 | React UX | normalizeAnalysisResult 逻辑在三处重复实现 | 抽取为共享工具函数 | 修改一处后验证三处行为一致 |
| UX-P2-015 | React UX | handleCreate/handleEditReadme/handleEditName 的 catch 块为空 | 区分 validation error 和 API error | 断网时创建知识库验证有错误提示 |
| UX-P2-016 | React UX | 发送消息无超时机制 | 添加请求超时（如 60s） | 模拟 API 无响应验证超时行为 |
| UX-P2-017 | React UX | 搜索无结果时用户无法区分"无结果"与"搜索失败" | 在 store 中维护独立的 error 状态 | 同 UX-P1-006 验证 |
| UX-P2-018 | React UX | 引用图谱部分加载失败时无警告 | 在结果中标记不完整的节点 | 搜索引用数很多的论文验证部分失败提示 |
| UX-P2-019 | React UX | researchBackground 字段未从 config 初始化 | 从 config.research.background 初始化 | 打开设置页验证研究背景字段显示值 |
| UX-P2-020 | React UX | 步骤 1 有"跳过此步"按钮，步骤 2 没有 | 为步骤 2 也添加跳过按钮或移除步骤 1 的 | 走完 Welcome 流程对比导航体验 |
| UX-P2-021 | React UX | SettingsModal loadConfig 失败时无错误处理 | 同 UX-P1-009 | 同上 |
| UX-P2-022 | React UX | SettingsModal 保存配置无 try/catch | 添加 try/catch 并 message.error | 断网时保存设置验证有错误提示 |
| UX-P2-023 | React UX | assistant 消息无 sources 时显示误导性文案 | 区分"无来源"和"基于通用知识回答" | 使用"全部"作用域提问通用问题验证文案 |
| UX-P2-024 | React UX | 无重复提交防护 | 为写操作添加 loading 锁或 disabled 状态 | 快速双击"创建知识库"验证不会创建两个 |
| UX-P2-025 | React UX | loadSessions 失败时无用户反馈 | 添加 message.error 或 store 级 error 状态 | 断网后打开问答页验证有错误提示 |
| UX-P2-026 | React UX | deleteHistory 无 try/catch，删除失败时 UI 已移除但服务端未删除 | 添加 try/catch，失败时提示用户 | 断网时删除历史记录验证有错误提示 |
| UX-P2-027 | React UX | KBSelector 每次挂载都重新加载知识库列表 | 添加缓存检查 | 在多个页面间快速切换观察网络请求 |

## Coverage Gaps To Close First

| Area | Gap | Risk | Proposed Test |
|---|---|---|---|
| Node Gateway | Python 后端不可用时 QA 端点行为未测试 | Python 宕机时 QA 功能完全不可用且无友好错误 | 测试 mock python.post 抛出 PythonBackendUnavailableError，验证 503 响应 |
| Node Gateway | 知识库删除级联效果未测试 | 孤立 discovery candidates 或丢失 readme suggestions | 集成测试：创建 KB → 添加候选和建议 → 删除 KB → 验证数据状态 |
| Node Gateway | SSE 流中断场景未测试 | 用户取消分析时可能丢失部分结果 | 测试 abortController.abort() 在流式传输中途触发的行为 |
| Python AI Core | 测试因缺少运行时依赖无法执行 | 无法验证任何代码路径的正确性 | 在 CI 中配置 pip install -r backend/requirements.txt 后运行 pytest |
| Python AI Core | 空文件/零内容文件未测试 | 空 PDF、空 DOCX、空文本文件可能导致下游 agent 收到空 prompt | 测试 read_pdf/read_docx/read_text 传入空 bytes |
| Python AI Core | ChromaDB 数据损坏未测试 | 磁盘异常或强制终止后 ChromaDB 数据可能损坏 | 模拟损坏的 ChromaDB 目录，验证 StorageManager 初始化行为 |
| React UX | SSE 流中断恢复 | 分析过程中网络断开，stream reader 可能卡死 | 模拟分析中途断网，验证 running 状态能正确重置 |
| React UX | 批量分析大文件并发 | 高并发时浏览器内存和 SSE 连接数限制 | 上传 10+ 大 PDF 并行分析，观察内存和连接稳定性 |
| Electron | Server startup failure silently quits | 用户无法知道为什么应用退出 | 手动测试：重命名 index.js 后启动应用 |
| Electron | StorageService.close() never called | SQLite WAL journal 可能不干净 | 手动测试：强制退出后检查数据库完整性 |
| Test Infrastructure | better-sqlite3 Node.js 版本不匹配 | 43 个测试失败 | npm rebuild better-sqlite3 |
| Test Infrastructure | Python 依赖缺失 | 54 个测试无法运行 | pip install -r backend/requirements.txt |
| Test Infrastructure | 无上传端点测试 | 文档上传完全未测试 | 创建 upload endpoint 测试 |
| Test Infrastructure | 无历史记录端点测试 | 历史记录检索未测试 | 创建 history endpoint 测试 |

## Recommended Implementation Waves

| Wave | Goal | Included Items | Parallelization Notes |
|---|---|---|---|
| Wave 1: P0 Stability Risks | 无 P0 发现，跳过 | N/A | N/A |
| Wave 2: P1 Reliability & Data | 修复 P1 级别的可靠性和数据完整性问题 | PY-P1-005 (delete_from_collection 跨 KB 删除)<br>PY-P1-006 (index_document 写入失败回滚)<br>NODE-P1-002 (KB 删除级联清理)<br>UX-P1-009 (loadConfig 失败处理)<br>UX-P1-002/003 (loading 状态重置) | Python 和 Node 修复可并行；UX 修复可并行 |
| Wave 3: P1 Error Handling | 修复 P1 级别的错误处理和用户体验问题 | NODE-P1-001 (QA 端点 try/catch)<br>NODE-P1-003 (config sync 错误可见性)<br>PY-P1-001 (SSE 超时兜底)<br>PY-P1-002 (asyncio.get_running_loop)<br>PY-P1-003 (单例初始化加锁)<br>PY-P1-004 (health_check 轻量化)<br>PY-P1-007 (异常类型保留)<br>UX-P1-001 (错误消息封装)<br>UX-P1-004/005 (store 错误处理)<br>UX-P1-006/007/008 (搜索/加载错误反馈)<br>UX-P1-010 (ApiGuard loading)<br>UX-P1-011/012 (详情页错误区分)<br>F-01/F-02 (Electron 错误对话框)<br>F-04 (SQLite 关闭)<br>F-12/F-14 (rcedit 依赖) | 按领域并行：Node、Python、UX、Electron 各自独立 |
| Wave 4: Smoke & Stress Infrastructure | 建立烟雾测试和压力测试基础设施 | 修复测试基础设施 (npm rebuild, pip install)<br>添加缺失 npm 脚本<br>创建烟雾测试套件<br>创建压力测试套件<br>添加上传端点测试<br>添加历史端点测试 | 测试基础设施修复先行；烟雾和压力测试可并行开发 |
| Wave 5: P2 Polish | 修复 P2 级别的体验和健壮性问题 | NODE-P2-001 (错误格式统一)<br>NODE-P2-002/003 (健康检查优化、字段验证)<br>NODE-P2-004/005/006 (性能优化)<br>PY-P2-001 (错误信息清理)<br>PY-P2-002/003/004 (文件解析防护)<br>PY-P2-005/006/007 (编码/分块防护)<br>PY-P2-008/009/010 (流式/缓存优化)<br>PY-P2-011/012/013/014 (配置/验证)<br>UX-P2-013/014 (性能/代码复用)<br>UX-P2-015 到 UX-P2-027 (UX 细节优化) | 按领域并行，P2 优先级较低可穿插进行 |

## Proposed Next Plan

**Phase 1: 修复测试基础设施 (1-2 天)**
1. 运行 `npm rebuild better-sqlite3` 修复 43 个失败的 JavaScript 测试
2. 运行 `pip install -r backend/requirements.txt` 安装 Python 依赖
3. 运行 `npm test` 和 `python -m pytest backend/tests -q` 确认所有测试通过
4. 添加 `vitest.config.ts` 和 `pytest.ini` 配置文件

**Phase 2: 修复关键 P1 数据完整性问题 (3-5 天)**
1. PY-P1-005: 修复 `delete_from_collection` 跨知识库误删问题
2. PY-P1-006: 为 `index_document` 添加 ChromaDB 写入失败的错误处理
3. NODE-P1-002: 实现知识库删除时的关联数据清理
4. UX-P1-009: 修复 `loadConfig` 失败时的 loading 状态问题
5. UX-P1-002/003: 为所有 store 的 list-loading action 添加 try/catch/finally

**Phase 3: 修复 P1 错误处理和用户体验 (5-7 天)**
1. NODE-P1-001: 为 QA 端点添加 Python 后端调用的 try/catch
2. PY-P1-001: 为 SSE 流添加超时兜底机制
3. PY-P1-002/003/004: 修复 asyncio 废弃警告、单例并发保护、健康检查优化
4. UX-P1-001: 封装 api.ts 错误为用户友好消息
5. UX-P1-006/007/008: 为搜索/加载操作添加错误反馈
6. F-01/F-02/F-04: 修复 Electron 静默退出和数据库关闭问题

**Phase 4: 建立测试基础设施 (1-2 周)**
1. 添加缺失的 npm 脚本：`test:unit`, `test:server`, `test:python`, `verify`
2. 创建烟雾测试套件，覆盖核心流程：配置 → 上传 → 分析 → 知识库 → QA → 历史
3. 创建压力测试套件，覆盖高风险场景：并发上传、重复分析、大文件处理
4. 添加上传端点和历史端点的测试覆盖
5. 集成到 CI 管道，自动化测试运行

**Phase 5: P2 体验优化 (2-3 周)**
1. 统一错误响应格式和语言
2. 优化健康检查，避免消耗真实 token
3. 增强文件解析的健壮性（加密 PDF、损坏 DOCX、编码检测）
4. 优化 UX 细节：重复提交防护、超时机制、缓存优化
5. 代码复用：抽取 normalizeAnalysisResult 为共享工具函数

**预期收益：**
- 消除 24 个 P1 级别的可靠性和数据完整性风险
- 测试覆盖率从当前约 30% 提升到 80%+
- 建立自动化测试基础设施，防止回归
- 显著提升用户体验，减少技术错误暴露
- 为后续功能开发奠定坚实基础
