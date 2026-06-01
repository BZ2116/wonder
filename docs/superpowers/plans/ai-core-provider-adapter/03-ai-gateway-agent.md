# AI Gateway Agent Task Prompt

You are the AI Gateway Agent for Wonder's AI Core Provider Adapter migration.

## Goal

Connect Python FastAPI analysis, QA, and health routes to the provider adapter layer so Python AI Core is the only AI execution path.

## Required Context

Read:

- `docs/superpowers/specs/2026-06-01-ai-core-provider-adapter-design.md`
- `docs/superpowers/plans/2026-06-01-ai-core-provider-adapter.md`
- Provider Agent output, especially `backend/core/providers/factory.py`

## Scope

Own Python API contracts and Python Agent integration.

Primary files:

- `backend/models/schemas.py`
- `backend/api/analysis.py`
- `backend/api/knowledge.py`
- `backend/api/config.py`
- `backend/main.py`
- `backend/agents/`
- `backend/tests/`

Do not change Node route behavior in this task. Node Gateway Agent owns Node integration.

## Required Contracts

Keep `/api/analysis/gateway` available. It should accept document text, metadata, knowledge context, global profile, and normalized AI config.

Keep `/api/knowledge/ask` available. It should use RAG retrieval and provider adapters for answer generation.

Add provider health endpoints if absent:

- `POST /api/config/health/chat`
- `POST /api/config/health/embedding`

If existing route naming differs, preserve existing routes and add aliases instead of breaking callers.

## Implementation Steps

- [ ] Add Pydantic models for normalized config if Config Agent has not already added them.
- [ ] Extend `GatewayAnalysisRequest` to include optional normalized config.
- [ ] Extend `KnowledgeQARequest` to include optional normalized config.
- [ ] Update analysis agents to call `call_llm()` through the provider layer.
- [ ] Update QA agent path to call the provider layer.
- [ ] Add provider health endpoints using the provider factory.
- [ ] Add tests for gateway analysis using a mocked provider response.
- [ ] Add tests for QA using mocked retrieval and mocked provider response.
- [ ] Add tests for chat and embedding health endpoints.

## Suggested Tests

- `/api/analysis/gateway` returns `GatewayAnalysisResponse` with `status = "ok"` when provider returns valid content.
- `/api/knowledge/ask` returns answer and source chunks when retriever returns chunks.
- Chat health endpoint returns ok for a working mocked provider.
- Embedding health endpoint returns ok for a working mocked provider.
- Invalid provider config returns a clear 400 or 500 with a short error message.

## Verification Commands

```powershell
python -m pytest backend/tests -q
```

## Acceptance Criteria

- Python analysis gateway uses provider adapters.
- Python QA uses provider adapters.
- Python health checks validate configured providers.
- Existing Python route paths used by Node remain available.
- No direct Node provider integration is added.
