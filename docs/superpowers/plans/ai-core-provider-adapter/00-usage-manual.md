# AI Core Provider Adapter Agent Usage Manual

Use this manual to assign separate work packages to multiple Agents.

## First Read

Every Agent must read:

- `docs/superpowers/specs/2026-06-01-ai-core-provider-adapter-design.md`
- `docs/superpowers/plans/2026-06-01-ai-core-provider-adapter.md`
- Its own task file in this directory.

## Assignment Order

### Wave 1: Independent Foundations

Start these two Agents first:

- Config Agent: `01-config-agent.md`
- Provider Agent: `02-provider-agent.md`

They can work in parallel because one owns normalized config shape and compatibility, while the other owns Python provider implementations.

### Wave 2: Python AI Contracts

Start after Provider Agent exposes a provider factory:

- AI Gateway Agent: `03-ai-gateway-agent.md`

This Agent connects provider adapters to Python analysis and knowledge routes.

### Wave 3: Gateway and RAG Alignment

Start these after AI Gateway contracts and provider interfaces are stable:

- Node Gateway Agent: `04-node-gateway-agent.md`
- RAG Agent: `05-rag-agent.md`

Node Gateway depends on Python route contracts. RAG depends on embedding provider behavior.

### Wave 4: Settings UI

Start after Config Agent has finalized normalized config field names:

- Frontend Agent: `06-frontend-agent.md`

This Agent should not invent a separate config schema.

### Wave 5: Final Integration

Start after all implementation tasks are merged:

- Verification Agent: `07-verification-agent.md`

This Agent owns test runs, README correction, and final architecture verification.

## Conflict Rules

- If two Agents edit the same file, the later Agent must re-read the current file before patching.
- Config shape conflicts are resolved in favor of Config Agent output.
- Provider interface conflicts are resolved in favor of Provider Agent output.
- Python request and response contract conflicts are resolved in favor of AI Gateway Agent output.
- Frontend API path conflicts are resolved in favor of preserving current frontend calls.

## Review Checklist For Each Agent

Before accepting an Agent result, check:

- It touched only the files in scope or clearly explained any extra file.
- It added or updated focused tests.
- It did not remove unrelated user changes.
- It did not introduce direct model provider calls in Node.
- It kept frontend-facing API routes stable unless explicitly documented.
- It ran the task-specific verification commands.

## Final Acceptance Checklist

- `npm test` passes.
- `python -m pytest backend/tests -q` passes.
- `/api/config` can return/save normalized config through Node.
- `/api/analysis/single` still works from the frontend perspective.
- `/api/qa` still works from the frontend perspective.
- Python provider health checks can validate chat and embedding config.
- Node no longer builds Anthropic or OpenAI provider request payloads.
- README no longer claims the active stack is Tauri and Vue.
