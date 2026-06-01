# Frontend Agent Task Prompt

You are the Frontend Agent for Wonder's AI Core Provider Adapter migration.

## Goal

Update Settings and frontend config state so users can configure separate chat and embedding providers without changing frontend-facing API paths.

## Required Context

Read:

- `docs/superpowers/specs/2026-06-01-ai-core-provider-adapter-design.md`
- `docs/superpowers/plans/2026-06-01-ai-core-provider-adapter.md`
- Config Agent output for final normalized config names.

## Scope

Own frontend configuration UX and state.

Primary files:

- `src/types/analysis.ts` or `src/types/config.ts`
- `src/stores/config.ts`
- `src/pages/Settings.tsx`
- `src/components/SettingsModal.tsx`
- `src/services/api.ts`
- `src/stores/__tests__/`

Do not call Python directly from the frontend.

## Provider Presets

Expose these presets in the UI:

- OpenAI-compatible
- Anthropic
- DeepSeek
- MiniMax
- Custom OpenAI-compatible

Chat and embedding settings must be separate. Users can choose Anthropic for chat and OpenAI-compatible for embeddings.

## Implementation Steps

- [ ] Read Config Agent's final normalized config type.
- [ ] Update frontend config types to match normalized config.
- [ ] Update `useConfigStore` to load and save normalized config through `/api/config`.
- [ ] Add default config creation when no saved config exists.
- [ ] Update Settings page with separate Chat Model and Embedding Model sections.
- [ ] Add provider preset selectors that fill base URL and recommended model values.
- [ ] Keep API key fields password-style.
- [ ] Keep existing global research profile editing and map it to `research.globalProfile`.
- [ ] Add tests for config store load/save behavior.
- [ ] Run frontend tests.

## Suggested Tests

- Loading legacy config from `/api/config` results in normalized frontend state.
- Saving normalized config writes `appConfig` through `/api/config`.
- Selecting DeepSeek preset fills OpenAI-compatible provider with a DeepSeek base URL.
- Selecting Anthropic chat preset does not change embedding config.

## Verification Commands

```powershell
npm test -- src/stores
```

```powershell
npm test
```

## Acceptance Criteria

- Users can configure chat and embedding providers separately.
- Frontend still talks only to Node `/api/config`.
- Existing non-settings workflows do not need to know provider details.
- UI remains consistent with the current Ant Design application style.
