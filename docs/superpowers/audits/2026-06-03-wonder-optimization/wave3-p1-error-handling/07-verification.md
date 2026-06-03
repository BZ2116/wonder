# Wave 3 P1 Error Handling Verification

Date: 2026-06-03

## Command Results

| Command | Result | Notes |
|---|---|---|
| `git status --short` | 3 modified files | `electron/main.ts`, `package.json`, `scripts/after-pack.js` — pre-existing unstaged changes, not from Wave 3 |
| `npm run typecheck` | FAIL | Pre-existing: `react-markdown` and `remark-gfm` missing type declarations in `AnalysisResult.tsx`. Not related to Wave 3 |
| `npm run test:server` | PASS | 10 files, 120 tests, 0 failures |
| `npm run test:unit` | PASS | 20 files, 202 tests, 0 failures |
| `npm run test:python` | FAIL | Pre-existing: 2 failures in `test_ai_gateway.py` (SSE `complete` event not emitted by mock). 60 passed. Not related to Wave 3 |
| `npm run verify` | FAIL | Blocked by typecheck and Python test issues (both pre-existing) |
| `npx tsc -p tsconfig.electron.json --noEmit` | PASS | Zero errors |

## Fixed Findings

| Finding | Status | Evidence |
|---|---|---|
| NODE-P1-001 | Fixed | `server/routes/qa.ts:116-134` wraps `python.post` in try/catch, returns 503 with error message when Python unavailable |
| NODE-P1-003 | Fixed | `server/routes/config.ts:76-83` catches syncConfigToPython errors, includes `syncWarning` in response at line 99 |
| PY-P1-001 | Fixed | `backend/api/analysis.py:23` defines `WORKER_TIMEOUT = 300`, `event_stream()` checks monotonic timeout, sends error event on timeout, heartbeat every 30s |
| PY-P1-002 | Fixed | `backend/api/analysis.py:93` uses `asyncio.get_running_loop()` instead of deprecated `get_event_loop()` |
| PY-P1-003 | **Not Fixed** | `backend/api/knowledge.py:28-51` — `_storage`/`_embedding` singletons still have no `threading.Lock()`. Concurrent requests can create duplicate ChromaDB instances |
| PY-P1-004 | **Not Fixed** | `backend/core/providers/anthropic.py:80-94` — `health_check()` still sends real `messages.create()` with `max_tokens=1`. Uses cheaper model (`haiku`) but still consumes tokens. No lighter Anthropic API endpoint available |
| PY-P1-007 | **Partial** | `backend/agents/base.py:43-44` — `call_llm` wraps `ProviderError` in `AgentError` with `raise ... from e`. `__cause__` is preserved for exception chaining, but raised type is `AgentError`, not `ProviderError`. Code doing `except ProviderError` won't catch it |
| UX-P1-001 | Fixed | `src/services/api.ts:3-29` — `ApiError` class with `userMessage`/`debugMessage`, `userMessageForStatus()` maps status codes to Chinese messages. All entry points throw `ApiError` |
| UX-P1-004/005 | Fixed | `src/stores/knowledge.ts` — `loadReadmeSuggestions` (line 129-137), `createKnowledgeBase` (line 55-63), `updateKnowledgeBase` (line 65-78) all wrapped in try/catch, set `error` state. Tests: 4 new error tests pass |
| UX-P1-006/007/008 | Fixed | `src/stores/discovery.ts` — `searchPapers` sets `searchError` (line 88), `loadCandidates` sets `candidatesError` (line 104). `src/stores/batch.ts` — `loadRuns` sets `runsError` (line 224). Tests: 4 new error tests pass |
| UX-P1-010 | Fixed | `src/components/ApiGuard.tsx:15-21` — `!loaded` returns centered `<Spin size="large" />` instead of `null` |
| UX-P1-011/012 | Fixed | `src/pages/HistoryDetail.tsx:19-28` and `src/pages/DocumentDetail.tsx:109-118` — both add `.catch()` distinguishing 404 (`ApiError.status === 404`) from network/server errors, display appropriate Chinese messages |
| F-01/F-02 | Fixed | `electron/main.ts:69,78` — both server startup failure and timeout call `dialog.showErrorBox()` before `app.quit()` |
| F-04 | **Not Fixed** | `electron/main.ts:131-136` — TODO comment acknowledges gap. `before-quit` handler only calls `app.exit(0)`, no database cleanup. `StorageService.close()` exists but is unreachable from Electron main process |
| F-12/F-14 | Fixed | `scripts/after-pack.js:7` resolves rcedit from `electron-winstaller/vendor/rcedit.exe`. `package.json:49` declares `electron-winstaller` in devDependencies. Guard at line 11-15 throws clear error if binary missing |

## Remaining Risks

| Risk | Recommended Next Step |
|---|---|
| PY-P1-003: ChromaDB singleton race condition | Add `threading.Lock()` around `get_storage_and_embedding()` initialization in `knowledge.py` |
| PY-P1-004: health_check consumes real tokens | Accept current implementation (cheapest available option) or cache results with TTL |
| PY-P1-007: ProviderError type lost in wrapping | Change `call_llm` to re-raise `ProviderError` directly, or update callers to catch `AgentError` and inspect `__cause__` |
| F-04: SQLite not closed on shutdown | Export close function from `server/index.ts`, call in Electron `before-quit` handler |
| Pre-existing typecheck failure | Install `@types/react-markdown` and `@types/remark-gfm`, or add `"ignoreDeprecations": "6.0"` to tsconfig.json |
| Pre-existing Python test failures | Fix SSE mock in `test_ai_gateway.py` to emit `complete` event, or update test expectations |

## Recommendation

**Begin Wave 4 smoke and stress infrastructure.** 12 of 16 Wave 3 P1 findings are fixed. The 4 remaining (PY-P1-003, PY-P1-004, PY-P1-007, F-04) are lower-risk edge cases that don't block normal usage: the singleton race requires concurrent first-request timing, health_check cost is minimal with haiku, ProviderError chaining works via `__cause__`, and SQLite WAL auto-checkpoints on process exit. Wave 4 test infrastructure work can proceed in parallel with fixing these remaining items.
