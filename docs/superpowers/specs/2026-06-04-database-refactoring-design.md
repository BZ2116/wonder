# Database And Vector Store Refactoring Design

**Date:** 2026-06-04
**Status:** Draft for user review
**Scope:** Database schema, migration framework, and vector store organization for future RAG expansion

## Problem Statement

The current persistence model works, but it mixes long-lived facts, current analysis results, historical snapshots, and vector index state in ways that will make later RAG work harder.

Current issues:

1. `documents` is bloated. It stores file metadata, lifecycle fields, and large analysis blobs in one table.
2. `documents.index_status`, `index_error`, and `indexed_at` describe vector indexing globally, but indexing is actually scoped by knowledge base, embedding model, vector backend, and collection.
3. `chunks.embedding` exists in SQLite, while the primary RAG vector store is ChromaDB. Their responsibilities are not explicit.
4. `discovery_candidates` duplicates paper metadata already stored in `paper_nodes`.
5. Migration logic is currently ad hoc. The existing startup migration only adds lifecycle columns and does not provide a versioned migration path for table rebuilds.

The refactor should make the project sturdier without over-normalizing everything. SQLite remains the source of truth for application facts and index bookkeeping. ChromaDB remains the primary vector search backend.

## Design Principles

- Keep frequently listed metadata separate from large analysis blobs.
- Treat `analysis_history` as immutable snapshots and `document_analysis` as the current analysis result.
- Treat SQLite `chunks` as source text chunks, not the primary vector database.
- Track vector indexes explicitly per document, knowledge base, backend, collection, embedding configuration, and version.
- Keep API responses backward compatible during the first migration.
- Use versioned, transactional, repeatable migrations with validation.

## Target Architecture

### 1. Document Fact Layer

`documents` should hold document identity, file metadata, and document-level lifecycle only.

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_type TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  match_score REAL,
  lifecycle_status TEXT DEFAULT 'analyzed'
);
```

Notes:

- Remove analysis blob columns from `documents`.
- Remove vector index columns from `documents` as the canonical source.
- During compatibility mode, `StorageService` can still expose `index_status`, `index_error`, and `indexed_at` by aggregating from `document_vector_indexes`.

### 2. Current Analysis Layer

`document_analysis` stores the latest analysis result for a document.

```sql
CREATE TABLE document_analysis (
  document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  summary TEXT,
  reading_card TEXT,
  relation_analysis TEXT,
  writing_materials TEXT,
  todo_list TEXT,
  tags TEXT,
  analysis_version INTEGER DEFAULT 1,
  source_history_id TEXT REFERENCES analysis_history(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

Notes:

- This is one-to-one with `documents`.
- It represents the current best analysis, not the full history.
- The existing large TEXT fields stay as TEXT because they are rarely queried internally and are usually rendered as blobs.
- `source_history_id` connects the current result to the historical snapshot that produced it.

`analysis_history` remains unchanged in purpose: append-only-ish snapshots for detail views, batch matrix extraction, debugging, and backward compatibility.

### 3. Chunk Source Layer

`chunks` stores source text chunks. It should not be treated as the primary vector index table.

```sql
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding BLOB,
  chunk_index INTEGER NOT NULL
);
```

Notes:

- Keep `embedding BLOB` for now as a legacy/local-cache field.
- Do not use `chunks.embedding` as the canonical RAG index status.
- A later migration can remove it after the codebase confirms it is unused.

### 4. Vector Index Bookkeeping Layer

Add `document_vector_indexes` as the SQLite ledger for vector indexes.

```sql
CREATE TABLE document_vector_indexes (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  backend TEXT NOT NULL DEFAULT 'chroma',
  collection_name TEXT NOT NULL DEFAULT 'documents',
  embedding_provider TEXT,
  embedding_model TEXT,
  embedding_dimensions INTEGER,
  chunk_count INTEGER DEFAULT 0,
  index_version INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'not_indexed',
  error TEXT,
  indexed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, knowledge_base_id, backend, collection_name, index_version)
);
```

Recommended status values:

- `not_indexed`
- `indexing`
- `indexed`
- `stale`
- `failed`
- `deleted`

When to mark an index `stale`:

- The document is re-analyzed.
- The chunking strategy changes.
- The embedding provider, model, or dimensions change.
- The Chroma collection naming strategy changes.
- Knowledge-base scoped metadata used by retrieval changes in a way that should affect vector metadata.

This table is the extension point for future RAG work: reindex queues, multiple vector backends, collection migration, hybrid retrieval, and per-KB index state.

### 5. ChromaDB Collection Strategy

ChromaDB should store the actual vectors and run similarity search. SQLite should store the facts and the index ledger.

Use collection names derived from embedding configuration instead of mixing incompatible embeddings in one collection:

```text
documents__openai_compatible__text_embedding_3_small__1536
documents__openai_compatible__text_embedding_3_large__3072
documents__minimax__text_embedding_003__1536
documents__local__bge_small_zh__512
```

Collection naming rules:

- Normalize provider/model names to lowercase.
- Replace non-alphanumeric runs with `_`.
- Include dimensions.
- Store the final collection name in `document_vector_indexes.collection_name`.

Chroma metadata should include enough information to trace every vector back to SQLite:

```python
{
  "vector_id": "...",
  "doc_id": "...",
  "knowledge_base_id": "...",
  "index_id": "...",
  "chunk_id": "...",
  "chunk_type": "summary" or "content",
  "chunk_index": 0,
  "file_name": "...",
  "embedding_provider": "...",
  "embedding_model": "...",
  "embedding_dimensions": 1536,
  "index_version": 1,
  "analysis_version": 1,
  "tags": "...",
  "created_at": "..."
}
```

Retrieval should:

1. Resolve eligible `document_vector_indexes` rows from SQLite.
2. Select the correct Chroma collection from those rows.
3. Query only matching `knowledge_base_id`, `index_id`, `doc_id`, or other metadata filters.
4. If eligible rows span multiple collections, query each collection and merge or rerank results by normalized distance.
5. Return `doc_id`, `chunk_id`, and `index_id` so the UI and API can trace results back to SQLite.

### 6. Paper Metadata Layer

`paper_nodes` becomes the single source of truth for paper metadata.

```sql
CREATE TABLE paper_nodes (
  paper_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  abstract TEXT,
  year INTEGER,
  citation_count INTEGER DEFAULT 0,
  influential_citation_count INTEGER DEFAULT 0,
  venue TEXT,
  authors TEXT,
  url TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

`discovery_candidates` stores candidate-specific state and ranking only.

```sql
CREATE TABLE discovery_candidates (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES paper_nodes(paper_id) ON DELETE CASCADE,
  source_query TEXT,
  discovery_priority_score REAL DEFAULT 0,
  discovery_reason TEXT,
  state TEXT NOT NULL DEFAULT 'saved',
  knowledge_base_id TEXT REFERENCES knowledge_bases(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

SQLite allows multiple `NULL` values in a unique constraint. Candidate deduplication therefore needs partial unique indexes rather than only `UNIQUE(paper_id, knowledge_base_id)`:

```sql
CREATE UNIQUE INDEX idx_discovery_candidates_unique_kb
  ON discovery_candidates(paper_id, knowledge_base_id)
  WHERE knowledge_base_id IS NOT NULL;

CREATE UNIQUE INDEX idx_discovery_candidates_unique_global
  ON discovery_candidates(paper_id)
  WHERE knowledge_base_id IS NULL;
```

Discovery reads should join `paper_nodes`:

```sql
SELECT
  dc.*,
  pn.title,
  pn.abstract,
  pn.year,
  pn.citation_count,
  pn.influential_citation_count,
  pn.venue,
  pn.authors,
  pn.url
FROM discovery_candidates dc
JOIN paper_nodes pn ON dc.paper_id = pn.paper_id
WHERE dc.knowledge_base_id = ?;
```

### 7. Tables Left Mostly Unchanged

These tables remain structurally acceptable for this refactor:

- `config`
- `analysis_history`
- `knowledge_bases`
- `document_knowledge_bases`
- `readme_suggestions`
- `batch_runs`
- `batch_items`
- `qa_sessions`
- `qa_messages`
- `paper_edges`

`qa_sessions.scope_ids`, `qa_messages.sources`, and `analysis_history.result` may stay as JSON-in-TEXT because they are snapshots/config-like payloads and are not currently queried relationally.

## Indexes And Constraints

Add or keep these indexes:

```sql
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_chunks_document_id ON chunks(document_id);
CREATE UNIQUE INDEX idx_chunks_doc_chunk_index ON chunks(document_id, chunk_index);

CREATE INDEX idx_document_analysis_updated_at ON document_analysis(updated_at DESC);

CREATE INDEX idx_document_vector_indexes_doc_id
  ON document_vector_indexes(document_id);
CREATE INDEX idx_document_vector_indexes_kb_status
  ON document_vector_indexes(knowledge_base_id, status);
CREATE INDEX idx_document_vector_indexes_collection
  ON document_vector_indexes(backend, collection_name);

CREATE INDEX idx_discovery_candidates_kb_state
  ON discovery_candidates(knowledge_base_id, state);
CREATE INDEX idx_discovery_candidates_paper_id
  ON discovery_candidates(paper_id);
CREATE UNIQUE INDEX idx_discovery_candidates_unique_kb
  ON discovery_candidates(paper_id, knowledge_base_id)
  WHERE knowledge_base_id IS NOT NULL;
CREATE UNIQUE INDEX idx_discovery_candidates_unique_global
  ON discovery_candidates(paper_id)
  WHERE knowledge_base_id IS NULL;

CREATE INDEX idx_batch_items_run_id ON batch_items(batch_run_id);
CREATE INDEX idx_batch_runs_created_at ON batch_runs(created_at DESC);
CREATE INDEX idx_qa_messages_session_id ON qa_messages(session_id);
CREATE INDEX idx_qa_sessions_updated_at ON qa_sessions(updated_at DESC);
CREATE INDEX idx_dkb_kb_id ON document_knowledge_bases(knowledge_base_id);
CREATE INDEX idx_dkb_doc_id ON document_knowledge_bases(document_id);
CREATE INDEX idx_readme_suggestions_kb_id ON readme_suggestions(knowledge_base_id);
CREATE INDEX idx_paper_edges_from ON paper_edges(from_paper_id);
CREATE INDEX idx_paper_edges_to ON paper_edges(to_paper_id);
CREATE INDEX idx_paper_edges_seed ON paper_edges(source_seed_paper_id);
```

## API And Storage Compatibility

The first implementation should avoid broad frontend rewrites.

Storage layer changes:

- Add `DocumentAnalysisRow`.
- Split internal document methods into metadata-only and detail variants.
- `listDocuments()` can return the old shape during compatibility mode by left joining `document_analysis` or filling analysis fields as `null`.
- `getDocument(id)` should return the old shape expected by `/api/documents/:id`, including analysis fields.
- Add explicit methods for vector index state:
  - `upsertDocumentVectorIndex(...)`
  - `getVectorIndexesForDocument(documentId)`
  - `getVectorIndexesForKnowledgeBase(knowledgeBaseId, status?)`
  - `markVectorIndexStatus(...)`
  - `markDocumentIndexesStale(documentId, reason?)`

Route behavior:

- `/api/documents/:id` keeps returning the current frontend shape, including `analysisResult`.
- Knowledge base document list should continue to work with old UI fields.
- Add-to-KB and reindex flows should update `document_vector_indexes`, not `documents.index_status`.
- Discovery candidate routes should write paper metadata into `paper_nodes` first, then upsert `discovery_candidates`.
- Python `StorageManager` should resolve collections by name instead of binding the whole process to one `documents` collection.

## Migration Strategy

Use versioned migrations. Prefer `PRAGMA user_version` or a `schema_migrations` table; `schema_migrations` is more inspectable.

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Migration 1: Analysis Table Split

1. Create `document_analysis`.
2. Copy analysis columns from `documents`.
3. Rebuild `documents` without analysis columns and without canonical index columns.
4. Preserve document row counts.
5. Verify every migrated document with any analysis data has a `document_analysis` row.

### Migration 2: Vector Index Ledger

1. Create `document_vector_indexes`.
2. For documents with existing `index_status = 'indexed'`, create best-effort index records for each associated knowledge base.
3. Use existing app config to fill embedding provider/model/dimensions when available.
4. If provider/model/dimensions cannot be determined, leave them null and set status to `indexed` only when the old status was `indexed`; otherwise use `not_indexed` or `failed`.
5. Keep ChromaDB contents intact. This migration does not rewrite vector data.

### Migration 3: Paper Metadata Unification

1. Add `influential_citation_count` to `paper_nodes` if missing.
2. Insert missing paper nodes from existing `discovery_candidates`.
3. Rebuild `discovery_candidates` without duplicated metadata columns.
4. Add partial unique indexes for KB-scoped and global candidate deduplication.
5. Resolve duplicate candidates deterministically before adding the unique constraint:
   - Prefer the newest `updated_at`.
   - Keep the highest `discovery_priority_score` if timestamps tie.

### Migration Safety

- Backup `wonder.db` before applying table-rebuild migrations.
- Run migrations inside a transaction where SQLite permits it.
- Temporarily disable foreign key enforcement only around table rebuilds if required, then run `PRAGMA foreign_key_check`.
- Migrations must be repeatable: already-applied versions should no-op.
- Do not delete ChromaDB collections during SQLite migration.

## Rollback

Rollback is backup-based for table rebuilds:

- Keep a timestamped copy of the original SQLite database before migration.
- If migration fails, close the DB connection and restore the backup.
- ChromaDB is not mutated by the schema migration, so vector rollback is not required for this phase.

## Files To Modify During Implementation

- `server/db/schema.sql`
- `server/services/storage.ts`
- `server/routes/discovery.ts`
- `server/routes/knowledge-bases.ts`
- `server/routes/knowledge.ts`
- `server/index.ts`
- `backend/core/storage.py`
- `backend/rag/indexer.py`
- `backend/rag/retriever.py`
- `backend/api/knowledge.py`
- New migration module under `server/db/` or `server/services/`
- Tests under `tests/server/` and `backend/tests/`

## Testing Strategy

SQLite tests:

- New database creates the target schema.
- Old database migrates analysis fields into `document_analysis`.
- Old index columns migrate into `document_vector_indexes`.
- Discovery candidates migrate without losing paper metadata.
- Duplicate `(paper_id, knowledge_base_id)` candidates are resolved deterministically.
- Cascade delete removes `document_analysis`, `chunks`, and vector index records.
- Foreign key checks pass after migration.

Storage/API tests:

- `listDocuments()` and `getDocument()` remain backward compatible.
- `/api/documents/:id` still returns analysis data and `analysisResult`.
- Knowledge base document list still renders expected fields.
- Discovery candidate save/list/get still returns paper metadata via join.
- Add-to-KB and reindex update `document_vector_indexes`.

Vector tests:

- Indexer creates collection names from embedding config.
- Chroma metadata includes `index_id` and `chunk_id`.
- Retrieval filters by knowledge base and current indexed records.
- Reindex can mark old records `stale` and create a new index version.
- Delete removes only target KB vectors and marks or removes the matching ledger record.

Verification commands:

```bash
npm run typecheck
npm run test:server
npm run test:python
```

Use `npm run verify` once Node and Python tests are stable.

## Open Implementation Notes

- Keep `chunks.embedding` in this migration, but treat it as deprecated.
- Use compatibility joins first; frontend cleanup can happen later.
- ChromaDB collection migration is forward-only in this design: existing vectors stay where they are until reindex.
- The implementation should prefer small storage methods over direct SQL in routes so future RAG changes remain localized.
