-- Fresh schema for Wonder (applied via CREATE IF NOT EXISTS)
-- Migrations in server/db/migrations.ts handle transitions from old schemas.

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_type TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  match_score REAL,
  lifecycle_status TEXT DEFAULT 'analyzed'
);

CREATE TABLE IF NOT EXISTS document_analysis (
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

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding BLOB,
  chunk_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_history (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  result TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  readme TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_knowledge_bases (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  sub_direction TEXT,
  tags TEXT,
  fit_score REAL,
  recommended_action TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id, knowledge_base_id)
);

CREATE TABLE IF NOT EXISTS readme_suggestions (
  id TEXT PRIMARY KEY,
  knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  section TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discovery_candidates (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  source_query TEXT,
  discovery_priority_score REAL DEFAULT 0,
  discovery_reason TEXT,
  state TEXT NOT NULL DEFAULT 'saved',
  knowledge_base_id TEXT REFERENCES knowledge_bases(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batch_runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  knowledge_base_id TEXT REFERENCES knowledge_bases(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS batch_items (
  id TEXT PRIMARY KEY,
  batch_run_id TEXT NOT NULL REFERENCES batch_runs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  history_id TEXT REFERENCES analysis_history(id) ON DELETE SET NULL,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS qa_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'knowledge_base',
  scope_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qa_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sources TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paper_nodes (
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

CREATE TABLE IF NOT EXISTS paper_edges (
  id TEXT PRIMARY KEY,
  from_paper_id TEXT NOT NULL,
  to_paper_id TEXT NOT NULL,
  type TEXT NOT NULL,
  source_seed_paper_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_vector_indexes (
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

CREATE TABLE IF NOT EXISTS research_cards (
  id TEXT PRIMARY KEY,
  knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  core_claims TEXT NOT NULL DEFAULT '[]',
  knowledge_type TEXT NOT NULL DEFAULT 'other',
  tags TEXT NOT NULL DEFAULT '[]',
  sub_direction TEXT,
  validation_notes TEXT NOT NULL DEFAULT '',
  use_cases TEXT NOT NULL DEFAULT '[]',
  linked_doc_ids TEXT NOT NULL DEFAULT '[]',
  answer_mode TEXT,
  source_message_id TEXT REFERENCES qa_messages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'saved',
  no_paper_evidence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS research_card_evidence_refs (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES research_cards(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  file_name TEXT,
  chunk_id TEXT,
  chunk_index INTEGER,
  chunk_type TEXT NOT NULL DEFAULT 'content',
  snippet TEXT NOT NULL,
  score REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS research_card_vector_indexes (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES research_cards(id) ON DELETE CASCADE,
  knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  backend TEXT NOT NULL DEFAULT 'chroma',
  collection_name TEXT NOT NULL,
  embedding_provider TEXT,
  embedding_model TEXT,
  embedding_dimensions INTEGER,
  status TEXT NOT NULL DEFAULT 'not_indexed',
  error TEXT,
  indexed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_metadata (
  document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT,
  authors TEXT NOT NULL DEFAULT '[]',
  year INTEGER,
  venue TEXT,
  doi TEXT,
  url TEXT,
  abstract TEXT,
  keywords TEXT NOT NULL DEFAULT '[]',
  metadata_status TEXT NOT NULL DEFAULT 'missing',
  metadata_source TEXT NOT NULL DEFAULT 'none',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_kb_state ON discovery_candidates(knowledge_base_id, state);
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_paper_id ON discovery_candidates(paper_id);

CREATE INDEX IF NOT EXISTS idx_batch_items_run_id ON batch_items(batch_run_id);
CREATE INDEX IF NOT EXISTS idx_batch_runs_created_at ON batch_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qa_messages_session_id ON qa_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_qa_sessions_updated_at ON qa_sessions(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_doc_chunk_index ON chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_analysis_history_created_at ON analysis_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_analysis_updated_at ON document_analysis(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dkb_kb_id ON document_knowledge_bases(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_dkb_doc_id ON document_knowledge_bases(document_id);
CREATE INDEX IF NOT EXISTS idx_readme_suggestions_kb_id ON readme_suggestions(knowledge_base_id);

CREATE INDEX IF NOT EXISTS idx_paper_edges_from ON paper_edges(from_paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_edges_to ON paper_edges(to_paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_edges_seed ON paper_edges(source_seed_paper_id);

CREATE INDEX IF NOT EXISTS idx_dvi_document_id ON document_vector_indexes(document_id);
CREATE INDEX IF NOT EXISTS idx_dvi_kb_id ON document_vector_indexes(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_dvi_status ON document_vector_indexes(status);
CREATE INDEX IF NOT EXISTS idx_document_vector_indexes_kb_status ON document_vector_indexes(knowledge_base_id, status);
CREATE INDEX IF NOT EXISTS idx_document_vector_indexes_collection ON document_vector_indexes(backend, collection_name);

-- Partial unique indexes for discovery: one global candidate per paper, one KB-scoped per (paper, KB)
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_global_unique
  ON discovery_candidates(paper_id)
  WHERE knowledge_base_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_kb_unique
  ON discovery_candidates(paper_id, knowledge_base_id)
  WHERE knowledge_base_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_research_cards_kb_status ON research_cards(knowledge_base_id, status);
CREATE INDEX IF NOT EXISTS idx_research_cards_type ON research_cards(knowledge_type);
CREATE INDEX IF NOT EXISTS idx_research_card_refs_card ON research_card_evidence_refs(card_id);
CREATE INDEX IF NOT EXISTS idx_research_card_refs_doc ON research_card_evidence_refs(document_id);
CREATE INDEX IF NOT EXISTS idx_research_card_vector_indexes_card ON research_card_vector_indexes(card_id);
CREATE INDEX IF NOT EXISTS idx_research_card_vector_indexes_status ON research_card_vector_indexes(status);
