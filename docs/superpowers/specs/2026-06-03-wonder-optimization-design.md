# Wonder Comprehensive Optimization Design

Date: 2026-06-03

## Purpose

Wonder needs a comprehensive optimization pass without changing its current feature set. The work covers three outcomes:

- Stability and reliability hardening.
- Automated, stress, and regression testing.
- User experience polish for existing workflows.

The recommended path is audit-driven hardening. First create a reliable picture of the application's current health, then fix issues by priority, then expand test coverage and polish the user experience.

## Current Context

Wonder is an Electron desktop application with:

- React 19, TypeScript, Vite, Zustand, and Ant Design in `src/`.
- A Node/Hono gateway in `server/`.
- A Python FastAPI AI core in `backend/`.
- SQLite metadata/config storage and ChromaDB vector storage.
- Existing Vitest coverage under `tests/` and `src/**/__tests__/`.
- Existing pytest coverage under `backend/tests/`.

The important system boundary is:

```text
React/Electron UI -> Node/Hono API -> Python FastAPI AI Core -> LLM/Embedding/Search providers
```

The optimization must cover both development mode and the packaged Electron desktop mode. External providers should be mocked for most validation, with a small number of real API smoke checks for end-to-end confidence.

## Priority Model

Issues found during the audit will be classified as:

- `P0`: crash, hang, data corruption, core workflow unavailable, broken packaged desktop startup.
- `P1`: major failure with a workaround, unreliable long task, inconsistent data state, unclear but recoverable service failure.
- `P2`: user experience friction, inconsistent UI feedback, performance polish, copy or presentation issues.

The first implementation phase must prioritize `P0`, then `P1`. `P2` work is grouped into the user experience polish phase.

## Phase 1: Quality Audit

The audit creates a real health map before code changes. It must cover both fast development checks and desktop-mode behavior.

### Engineering Health

Verify:

- `npm test`
- TypeScript compilation
- Vite build
- server build
- Python pytest
- package scripts
- README/setup accuracy
- dependency and runtime assumptions

### Service Chain Health

Verify the path from frontend to Node/Hono to Python FastAPI:

- health endpoints
- config read/write and sync
- provider health checks
- timeout behavior
- error response shape
- SSE streaming analysis behavior
- Python backend unavailable behavior

### Data and File Health

Inspect:

- SQLite config, history, knowledge base metadata, and migration behavior.
- ChromaDB knowledge base isolation.
- upload and parsing behavior for PDF, DOCX, TXT, and MD.
- empty files, corrupt files, very large files, duplicate names, Chinese paths, and paths with spaces.
- deletion behavior and leftover vector/document state.

### Core User Flow Health

Cover at least:

- first launch
- provider configuration
- single document analysis
- add to knowledge base
- RAG question answering
- history list/detail
- batch analysis
- literature discovery
- citation network
- settings save/load

### Desktop Health

Verify:

- Electron main and preload behavior.
- Node gateway startup from the desktop app.
- Python AI Core startup or unavailable state.
- port conflicts.
- packaged resource paths.
- local data directory behavior.
- child process cleanup after window close.
- portable and installer build assumptions.

### Audit Output

The audit should produce a report containing:

- issue title
- priority
- affected workflow
- affected files or modules
- reproduction steps
- observed behavior
- expected behavior
- suggested fix direction
- recommended test coverage

## Phase 2: Stability Hardening

This phase fixes reliability issues without adding new features.

### Startup and Process Stability

The app must handle these states clearly:

- Node gateway unavailable.
- Python AI Core unavailable.
- port already in use.
- Python dependency missing.
- startup timeout.
- packaged resource path mismatch.
- desktop shutdown with child processes still alive.

The UI should never silently white-screen or hang when a backend service fails.

### Unified Error Handling

Node routes, Python APIs, frontend stores, and UI pages should converge on a consistent error model:

- stable error code
- user-readable message
- retryability
- technical detail for debugging
- source layer when useful

Frontend views should have error boundaries or equivalent protection for high-risk screens.

### Long Task Reliability

Long-running workflows require special attention:

- single document analysis
- batch analysis
- knowledge base ingestion
- RAG answering
- citation graph expansion

They must handle timeout, cancellation or user navigation, duplicate submission, partial failure, SSE interruption, retry, and stale progress state.

### Data Consistency

Prevent partial states between SQLite and ChromaDB:

- metadata deleted but vectors still present
- vectors written but document metadata missing
- failed ingestion leaving unusable records
- config migration producing invalid provider config
- corrupted or empty JSON config

Where transactional consistency is not possible across stores, implement explicit cleanup or recovery behavior.

### File and Path Robustness

Document handling should cover:

- empty files
- corrupt PDF/DOCX files
- unsupported extensions
- text extraction returning empty content
- large files
- duplicate names
- Chinese filenames
- paths with spaces

Failures should be clear, recoverable, and tested.

### External Provider Failures

Provider calls should distinguish:

- missing credentials
- invalid credentials
- model not found
- network failure
- timeout
- rate limit
- provider response schema mismatch

Most coverage should use mocks. A small real-provider smoke check can be optional and explicitly gated by environment configuration.

## Phase 3: Testing and Stress Testing

The test system should make future optimization safe.

### Unit Tests

Keep and expand focused tests for:

- config normalization
- discovery ranking and query generation
- batch queue and matrix logic
- RAG chunking and retrieval behavior
- provider factory behavior
- file parsing helpers
- error mapping

### API and Contract Tests

Cover request and response shape for:

- `/api/analysis`
- `/api/knowledge`
- `/api/knowledge-bases`
- `/api/qa`
- `/api/config`
- `/api/batch`
- `/api/discovery`
- `/api/citation`

Each route should include success, invalid input, empty data, provider failure, and timeout-style cases where applicable.

### Mock End-to-End Smoke Tests

Use mock providers to cover the main path:

```text
save config -> upload document -> analyze -> add to knowledge base -> ask RAG question -> view history
```

These checks should run without consuming API quota.

### Stress and Brutal Tests

Stress tests should simulate user behavior that can break desktop apps:

- concurrent multi-file upload
- repeated analyze clicks
- large document analysis
- corrupt document upload
- batch task partial failure
- rapid knowledge base switching
- delete then immediately query
- repeated app/service startup and shutdown
- repeated RAG questions
- provider timeout and retry storms

Stress tests should output a readable report with total cases, passed cases, failed cases, duration, and grouped error types.

### Desktop Smoke Tests

Desktop validation should cover:

- Electron startup.
- preload communication.
- Node gateway availability.
- Python AI Core unavailable state.
- port conflict behavior.
- app close and child process cleanup.
- packaged path and data directory assumptions.

Where full automation is expensive, keep a manual checklist with exact steps and expected results.

### Suggested Script Entrypoints

The implementation plan should consider adding:

- `npm run test:unit`
- `npm run test:server`
- `npm run test:python`
- `npm run test:smoke`
- `npm run test:stress`
- `npm run verify`

Exact script names can be adjusted to match the codebase once the implementation plan inspects current scripts in detail.

## Phase 4: User Experience Polish

This phase keeps the current feature set intact and improves existing workflows.

### First-Run Experience

The app should clearly show the status of:

- Node service
- Python AI Core
- chat provider config
- embedding provider config
- knowledge base availability

When something is missing, the UI should offer the next relevant action.

### Long Task Feedback

Analysis, batch processing, ingestion, and RAG answering should show:

- current stage
- progress where available
- stable loading state
- failure reason
- retry option where safe
- clear interruption state for SSE failures

### Error Message Quality

Technical errors should be translated into user-facing messages for:

- API key invalid
- model unavailable
- network timeout
- file parse failure
- empty knowledge base
- provider rate limit

Debug details can remain available for development or diagnostics.

### Empty and Boundary States

Improve existing states for:

- no history
- no knowledge bases
- no search results
- no provider config
- empty document content
- deleted item no longer available

### Repeated Actions and Accidental Operations

The UI should consistently handle:

- disabled/loading buttons during active operations
- duplicate submissions
- destructive confirmations
- navigation during long tasks
- stale task state after returning to a page

### Page Consistency

Align loading, error, success, progress, action button, and result display patterns across:

- Analysis
- Knowledge
- QA
- Batch
- Settings
- History
- Discovery
- Citation Network

## Parallel Agent Strategy

The task should be split at two levels.

At the design stage, split the work into stable workstreams:

- audit and risk report
- stability hardening
- test and stress infrastructure
- UX polish
- Electron packaging/runtime validation

At the implementation-plan stage, split those workstreams into small agent-ready tasks. Each task should include:

- exact objective
- files or modules in scope
- files or modules out of scope
- expected output
- verification command
- dependencies on other tasks
- merge order

This prevents multiple agents from editing the same files without coordination. It also keeps discovery work separate from implementation work.

Recommended first parallel split after this design:

- Agent 1: Node/Hono API, storage, config, and route audit.
- Agent 2: Python FastAPI, RAG, provider, and file parsing audit.
- Agent 3: React store/page UX and error-state audit.
- Agent 4: Electron startup, packaging, process lifecycle, and desktop smoke audit.
- Agent 5: Test script and stress-test infrastructure audit.

These agents should initially produce reports, not code changes. After the reports are merged into one prioritized backlog, implementation tasks can be assigned in smaller non-overlapping batches.

## Acceptance Criteria

The optimization program is successful when:

- All `P0` audit issues are fixed.
- `P1` issues are fixed or explicitly deferred with rationale.
- Every fixed `P0/P1` has an automated test or repeatable verification step.
- Mock smoke tests cover the main user workflow.
- Stress tests cover high-risk repeated and concurrent operations.
- Development mode and Electron desktop mode both have documented verification paths.
- Common failures produce clear UI feedback instead of white screens, silent hangs, or raw technical errors.
- Existing features remain functionally unchanged unless a later approved plan explicitly changes them.

## Non-Goals

This optimization does not include:

- adding new product features
- replacing the current architecture
- changing provider strategy
- redesigning the whole visual identity
- migrating away from SQLite or ChromaDB
- changing the current core AI workflows except to improve reliability

## Next Step

After this design is approved, create an implementation plan. The plan should turn the workstreams into small, parallel-safe tasks and identify which tasks can be delegated to multiple agents at the same time.
