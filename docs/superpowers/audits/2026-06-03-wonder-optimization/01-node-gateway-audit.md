# Node Gateway 审计

日期：2026-06-03
范围：Node/Hono 网关入口、路由契约、存储层、Python 转发、配置标准化、SQLite schema 一致性。

## 运行的命令

| 命令 | 结果 | 备注 |
|---|---|---|
| `rg "new Hono\|app\.\|route\|fetch\(\|EventSource\|stream\|SSE\|better-sqlite3\|Database\|throw new\|try {" server tests/server` | 通过 | 覆盖 16 个源文件 + 测试文件，共 ~300 行匹配 |
| `npm test` | 失败 | 2 个测试文件失败，43 个用例失败。根因：better-sqlite3 原生模块编译版本不匹配 (NODE_MODULE_VERSION 127 vs 137)，非代码缺陷 |
| `npx tsc -p tsconfig.server.json --noEmit` | 通过 | TypeScript 类型检查零错误 |

## 发现

| ID | 优先级 | 区域 | 问题 | 证据 | 建议修复 | 建议验证 |
|---|---|---|---|---|---|---|
| NODE-P1-001 | P1 | `server/routes/qa.ts:116` | QA 会话消息端点 `POST /sessions/:id/messages` 未对 Python 后端调用做 try/catch。Python 不可用时异常冒泡为未处理错误，可能泄露内部错误信息 | `const result = await python.post<PythonQAResponse>('/api/knowledge/ask', pythonBody)` 无 try/catch 包裹 | 包裹 try/catch，返回 `{ error: '...' }, 503` | 模拟 Python 后端不可用时调用该端点，验证返回 503 而非 500 |
| NODE-P1-002 | P1 | `server/routes/knowledge-bases.ts:76-79` | 删除知识库时未清理关联的 discovery_candidates（FK SET NULL 后候选变孤立）和 readme_suggestions（CASCADE 删除但无确认） | `storage.deleteKnowledgeBase(id)` 直接调用，schema 中 `discovery_candidates.knowledge_base_id` 为 `ON DELETE SET NULL` | 删除 KB 前显式清理或确认关联数据；或在删除响应中返回影响的记录数 | 创建 KB → 添加候选 → 删除 KB → 验证候选是否应保留或被清理 |
| NODE-P1-003 | P1 | `server/routes/config.ts:50` | `syncConfigToPython` 写文件失败时静默吞错（`catch { /* ignore */ }`），导致 Node 侧返回 success 但 Python 后端配置不同步 | 第 49 行 `try { ... syncConfigToPython(...) } catch { /* ignore sync errors */ }` | 记录警告日志，或在响应中附带 `syncWarning` 字段 | 写保护 config.json 后调用 PUT /api/config，验证 Node 返回 success 但 warning |
| NODE-P1-004 | P1 | `server/services/python-backend.ts:58-78` | SSE 解析器在 `finally` 中释放 reader 时丢弃 buffer 中残余数据。若 Python 后端在发送最后一个事件后立即关闭连接（无尾部换行），该事件丢失 | `buffer` 在循环结束后可能包含未处理的最终事件行，`finally { reader.releaseLock() }` 未 flush | 在 `finally` 块中增加对 `buffer` 的最终解析（检查 `event:` 和 `data:` 行） | Python 后端在 SSE 流末尾不发送 `\n`，验证客户端仍收到 complete 事件 |
| NODE-P1-005 | P1 | `server/services/llm.ts:15-25` | `LLMService.getAppConfig()` 读取 `cfg.apiKey`（旧平铺格式），但当前 `configRoutes` 存储 `appConfig` 为标准化嵌套格式 `{ chat: { apiKey, ... } }`。虽为死代码（无路由引用），但 `healthCheck()` 方法会被未来调用方误用 | `getAppConfig` 读 `cfg.apiKey`，config route 写 `{ chat: { apiKey } }` 到 `appConfig` | 要么删除 `LLMService`（死代码），要么更新 `getAppConfig` 适配标准化格式 | grep 确认无引用后删除；或写测试验证标准化配置下 `getAppConfig` 能正确读取 |
| NODE-P2-001 | P2 | 多个路由 | 错误响应格式不一致：`/api/knowledge-bases` 用 `{ error: '名称不能为空' }`（中文），`/api/qa` 用 `{ error: 'Title is required' }`（英文），`/api/history` 用 `{ error: 'Not found' }`，`/api/qa` 用 `{ ok: true }` | 对比 `knowledge-bases.ts:41`、`qa.ts:19`、`history.ts:17`、`qa.ts:53` | 统一为 `{ error: string }` 格式，选择单一语言（建议英文） | 编写契约测试验证所有错误响应包含 `error` 字段且为英文 |
| NODE-P2-002 | P2 | `server/index.ts:84-106` | `/api/health/llm` 端点向 LLM API 发送真实消息 `'hi'` 来做健康检查，消耗 token 且可能触发速率限制 | `messages: [{ role: 'user', content: 'hi' }]` 发送到 Anthropic/OpenAI | 改为检查 API 连通性（HEAD 请求或 model list），或增加缓存/节流 | 连续调用 10 次健康检查端点，验证无 429 错误 |
| NODE-P2-003 | P2 | `server/routes/discovery.ts:48-69` | `POST /candidates` 未验证 `paperId` 和 `title` 必填字段，若缺失则 INSERT 时 DB 报错暴露 SQL 错误信息 | `body.paperId` 和 `body.title` 未做空值检查 | 添加 `if (!body.paperId \|\| !body.title) return c.json({ error: '...' }, 400)` | 发送 `{}` body 到 POST /candidates，验证返回 400 |
| NODE-P2-004 | P2 | `server/routes/citation.ts:61` | `/api/citation/graph` 在 depth=2、limit=50 时可产生 2500+ 次 OpenAlex 并发请求，无速率限制或请求上限 | `while (queue.length > 0)` BFS 循环中每节点并发 references + citations 请求 | 添加全局请求计数器上限，或降低 depth/limit 默认值 | 调用 `GET /api/citation/graph?paperId=W2741809807&depth=2&limit=50`，测量响应时间和请求量 |
| NODE-P2-005 | P2 | `server/routes/history.ts:8` | `GET /history` 默认返回 50 条，`limit` 参数无上限验证，可传入极大值导致内存问题 | `const limit = parseInt(c.req.query('limit') \|\| '50')` 无 `Math.min` | 添加 `Math.min(limit, 500)` 上限 | 传入 `limit=999999`，验证返回不超过 500 条 |
| NODE-P2-006 | P2 | `server/routes/batch.ts:26-35` | 创建批量运行时对 N 个文件执行 N 次 `createBatchItem` + N 次 `getBatchItemsByRunId`（每次查询全量），O(n²) 复杂度 | `body.files.map(f => { storage.createBatchItem(...); return storage.getBatchItemsByRunId(runId).find(...) })` | 收集 itemId 后单次查询，或 `createBatchItem` 返回插入行 | 创建 100 项批量运行，观察响应时间 |
| NODE-P2-007 | P2 | `server/routes/config.ts:66` | `PUT /api/config` 对标准化配置既写 `appConfig` key，又在 legacy 循环中重复处理 `normalizedConfig` 字段 | `storage.setConfig('appConfig', normalized)` 后 `for (const [key, value] of Object.entries(body))` 再处理 | 在循环中跳过 `normalizedConfig` 后确认无副作用 | PUT 后 GET 验证 config 状态一致 |

## 覆盖缺口

| 缺口 | 风险 | 建议测试 |
|---|---|---|
| Python 后端不可用时 QA 端点行为未测试 | Python 宕机时 QA 功能完全不可用且无友好错误 | 测试 mock python.post 抛出 `PythonBackendUnavailableError`，验证 503 响应 |
| LLMService 死代码未清理 | 未来维护者可能误用过时的 LLMService | grep 确认无引用后删除，或添加适配标准化配置的测试 |
| config syncConfigToPython 失败路径未测试 | 配置不同步导致 Python 后端使用旧配置 | mock fs.writeFileSync 抛错，验证 Node 侧行为 |
| 知识库删除级联效果未测试 | 孤立 discovery candidates 或丢失 readme suggestions | 集成测试：创建 KB → 添加候选和建议 → 删除 KB → 验证数据状态 |
| SSE 流中断场景未测试 | 用户取消分析时可能丢失部分结果 | 测试 abortController.abort() 在流式传输中途触发的行为 |
| 文件大小限制未测试 | 超大文件可能耗尽内存或超时 | 测试上传 >50000 字符文本，验证截断行为 |
| discovery POST 缺少字段验证 | 无效输入导致 DB 错误 | 发送缺少 paperId/title 的请求，验证 400 响应 |
| batch 创建大批量项的性能 | O(n²) 查询在大量文件时性能退化 | 性能测试：创建 200 项 batch run，记录响应时间 |

## 后续任务

| 优先级 | 任务 | 负责区域 | 阻塞 |
|---|---|---|---|
| P1 | 为 `qa.ts:116` 添加 Python 后端调用的 try/catch 错误处理 | QA 路由 | 否 |
| P1 | 评估知识库删除时是否需要清理关联的 discovery_candidates | 知识库路由 | 否 |
| P1 | 修复 SSE 解析器 buffer 未 flush 的问题 | Python 后端客户端 | 否 |
| P1 | 清理或更新死代码 `LLMService` | LLM 服务 | 否 |
| P1 | config syncConfigToPython 增加错误可见性 | 配置路由 | 否 |
| P2 | 统一所有路由的错误响应格式和语言 | 全部路由 | 否 |
| P2 | 为 discovery POST 添加必填字段验证 | 发现路由 | 否 |
| P2 | citation graph 添加请求上限 | 引用路由 | 否 |
| P2 | history limit 添加上限验证 | 历史路由 | 否 |
| P2 | batch 创建优化查询性能 | 批量路由 | 否 |
| P2 | 修复 better-sqlite3 原生模块版本不匹配（CI 环境） | 测试基础设施 | 否 |
