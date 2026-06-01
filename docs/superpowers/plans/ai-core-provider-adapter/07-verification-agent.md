# Verification Agent Task Prompt

You are the Verification Agent for Wonder's AI Core Provider Adapter migration.

## Goal

Verify the integrated migration, update documentation, and confirm the architecture matches the approved design.

## Required Context

Read:

- `docs/superpowers/specs/2026-06-01-ai-core-provider-adapter-design.md`
- `docs/superpowers/plans/2026-06-01-ai-core-provider-adapter.md`
- All task files in `docs/superpowers/plans/ai-core-provider-adapter/`

## Scope

Own final verification and documentation.

Primary files:

- `README.md`
- `docs/`
- `tests/`
- `backend/tests/`
- Any failing tests that need small integration fixes.

Do not perform broad feature refactors. If implementation gaps are large, report them with exact failing evidence.

## Implementation Steps

- [ ] Run `git status --short` and identify uncommitted files.
- [ ] Run Node tests.
- [ ] Run Python tests.
- [ ] Search for direct provider calls in Node.
- [ ] Search for frontend calls to Python URLs.
- [ ] Verify config supports separate chat and embedding providers.
- [ ] Verify analysis API still presents the same frontend-facing path.
- [ ] Verify QA API still presents the same frontend-facing path.
- [ ] Update README to describe the current architecture: Electron, React, Node/Hono, Python AI Core, SQLite, ChromaDB.
- [ ] Add provider extension docs under `docs/` if not already present.
- [ ] Produce a final verification report listing commands, results, and residual risks.

## Required Search Commands

```powershell
rg "api\\.anthropic|anthropic-version|OpenAI\\(|embeddings\\.create|/v1/messages|chat/completions" server src
```

Expected after migration:

- No active Node or frontend provider API calls.
- If matches remain in deleted compatibility files or docs, explain them.

```powershell
rg "127\\.0\\.0\\.1:8000|PYTHON_BACKEND_URL" src
```

Expected after migration:

- Frontend does not call Python directly.

## Verification Commands

```powershell
npm test
```

```powershell
python -m pytest backend/tests -q
```

## Acceptance Criteria

- All tests pass or failures are documented with exact causes.
- README matches the actual architecture.
- Node does not directly call model providers.
- Frontend does not directly call Python AI Core.
- Provider adapter docs explain how to add another provider.
- Final report clearly states whether the migration is complete.
