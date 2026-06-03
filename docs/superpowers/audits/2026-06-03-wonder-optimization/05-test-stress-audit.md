# Test and Stress Audit Report

**Date:** 2026-06-03
**Project:** Wonder - AI 文献分析与知识管理工具
**Auditor:** Claude Code

## Executive Summary

This audit reveals significant gaps in test coverage, missing script entrypoints, and no stress testing infrastructure. While unit tests exist for core server routes and services, critical integration flows and stress scenarios are untested. The Python test suite is completely non-functional due to missing dependencies.

## Current Test Coverage

### JavaScript/TypeScript Tests (Vitest)

**Test Files:** 16 total
- `tests/server/services/storage.test.ts` (37 tests) - **FAILING** (better-sqlite3 Node.js version mismatch)
- `tests/server/config/normalize.test.ts` (12 tests) - PASSING
- `tests/server/routes/config.test.ts` (6 tests) - **FAILING** (better-sqlite3 issue)
- `tests/server/routes/analysis.test.ts` (10 tests) - PASSING
- `tests/server/routes/batch.test.ts` (16 tests) - PASSING
- `tests/server/routes/citation.test.ts` (8 tests) - PASSING
- `tests/server/routes/discovery.test.ts` (15 tests) - PASSING
- `tests/server/routes/knowledge-bases.test.ts` (6 tests) - PASSING
- `tests/server/routes/qa.test.ts` (18 tests) - PASSING
- `tests/server/services/python-backend.test.ts` (3 tests) - PASSING
- `src/lib/discovery/__tests__/query-generator.test.ts` (16 tests) - PASSING
- `src/lib/discovery/__tests__/ranking.test.ts` (9 tests) - PASSING
- `src/lib/discovery/__tests__/citation-graph.test.ts` (5 tests) - PASSING
- `src/lib/batch/__tests__/matrix.test.ts` (15 tests) - PASSING
- `src/stores/__tests__/config.test.ts` (8 tests) - PASSING
- `src/stores/__tests__/discovery.test.ts` (10 tests) - PASSING

**Total:** 166 tests (123 passing, 43 failing)

### Python Tests (pytest)

**Test Files:** 6 total
- `backend/tests/test_providers.py` (22 tests) - **NOT RUN** (missing dependencies)
- `backend/tests/test_config_migration.py` (7 tests) - **NOT RUN** (missing dependencies)
- `backend/tests/test_ai_gateway.py` (8 tests) - **NOT RUN** (missing dependencies)
- `backend/tests/test_analysis_contract.py` (5 tests) - **NOT RUN** (missing dependencies)
- `backend/tests/test_knowledge.py` (4 tests) - **NOT RUN** (missing dependencies)
- `backend/tests/test_rag_kb_scope.py` (8 tests) - **NOT RUN** (missing dependencies)

**Total:** 54 tests (0 runnable due to missing dependencies)

### Critical Issues

1. **better-sqlite3 Node.js version mismatch:** Tests requiring database access fail because the native module was compiled for Node.js v22 (MODULE_VERSION 127) but running on Node.js v24 (MODULE_VERSION 137).
2. **Missing Python dependencies:** `fastapi`, `anthropic`, `chromadb` are not installed, making all Python tests non-functional.
3. **No vitest.config.ts:** Vitest configuration is missing, relying on defaults.
4. **No pytest.ini/pyproject.toml:** No Python test configuration found.

## Script Gap Analysis

### Current Scripts

```json
{
  "dev": "concurrently \"vite\" \"tsx watch server/index.ts\"",
  "dev:electron": "tsc -p tsconfig.electron.json && concurrently \"vite\" \"tsx watch server/index.ts\" \"wait-on http://localhost:5173 && electron .\"",
  "build": "vite build",
  "build:server": "tsc -p tsconfig.server.json && node -e \"require('fs').cpSync('server/db','dist-server/server/db',{recursive:true})\"",
  "build:electron": "tsc -p tsconfig.electron.json && npm run build:server && vite build && electron-rebuild -f -w better-sqlite3 && electron-builder --win dir",
  "build:installer": "tsc -p tsconfig.electron.json && npm run build:server && vite build && electron-rebuild -f -w better-sqlite3 && electron-builder --win nsis",
  "rebuild:electron": "electron-rebuild -f -w better-sqlite3",
  "test": "vitest run"
}
```

### Missing Scripts

| Script | Purpose | Recommendation |
|--------|---------|----------------|
| `test:unit` | Run only unit tests (exclude integration) | Add: `vitest run --exclude tests/server/routes/**` |
| `test:server` | Run server-side tests only | Add: `vitest run tests/server/**` |
| `test:python` | Run Python test suite | Add: `python -m pytest backend/tests -q` |
| `test:smoke` | Run smoke tests | **NEW:** Create smoke test suite first |
| `test:stress` | Run stress tests | **NEW:** Create stress test suite first |
| `verify` | Run all tests + lint + type check | Add: `npm run test && npm run test:python && tsc --noEmit` |

### Dependencies Needed

- **Python:** Install requirements from `backend/requirements.txt`
- **Node.js:** Rebuild better-sqlite3 for current Node.js version: `npm rebuild better-sqlite3`

## Smoke Test Gap Analysis

### Target Flow

```
save config -> upload document -> analyze -> add to knowledge base -> ask RAG question -> view history
```

### Current Coverage Mapping

| Flow Step | Route Coverage | Integration Coverage | Gap |
|-----------|---------------|---------------------|-----|
| Save config | `tests/server/routes/config.test.ts` (6 tests) | **NONE** | No end-to-end config persistence verification |
| Upload document | **NONE** | **NONE** | No upload endpoint tests exist |
| Analyze | `tests/server/routes/analysis.test.ts` (10 tests) | **NONE** | Tests mock Python backend, no real analysis |
| Add to knowledge base | `tests/server/routes/knowledge-bases.test.ts` (6 tests) | **NONE** | Tests mock indexing, no real vector storage |
| Ask RAG question | `tests/server/routes/qa.test.ts` (18 tests) | **NONE** | Tests mock Python backend, no real retrieval |
| View history | **NONE** | **NONE** | No history endpoint tests exist |

### Critical Gaps

1. **No upload endpoint tests:** Document upload is completely untested.
2. **No history endpoint tests:** Analysis history retrieval is untested.
3. **All integration points mocked:** No tests verify actual Python backend communication.
4. **No end-to-end flow:** No test chains multiple operations together.

## Stress Test Gap Analysis

### High-Risk Cases

| Case | Risk Level | Proposed Test Type | First Implementation |
|------|-----------|-------------------|---------------------|
| Concurrent multi-file upload | HIGH | Vitest + supertest | Test 5 simultaneous uploads to same knowledge base |
| Repeated analyze clicks | HIGH | Vitest + supertest | Test 10 rapid sequential analysis requests |
| Large document analysis | MEDIUM | Vitest + supertest | Test 50MB+ document upload and analysis |
| Corrupt document upload | HIGH | Vitest + supertest | Test malformed PDF/DOCX upload handling |
| Batch task partial failure | HIGH | Vitest | Test batch with 1 failing item among 10 |
| Rapid knowledge base switching | MEDIUM | Manual Electron | Rapidly switch between 5+ knowledge bases |
| Delete then immediately query | HIGH | Vitest + supertest | Delete document, immediately query RAG |
| Repeated app/service startup/shutdown | MEDIUM | Node script | Start/stop server 10 times in sequence |
| Repeated RAG questions | MEDIUM | Vitest + supertest | Send 20 identical RAG questions rapidly |
| Provider timeout and retry storms | HIGH | Vitest | Mock provider with 5s delay, test retry logic |

### Recommended Test Infrastructure

1. **Vitest + supertest** for HTTP endpoint stress tests
2. **Node script** for startup/shutdown stress tests
3. **Manual Electron checklist** for UI-specific stress cases
4. **Python pytest** for backend-specific stress cases (after dependencies installed)

## Recommendations

### Immediate Actions (Fix Existing)

1. **Rebuild better-sqlite3:** `npm rebuild better-sqlite3` to fix 43 failing tests
2. **Install Python dependencies:** `pip install -r backend/requirements.txt`
3. **Add vitest.config.ts:** Configure test environment and paths

### Short-term (1-2 weeks)

1. **Add missing scripts:** `test:unit`, `test:server`, `test:python`, `verify`
2. **Create smoke test suite:** End-to-end flow testing with real backend
3. **Add upload endpoint tests:** Critical gap in coverage
4. **Add history endpoint tests:** Critical gap in coverage

### Medium-term (2-4 weeks)

1. **Create stress test suite:** Start with high-risk cases
2. **Add integration tests:** Remove mocks for critical paths
3. **Add CI pipeline:** Automate test runs on commit
4. **Add test coverage reporting:** Track coverage metrics

## Files Modified

None - this is a read-only audit.

## Next Steps

1. Fix existing test failures (rebuild better-sqlite3, install Python deps)
2. Add missing npm scripts
3. Create smoke test suite
4. Create stress test suite
5. Integrate into CI pipeline
