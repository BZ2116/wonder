# Node Gateway Agent Task Prompt

You are the Node Gateway Agent for Wonder's AI Core Provider Adapter migration.

## Goal

Refactor Node/Hono so frontend API paths remain stable while all AI execution is forwarded to Python AI Core.

## Required Context

Read:

- `docs/superpowers/specs/2026-06-01-ai-core-provider-adapter-design.md`
- `docs/superpowers/plans/2026-06-01-ai-core-provider-adapter.md`
- AI Gateway Agent output for Python request and response models.

## Scope

Own Node route forwarding and persistence.

Primary files:

- `server/index.ts`
- `server/routes/analysis.ts`
- `server/routes/qa.ts`
- `server/routes/config.ts`
- `server/services/python-backend.ts`
- `server/services/llm.ts`
- `tests/server/`

Do not change frontend API call sites. Frontend Agent owns Settings UI.

## Boundary Rule

After this task, Node must not construct Anthropic, OpenAI, DeepSeek, MiniMax, or embedding provider HTTP requests. Node can load config and pass it to Python.

## Implementation Steps

- [ ] Add tests showing `/api/analysis/single` calls `PythonBackendClient.post('/api/analysis/gateway', ...)`.
- [ ] Add tests showing `/api/qa` calls `PythonBackendClient.post('/api/knowledge/ask', ...)`.
- [ ] Add tests showing provider-specific headers are not built in Node route code.
- [ ] Refactor `analysisRoutes` to accept `PythonBackendClient` instead of `LLMService`.
- [ ] Preserve current frontend-facing request shape for analysis.
- [ ] Preserve current SSE events if the UI expects `step`, `progress`, `complete`, and `error`.
- [ ] Keep SQLite persistence in Node after Python returns structured analysis.
- [ ] Refactor `/api/health/llm` to call Python provider health through `PythonBackendClient`.
- [ ] Delete or empty direct model-call behavior in `server/services/llm.ts` after no route depends on it.
- [ ] Update `server/index.ts` dependency wiring.

## Suggested Tests

- Analysis route returns `complete` event with `documentId` and `historyId` when Python returns a successful response.
- Analysis route persists document and history rows.
- QA route returns answer and sources from Python.
- Python unavailable maps to a stable error response.
- `server/services/llm.ts` is not imported by active route wiring.

## Verification Commands

```powershell
npm test -- tests/server
```

```powershell
npm test
```

## Acceptance Criteria

- Existing frontend-facing Node API paths remain stable.
- Node analysis route forwards AI work to Python.
- Node QA route forwards AI work to Python.
- Node no longer directly calls model provider APIs.
- SQLite persistence remains in Node.
- SSE compatibility is preserved or explicitly covered by tests.
