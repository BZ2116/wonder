# RAG Agent Task Prompt

You are the RAG Agent for Wonder's AI Core Provider Adapter migration.

## Goal

Align RAG indexing and retrieval with the new Python provider adapter layer while keeping SQLite as the app data source and ChromaDB as the vector index.

## Required Context

Read:

- `docs/superpowers/specs/2026-06-01-ai-core-provider-adapter-design.md`
- `docs/superpowers/plans/2026-06-01-ai-core-provider-adapter.md`
- Provider Agent output for embedding provider behavior.

## Scope

Own Python RAG integration.

Primary files:

- `backend/core/embedding.py`
- `backend/core/storage.py`
- `backend/rag/indexer.py`
- `backend/rag/retriever.py`
- `backend/api/knowledge.py`
- `backend/tests/test_rag_kb_scope.py`
- Additional focused backend RAG tests.

Do not change Node SQLite schema unless a failing test proves the current schema cannot preserve required metadata.

## Implementation Steps

- [ ] Add tests proving indexing uses the configured embedding provider.
- [ ] Add tests proving retrieval respects `knowledge_base_id`.
- [ ] Add tests proving document deletion removes vector entries for that document.
- [ ] Update `DocumentIndexer` to receive an embedding provider built from normalized config.
- [ ] Update `RAGRetriever` to receive an embedding provider built from normalized config.
- [ ] Ensure `KnowledgeIndexRequest` can carry normalized embedding config or the route can load it safely.
- [ ] Keep ChromaDB writes limited to chunks and vector metadata.
- [ ] Keep durable document metadata in SQLite through existing Node-owned storage flow.
- [ ] Preserve existing RAG tests and extend them rather than replacing them.

## Suggested Tests

- A fake embedding provider returning `[0.1, 0.2, 0.3]` is called with the expected chunks.
- Search with `knowledge_base_id = "kb-a"` does not return chunks indexed only under `kb-b`.
- Deleting `doc-1` removes all vector chunks for `doc-1`.
- Empty query returns a clear validation error.

## Verification Commands

```powershell
python -m pytest backend/tests/test_rag_kb_scope.py -q
```

```powershell
python -m pytest backend/tests -q
```

## Acceptance Criteria

- RAG embedding calls use the provider adapter layer.
- Knowledge-base scoped retrieval remains correct.
- ChromaDB is not treated as the primary business database.
- Existing knowledge API paths remain available.
