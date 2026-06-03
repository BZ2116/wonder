# Python AI Core 审计

日期：2026-06-03
范围：Python FastAPI 路由、Agent 体系、RAG 检索/索引、Provider 适配层、Embedding、ChromaDB 存储、文件解析。

## 运行的命令

| 命令 | 结果 | 备注 |
|---|---|---|
| `rg "FastAPI\|@app\|APIRouter\|StreamingResponse\|yield\|ThreadPoolExecutor\|try:\|except\|raise HTTPException\|chromadb\|PersistentClient\|pypdf\|docx\|timeout\|health" backend` | 通过 | 覆盖 20+ 源文件，~120 行匹配 |
| `python -m pytest backend/tests -q` | 失败 | 测试因缺少运行时依赖（fastapi, anthropic, chromadb 等）无法收集。当前环境未安装 backend/requirements.txt |

## 发现

| ID | 优先级 | 区域 | 问题 | 证据 | 建议修复 | 建议验证 |
|---|---|---|---|---|---|---|
| PY-P1-001 | P1 | `backend/api/analysis.py:114-196` | SSE 流式端点中 `run_agents()` 在 daemon 线程运行，若线程抛出未预期异常（非 `Exception` 子类，如 `SystemExit`），`put(None)` 永不执行，客户端永远收不到流终止信号 | `finally: put(None)` 在 `run_agents()` 内，但 `threading.Thread(daemon=True)` 无 join；极端情况下线程被 kill 不会执行 finally | 在 `event_stream()` 中增加超时兜底：若 `HEARTBEAT_INTERVAL * N` 秒无任何事件，主动发送 error 事件并退出 | 模拟 provider 抛出 `KeyboardInterrupt`（非 Exception），验证客户端超时后收到 error 事件 |
| PY-P1-002 | P1 | `backend/api/analysis.py:91` | `asyncio.get_event_loop()` 在 Python 3.10+ 中若无 running loop 会发出 DeprecationWarning，且在某些 ASGI 服务器配置下可能返回非当前 loop | `loop = asyncio.get_event_loop()` 在 async 函数内调用 | 改为 `loop = asyncio.get_running_loop()` | 在 uvicorn 下运行，确认无 DeprecationWarning |
| PY-P1-003 | P1 | `backend/api/knowledge.py:28-51` | `_storage` 和 `_embedding` 模块级单例无并发保护。多个请求同时触发 `get_storage_and_embedding()` 时可能创建多个 StorageManager 实例（ChromaDB PersistentClient 对同路径并发初始化行为未定义） | `global _storage, _embedding` 无锁 | 加 `threading.Lock()` 保护初始化，或在 app startup 事件中预初始化 | 并发发送 10 个 POST /api/knowledge/documents/gateway，验证 ChromaDB 无报错 |
| PY-P1-004 | P1 | `backend/core/providers/anthropic.py:78-87` | `health_check()` 向 Anthropic API 发送真实消息 `'hi'`（硬编码 `claude-haiku-4-5-20251001`），消耗 token 且可能触发速率限制；且硬编码模型名在模型下线后 health_check 永远失败 | `messages=[{"role": "user", "content": "hi"}]` + `model="claude-haiku-4-5-20251001"` | 改为轻量级 API 连通性检查（如 `models.list()` 或发送 1-token 请求），或使用缓存/节流 | 连续调用 10 次 health_check，验证无 429 错误 |
| PY-P1-005 | P1 | `backend/core/storage.py:40-51` | `delete_from_collection` 在 `knowledge_base_id` 为 None 时仅按 `doc_id` 删除，不区分知识库。若同一 doc_id 存在于多个知识库，会误删所有知识库中的该文档向量 | `where = {"doc_id": doc_id}` 无 knowledge_base_id 过滤 | 要求 `knowledge_base_id` 必传，或在调用方确认意图 | 在两个知识库中索引同 doc_id，仅从一个删除，验证另一个不受影响 |
| PY-P1-006 | P1 | `backend/rag/indexer.py:12-61` | `index_document` 先 embed 再写入 ChromaDB。若 embed 成功但 ChromaDB 写入失败（磁盘满、并发冲突），embed 调用的费用已产生但数据未持久化，且无重试或回滚机制 | `embeddings = self.embedding.embed(texts_to_embed)` 后直接 `self.storage.add_to_collection(...)` | 包裹 try/catch，失败时记录日志并向上抛出含 doc_id 的异常，便于调用方清理 | 模拟 ChromaDB 写入失败，验证异常信息包含 doc_id |
| PY-P1-007 | P1 | `backend/agents/base.py:26-39` | `call_llm` 将 `ProviderError` 转为 `RuntimeError`，丢失了原始异常类型。上层无法区分配置错误、网络错误、速率限制等不同失败模式 | `raise RuntimeError(format_provider_error(e)) from e` | 保留 ProviderError 或定义 AgentError 子类，让上层可按异常类型做不同处理 | mock provider 抛出 ProviderConfigError，验证上层能捕获到具体类型 |
| PY-P2-001 | P2 | `backend/api/knowledge.py:148-149,174-175,186-187` | 所有 knowledge 路由的异常处理均为 `raise HTTPException(status_code=500, detail=str(e))`，直接暴露内部错误信息（含堆栈、文件路径、API key 片段等） | 3 处 `except Exception as e: raise HTTPException(status_code=500, detail=str(e))` | 使用 `format_provider_error()` 清理错误信息，或返回通用错误消息 + 日志记录 | 模拟 API key 无效的异常，验证返回的 detail 不含 key 片段 |
| PY-P2-002 | P2 | `backend/core/file_reader.py:7-19` | `read_pdf` 对加密或受密码保护的 PDF 无处理。`PdfReader` 读取加密 PDF 时会抛出异常，但未被捕获 | `reader = PdfReader(BytesIO(file_bytes))` 无 `is_encrypted` 检查 | 添加 `if reader.is_encrypted: return "[PDF is encrypted, cannot extract text]"` | 用加密 PDF 文件调用 read_pdf，验证不抛异常 |
| PY-P2-003 | P2 | `backend/core/file_reader.py:22-25` | `read_docx` 对损坏的 DOCX 文件（非 ZIP 格式）无防护。`Document(BytesIO(file_bytes))` 会抛 `BadZipFile` 异常 | `doc = Document(BytesIO(file_bytes))` 无 try/catch | 包裹 try/catch，捕获 `BadZipFile` 并返回空字符串或错误标记 | 用随机字节调用 read_docx，验证不抛异常 |
| PY-P2-004 | P2 | `backend/core/file_reader.py:37-43` | `read_file` 仅判断 `.pdf` 和 `.docx`，其他所有扩展名（含 `.xlsx`, `.pptx`, `.jpg` 等二进制格式）均走 `read_text`，会输出乱码 | `return read_text(file_bytes)` 作为 fallback | 添加白名单扩展名检查，不支持的返回 `[unsupported file type]` | 传入 `.xlsx` 文件，验证返回明确错误而非乱码 |
| PY-P2-005 | P2 | `backend/core/file_reader.py:28-34` | `read_text` 的编码探测顺序为 utf-8→gbk→gb2312→utf-16，最终 fallback 用 `errors="ignore"` 会静默丢弃无法解码的字节 | `return file_bytes.decode("utf-8", errors="ignore")` | 记录警告日志，或在返回中标记部分内容可能丢失 | 传入纯二进制文件（如 ELF），验证返回非空但内容标记为不完整 |
| PY-P2-006 | P2 | `backend/core/chunker.py:4-23` | `chunk_text` 在 `start = end - overlap` 时若 `overlap >= max_chars` 会死循环（`start` 永远不前进） | `start = end - overlap`，若 overlap=7000, max_chars=7000 则 start=0 无限循环 | 添加 `assert overlap < max_chars` 或 `if overlap >= max_chars: overlap = max_chars // 2` | 调用 `chunk_text(text, max_chars=100, overlap=100)`，验证不卡死 |
| PY-P2-007 | P2 | `backend/core/chunker.py:4-23` | `chunk_text` 不处理空字符串输入。`len("") <= max_chars` 返回 `[""]`，下游 embedding 会收到空文本列表 | `if len(text) <= max_chars: return [text]` | 添加 `if not text.strip(): return []` | 调用 `chunk_text("")`，验证返回空列表 |
| PY-P2-008 | P2 | `backend/core/providers/openai_compatible.py:73-76` | `stream_chat` 中 `chunk.choices[0].delta` 若 choices 为空列表会抛 `IndexError` | `delta = chunk.choices[0].delta` 无空检查 | 添加 `if not chunk.choices: continue` | mock stream 返回 choices=[] 的 chunk，验证不抛异常 |
| PY-P2-009 | P2 | `backend/agents/orchestrator.py:152-165` | `run_streaming` 中 `ThreadPoolExecutor` 的 `future.result()` 会阻塞事件循环线程。若 writing 或 todo agent 耗时过长，SSE 心跳无法发送 | `writing_result = future_writing.result()` 在生成器内阻塞 | 使用 `asyncio.to_thread` 或将并行逻辑移到 `run_agents` 线程中 | 发送请求后观察 30 秒内是否收到心跳，验证不因 agent 阻塞而断连 |
| PY-P2-010 | P2 | `backend/core/providers/local_embedding.py:10-11` | `_model_cache` 全局字典无大小限制。若用户配置多个不同模型名，每个模型占用数百 MB 内存且永不释放 | `_model_cache: dict[str, Any] = {}` 无 eviction | 添加 LRU 限制（如 `functools.lru_cache`）或只缓存最近使用的 1 个模型 | 连续加载 5 个不同模型，验证内存使用有上限 |
| PY-P2-011 | P2 | `backend/main.py:10-16` | CORS 配置 `allow_origins=["*"]` 允许任意来源访问。生产环境应限制为已知前端域名 | `allow_origins=["*"]` | 从环境变量或配置读取允许的 origins | 从任意 origin 发送请求，验证是否被允许（当前是全部允许） |
| PY-P2-012 | P2 | `backend/api/analysis.py:48` | `ConfigManager("data/config.json")` 硬编码配置路径，且在模块加载时立即实例化。若 `data/` 目录不存在，首次 `load()` 会创建默认配置写入文件 | `config_manager = ConfigManager("data/config.json")` | 从环境变量读取路径，或在 app startup 中初始化 | 删除 data/config.json 后启动服务，验证行为符合预期 |
| PY-P2-013 | P2 | `backend/api/readme_advisor.py:33-57` | `generate_suggestions` 端点接受 `body: dict` 而非 Pydantic model，无输入验证。`body.get("readme")` 可能返回非字符串类型 | `async def generate_suggestions(body: dict)` | 定义 Pydantic request model 并添加类型验证 | 发送 `{"readme": 123}`，验证返回 422 而非 500 |
| PY-P2-014 | P2 | `backend/agents/qa.py:33` | `conversation_history[-6:]` 假设每条消息有 `role` 和 `content` 字段，但 `KnowledgeQARequest.conversation_history` 类型为 `Optional[List[dict]]`，无字段验证 | `msg['role']` 和 `msg['content']` 无 `.get()` 保护 | 使用 `msg.get('role', '')` 或在 schema 中定义 ConversationMessage model | 传入 `[{"foo": "bar"}]` 作为 history，验证不抛 KeyError |

## 覆盖缺口

| 缺口 | 风险 | 建议测试 |
|---|---|---|
| 测试因缺少运行时依赖无法执行 | 无法验证任何代码路径的正确性 | 在 CI 中配置 `pip install -r backend/requirements.txt` 后运行 pytest |
| 空文件/零内容文件未测试 | 空 PDF、空 DOCX、空文本文件可能导致下游 agent 收到空 prompt | 测试 read_pdf/read_docx/read_text 传入空 bytes |
| 大文件行为未测试 | 超大 PDF（100+ 页）可能导致内存溢出或超时 | 测试 read_pdf 传入 50MB+ 文件，观察内存和耗时 |
| 中文文件名/路径含空格未测试 | Electron 前端传入中文文件名时 storage metadata 是否正确存储 | 测试 file_name 含中文和空格的完整分析流程 |
| ChromaDB 数据损坏未测试 | 磁盘异常或强制终止后 ChromaDB 数据可能损坏 | 模拟损坏的 ChromaDB 目录，验证 StorageManager 初始化行为 |
| 嵌入维度不匹配未测试 | 切换 embedding 模型后旧向量维度不匹配可能导致查询失败 | 先用 1536 维模型索引，再用 1024 维模型查询，验证行为 |
| 并发写入 ChromaDB 未测试 | 多个请求同时 index_document 可能导致数据不一致 | 并发发送 5 个 index 请求，验证数据完整性 |
| Provider 超时行为未测试 | LLM 请求 300 秒超时后客户端行为未验证 | mock provider 延迟 301 秒响应，验证超时异常正确传播到 SSE 流 |
| 空检索结果行为未测试 | 知识库为空时 QA 端点行为未验证 | 在空知识库上提问，验证返回合理回答而非异常 |
| 配置文件损坏未测试 | config.json 被截断或写入非法 JSON 时的行为 | 写入 `{invalid json` 到 config.json，验证 ConfigManager.load() 行为 |

## 后续任务

| 优先级 | 任务 | 负责区域 | 阻塞 |
|---|---|---|---|
| P1 | SSE 流增加超时兜底，防止客户端永久挂起 | analysis.py | 否 |
| P1 | `asyncio.get_event_loop()` 改为 `asyncio.get_running_loop()` | analysis.py | 否 |
| P1 | 单例初始化加锁，防止并发创建多个 ChromaDB 实例 | knowledge.py | 否 |
| P1 | health_check 改为轻量级 API 检查，不发送真实消息 | anthropic.py | 否 |
| P1 | `delete_from_collection` 要求 knowledge_base_id 必传 | storage.py | 否 |
| P1 | index_document 增加 ChromaDB 写入失败的错误处理 | indexer.py | 否 |
| P1 | Agent 异常体系保留原始 ProviderError 类型 | base.py | 否 |
| P2 | knowledge 路由错误响应不暴露内部信息 | knowledge.py | 否 |
| P2 | PDF 加密检测 + DOCX 损坏检测 + 扩展名白名单 | file_reader.py | 否 |
| P2 | chunk_text 增加 overlap 校验和空输入处理 | chunker.py | 否 |
| P2 | stream_chat 增加空 choices 防护 | openai_compatible.py | 否 |
| P2 | generate_suggestions 端点使用 Pydantic model 验证输入 | readme_advisor.py | 否 |
| P2 | conversation_history 使用 .get() 防护 | qa.py | 否 |
| P2 | CORS origins 从配置读取 | main.py | 否 |
| P2 | 配置文件路径从环境变量读取 | analysis.py, knowledge.py | 否 |
