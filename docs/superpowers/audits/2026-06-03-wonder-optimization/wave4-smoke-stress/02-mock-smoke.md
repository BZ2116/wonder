# Mock Core Flow Smoke

Date: 2026-06-03

## Coverage

The smoke test covers the main user workflow end-to-end with mocked storage and Python backend:

1. **Save config** — `PUT /api/config` persists normalized config
2. **Analyze document** — `POST /api/analysis/single` streams SSE events (step/progress/complete), stores document and history
3. **Create knowledge base** — `POST /api/knowledge-bases` creates KB
4. **Add document to KB** — `POST /api/knowledge-bases/:id/documents` triggers Python indexing
5. **Ask RAG question** — `POST /api/qa` forwards question with KB context to Python, returns answer with sources
6. **View history** — `GET /api/history` lists stored analysis results

Additional isolated tests:
- Config GET returns stored values
- Analysis returns 400 on empty text
- Knowledge base CRUD (create/list/get/delete)
- QA handles Python backend failure (503)
- History deletion

No external network/API calls occur — all storage and Python interactions are mocked.

## Commands Run

| Command | Result | Notes |
|---|---|---|
| `npm run test:smoke` | 6 passed | Smoke tests |
| `npm run test:unit` | 230 passed | No regressions |
| `npm run test:server` | 131 passed | No regressions |

## Gaps

- File upload/parse route (`filesRoutes`) not covered — it has no dependencies but handles multipart parsing which needs different test setup
- Discovery and citation routes not covered — they call OpenAlex externally
- Batch processing routes not covered
- Frontend store smoke (Zustand state transitions) not covered — would require jsdom or browser environment
