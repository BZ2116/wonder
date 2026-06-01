# Config Agent Task Prompt

You are the Config Agent for Wonder's AI Core Provider Adapter migration.

## Goal

Create a normalized AI configuration shape shared by Node, Python, and the frontend while preserving existing `/api/config` behavior.

## Required Context

Read:

- `docs/superpowers/specs/2026-06-01-ai-core-provider-adapter-design.md`
- `docs/superpowers/plans/2026-06-01-ai-core-provider-adapter.md`

## Scope

Own normalized configuration and compatibility loading.

Primary files:

- `server/routes/config.ts`
- `server/services/storage.ts`
- `backend/core/config.py`
- `backend/models/schemas.py`
- `src/types/analysis.ts`
- `src/stores/config.ts`
- `tests/server/`
- `backend/tests/`

Avoid UI layout work in `src/pages/Settings.tsx`; the Frontend Agent owns that.

## Target Shape

Use this normalized config shape:

```ts
export interface NormalizedAppConfig {
  chat: {
    provider: 'openai_compatible' | 'anthropic' | 'minimax' | 'custom_openai_compatible'
    preset: string
    apiKey: string
    baseUrl: string
    model: string
    temperature: number
    maxTokens: number
  }
  embedding: {
    provider: 'openai_compatible' | 'custom_openai_compatible' | 'minimax'
    preset: string
    apiKey: string
    baseUrl: string
    model: string
    dimensions: number
  }
  knowledge: {
    enabled: boolean
    autoIndex: boolean
    contextTokenLimit: number
  }
  research: {
    globalProfile: string
  }
}
```

Python should expose equivalent Pydantic models using snake_case fields internally if needed, but API JSON should preserve camelCase where Node/frontend already use camelCase.

## Implementation Steps

- [ ] Add TypeScript config types in `src/types/analysis.ts` or a new focused `src/types/config.ts`.
- [ ] Add a Node helper that converts legacy `appConfig`, `globalUserProfile`, and `globalProfile` keys into `NormalizedAppConfig`.
- [ ] Preserve `GET /api/config` and `PUT /api/config`.
- [ ] Add a stable key such as `appConfig` that stores the normalized object as JSON.
- [ ] Keep reading old config values when normalized values are absent.
- [ ] Update `src/stores/config.ts` to parse normalized config and save normalized config.
- [ ] Add Pydantic config models in `backend/models/schemas.py`.
- [ ] Update `backend/core/config.py` defaults to include normalized `chat`, `embedding`, `knowledge`, and `research`.
- [ ] Keep compatibility for existing Python `model`, `embedding`, `research`, and `knowledge` keys.
- [ ] Add tests for default config, legacy Node config, legacy Python config, and partial config.

## Suggested Tests

Node tests:

- Legacy `appConfig` with `apiKey`, `baseUrl`, and `model` becomes `chat`.
- `globalUserProfile` and `globalProfile` become `research.globalProfile`.
- Missing embedding config gets OpenAI-compatible defaults.
- `PUT /api/config` still stores strings safely.

Python tests:

- Missing config file creates normalized defaults.
- Legacy `model.model_name` maps to `chat.model`.
- Legacy `knowledge.max_context_tokens` maps to `knowledge.contextTokenLimit`.

## Verification Commands

```powershell
npm test -- tests/server
```

```powershell
python -m pytest backend/tests -q
```

## Acceptance Criteria

- Existing config API paths still work.
- Normalized config can be loaded even when only legacy keys exist.
- Frontend store uses normalized config without requiring Python knowledge.
- Python can load normalized config without breaking existing tests.
- No provider API calls are added in this task.
