# AI Core Provider Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all AI execution into Python AI Core through a unified multi-provider adapter layer while preserving existing frontend-facing Node APIs.

**Architecture:** Electron and React remain the desktop client. Node/Hono remains the local gateway and SQLite state owner. Python FastAPI becomes the only AI execution layer for chat, streaming, embeddings, Agent orchestration, RAG, and provider health checks.

**Tech Stack:** Electron, React, TypeScript, Vite, Ant Design, Zustand, Hono, better-sqlite3, FastAPI, Pydantic, ChromaDB, OpenAI-compatible APIs, Anthropic Messages API, Vitest, pytest.

---

## Source Spec

Read this first:

- `docs/superpowers/specs/2026-06-01-ai-core-provider-adapter-design.md`

## Agent Task Files

Task prompts are saved under:

- `docs/superpowers/plans/ai-core-provider-adapter/`

Use these files as direct handoff prompts for separate Agents:

1. `01-config-agent.md`
2. `02-provider-agent.md`
3. `03-ai-gateway-agent.md`
4. `04-node-gateway-agent.md`
5. `05-rag-agent.md`
6. `06-frontend-agent.md`
7. `07-verification-agent.md`

## Dependency Order

Use this order when assigning work:

1. Run Task 1 and Task 2 in parallel.
2. Run Task 3 after Task 2 has produced the provider factory interface.
3. Run Task 4 after Task 3 has stable Python gateway request and response models.
4. Run Task 5 after Task 2 has stable embedding provider behavior. It can overlap with Task 4.
5. Run Task 6 after Task 1 has stable normalized config names.
6. Run Task 7 after Tasks 1 through 6 are merged.

## Integration Rules

- Keep frontend-facing API paths stable.
- Keep SQLite as the source of truth for app data.
- Keep ChromaDB scoped to vector retrieval.
- Do not let Node call chat or embedding model provider APIs directly after Task 4.
- Do not let frontend call Python directly.
- Prefer compatibility loaders over destructive config migration.
- Keep each Agent branch scoped to its assigned files where possible.

## Suggested Branches

- `codex/ai-config`
- `codex/python-providers`
- `codex/python-ai-gateway`
- `codex/node-ai-gateway`
- `codex/rag-provider-alignment`
- `codex/settings-provider-ui`
- `codex/ai-core-verification`

## Merge Strategy

1. Merge Config Agent first.
2. Merge Provider Agent second.
3. Rebase AI Gateway Agent on both config and provider changes.
4. Rebase Node Gateway Agent on AI Gateway changes.
5. Rebase RAG Agent on Provider Agent changes.
6. Rebase Frontend Agent on Config Agent changes.
7. Run Verification Agent last on the integrated branch.

## Global Verification Commands

Run these after integration:

```powershell
npm test
```

```powershell
python -m pytest backend/tests -q
```

If Python dependencies are missing:

```powershell
pip install -r backend/requirements.txt
python -m pytest backend/tests -q
```

## Completion Criteria

- Existing frontend API paths still work.
- All chat, analysis, embedding, RAG, and AI health checks execute through Python AI Core.
- Node contains no provider-specific chat or embedding API calls.
- Settings can store separate chat and embedding provider configuration.
- OpenAI-compatible and Anthropic adapters are implemented and tested.
- RAG uses configured embedding provider.
- README reflects the current Electron, React, Node/Hono, Python AI Core, SQLite, and ChromaDB architecture.
