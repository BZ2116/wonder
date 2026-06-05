import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

// ── Public API ──────────────────────────────────────────────────────────

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  applyMigration(db, 1, 'split_document_analysis', migrateSplitDocumentAnalysis)
  applyMigration(db, 2, 'create_document_vector_indexes', migrateCreateDocumentVectorIndexes)
  applyMigration(db, 3, 'unify_paper_metadata', migrateUnifyPaperMetadata)
  applyMigration(db, 4, 'create_research_cards', migrateCreateResearchCards)
  applyMigration(db, 5, 'create_document_metadata', migrateCreateDocumentMetadata)
}

// ── Helpers ─────────────────────────────────────────────────────────────

function applyMigration(
  db: Database.Database,
  version: number,
  name: string,
  fn: (db: Database.Database) => void,
): void {
  const existing = db.prepare(
    'SELECT version FROM schema_migrations WHERE version = ?',
  ).get(version)

  if (existing) return

  const wrapped = db.transaction(() => {
    fn(db)
    db.prepare(
      'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
    ).run(version, name)
  })
  wrapped()
}

function getTableColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return new Set(rows.map(r => r.name))
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
  ).get(name) as { name: string } | undefined
  return !!row
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some(c => c.name === column)
}

function assertForeignKeyCheck(db: Database.Database, migration: string): void {
  const violations = db.prepare('PRAGMA foreign_key_check').all() as { table: string; rowid: number; parent: string; fkid: number }[]
  if (violations.length > 0) {
    const details = violations.map(v => `${v.table}(rowid=${v.rowid}) -> ${v.parent}`).join(', ')
    throw new Error(`Migration ${migration}: foreign_key_check failed: ${details}`)
  }
}

// ── Migration 1: Split document_analysis ────────────────────────────────

function migrateSplitDocumentAnalysis(db: Database.Database): void {
  // Ensure analysis_history exists (needed for FK reference from document_analysis)
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_history (
      id TEXT PRIMARY KEY,
      document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      result TEXT NOT NULL
    )
  `)

  const docCols = getTableColumns(db, 'documents')
  const hasSummary = docCols.has('summary')

  // Ensure lifecycle columns exist (for very old DBs)
  if (!docCols.has('lifecycle_status')) {
    db.exec("ALTER TABLE documents ADD COLUMN lifecycle_status TEXT DEFAULT 'analyzed'")
  }
  if (!docCols.has('index_status')) {
    db.exec("ALTER TABLE documents ADD COLUMN index_status TEXT DEFAULT 'not_indexed'")
  }
  if (!docCols.has('index_error')) {
    db.exec('ALTER TABLE documents ADD COLUMN index_error TEXT')
  }
  if (!docCols.has('indexed_at')) {
    db.exec('ALTER TABLE documents ADD COLUMN indexed_at TEXT')
  }
  if (!docCols.has('updated_at')) {
    db.exec("ALTER TABLE documents ADD COLUMN updated_at TEXT")
    db.exec("UPDATE documents SET updated_at = '2024-01-01 00:00:00' WHERE updated_at IS NULL")
  }

  // Create document_analysis table
  db.exec(`
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
    )
  `)

  if (!hasSummary) {
    // Already slim schema — nothing to migrate
    return
  }

  // Old schema detected — copy analysis data and drop analysis columns
  // Note: index columns (index_status, index_error, indexed_at) are dropped
  // in migration 2 after the vector ledger rows have been created.

  // 1. Copy analysis data from documents to document_analysis
  db.exec(`
    INSERT INTO document_analysis (document_id, summary, reading_card, relation_analysis, writing_materials, todo_list, tags)
    SELECT id, summary, reading_card, relation_analysis, writing_materials, todo_list, tags
    FROM documents
  `)

  // 2. Drop analysis columns from documents (index columns kept for migration 2)
  const analysisColumnsToDrop = [
    'summary', 'reading_card', 'relation_analysis', 'writing_materials',
    'todo_list', 'tags',
  ]
  for (const col of analysisColumnsToDrop) {
    if (docCols.has(col)) {
      db.exec(`ALTER TABLE documents DROP COLUMN ${col}`)
    }
  }

  assertForeignKeyCheck(db, '1')
}

// ── Migration 2: Create document_vector_indexes ─────────────────────────

function migrateCreateDocumentVectorIndexes(db: Database.Database): void {
  db.exec(`
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
    )
  `)

  // Create best-effort ledger rows from old index_status
  const docCols = getTableColumns(db, 'documents')
  if (docCols.has('index_status') && tableExists(db, 'document_knowledge_bases')) {
    const rows = db.prepare(`
      SELECT d.id AS document_id, d.index_status, d.index_error, d.indexed_at,
             dkb.knowledge_base_id
      FROM documents d
      INNER JOIN document_knowledge_bases dkb ON d.id = dkb.document_id
    `).all() as {
      document_id: string
      index_status: string | null
      index_error: string | null
      indexed_at: string | null
      knowledge_base_id: string
    }[]

    const insert = db.prepare(`
      INSERT OR IGNORE INTO document_vector_indexes
        (id, document_id, knowledge_base_id, backend, status, error, indexed_at)
      VALUES (?, ?, ?, 'chroma', ?, ?, ?)
    `)

    for (const row of rows) {
      let status = 'not_indexed'
      if (row.index_status === 'indexed') status = 'indexed'
      else if (row.index_status === 'index_failed') status = 'failed'
      else if (row.index_status === 'indexing') status = 'indexing'

      insert.run(
        randomUUID(),
        row.document_id,
        row.knowledge_base_id,
        status,
        row.index_error ?? null,
        row.indexed_at ?? null,
      )
    }
  }

  // Drop index columns from documents (now tracked in document_vector_indexes)
  const indexColsToDrop = ['index_status', 'index_error', 'indexed_at']
  const currentDocCols = getTableColumns(db, 'documents')
  for (const col of indexColsToDrop) {
    if (currentDocCols.has(col)) {
      db.exec(`ALTER TABLE documents DROP COLUMN ${col}`)
    }
  }
}

// ── Migration 3: Unify paper metadata ───────────────────────────────────

function migrateUnifyPaperMetadata(db: Database.Database): void {
  if (!tableExists(db, 'paper_nodes')) return

  // Add influential_citation_count to paper_nodes if missing
  if (!columnExists(db, 'paper_nodes', 'influential_citation_count')) {
    db.exec('ALTER TABLE paper_nodes ADD COLUMN influential_citation_count INTEGER DEFAULT 0')
  }

  if (!tableExists(db, 'discovery_candidates')) return

  const dcCols = getTableColumns(db, 'discovery_candidates')
  if (!dcCols.has('title')) return // Already slim

  // Insert missing paper nodes from discovery_candidates
  // For duplicates, take the row with the most data (longest title + non-null abstract)
  db.exec(`
    INSERT OR IGNORE INTO paper_nodes (paper_id, title, abstract, year, citation_count, influential_citation_count, venue, authors, url, updated_at)
    SELECT paper_id, title, abstract, year,
           COALESCE(citation_count, 0),
           COALESCE(influential_citation_count, 0),
           venue, authors, url, CURRENT_TIMESTAMP
    FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY paper_id
        ORDER BY
          CASE WHEN abstract IS NOT NULL AND abstract != '' THEN 0 ELSE 1 END,
          LENGTH(COALESCE(title, '')) DESC,
          updated_at DESC
      ) AS rn
      FROM discovery_candidates
    )
    WHERE rn = 1
  `)

  // Update existing paper_nodes with richer data from discovery_candidates
  db.exec(`
    UPDATE paper_nodes SET
      abstract = COALESCE(paper_nodes.abstract, dc.abstract),
      year = COALESCE(paper_nodes.year, dc.year),
      citation_count = CASE WHEN paper_nodes.citation_count = 0 THEN COALESCE(dc.citation_count, 0) ELSE paper_nodes.citation_count END,
      influential_citation_count = CASE WHEN paper_nodes.influential_citation_count = 0 THEN COALESCE(dc.influential_citation_count, 0) ELSE paper_nodes.influential_citation_count END,
      venue = COALESCE(paper_nodes.venue, dc.venue),
      authors = COALESCE(paper_nodes.authors, dc.authors),
      url = COALESCE(paper_nodes.url, dc.url),
      updated_at = CURRENT_TIMESTAMP
    FROM (
      SELECT paper_id, abstract, year, citation_count, influential_citation_count, venue, authors, url,
             ROW_NUMBER() OVER (PARTITION BY paper_id ORDER BY updated_at DESC) AS rn
      FROM discovery_candidates
    ) dc
    WHERE dc.rn = 1 AND paper_nodes.paper_id = dc.paper_id
  `)

  // Resolve duplicate global and KB-scoped candidates before adding partial unique indexes
  // Keep the best candidate per (paper_id, knowledge_base_id) pair:
  // most recently updated, then highest priority score
  db.exec(`
    DELETE FROM discovery_candidates
    WHERE rowid NOT IN (
      SELECT rowid FROM (
        SELECT rowid, ROW_NUMBER() OVER (
          PARTITION BY paper_id, COALESCE(knowledge_base_id, '__GLOBAL__')
          ORDER BY updated_at DESC, discovery_priority_score DESC
        ) AS rn
        FROM discovery_candidates
      )
      WHERE rn = 1
    )
  `)

  // Drop paper metadata columns from discovery_candidates (now in paper_nodes)
  const dcColumnsToDrop = [
    'title', 'abstract', 'year', 'citation_count',
    'influential_citation_count', 'venue', 'authors', 'url',
  ]
  for (const col of dcColumnsToDrop) {
    if (dcCols.has(col)) {
      db.exec(`ALTER TABLE discovery_candidates DROP COLUMN ${col}`)
    }
  }

  // Recreate indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_discovery_candidates_kb_state ON discovery_candidates(knowledge_base_id, state)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_discovery_candidates_paper_id ON discovery_candidates(paper_id)')

  // Add partial unique indexes
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_global_unique
      ON discovery_candidates(paper_id)
      WHERE knowledge_base_id IS NULL
  `)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_kb_unique
      ON discovery_candidates(paper_id, knowledge_base_id)
      WHERE knowledge_base_id IS NOT NULL
  `)

  assertForeignKeyCheck(db, '3')
}

// ── Migration 4: Create research cards ──────────────────────────────────

function migrateCreateResearchCards(db: Database.Database): void {
  db.exec(`
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
    )
  `)

  db.exec(`
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
    )
  `)

  db.exec(`
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
    )
  `)

  db.exec('CREATE INDEX IF NOT EXISTS idx_research_cards_kb_status ON research_cards(knowledge_base_id, status)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_research_cards_type ON research_cards(knowledge_type)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_research_card_refs_card ON research_card_evidence_refs(card_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_research_card_refs_doc ON research_card_evidence_refs(document_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_research_card_vector_indexes_card ON research_card_vector_indexes(card_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_research_card_vector_indexes_status ON research_card_vector_indexes(status)')

  assertForeignKeyCheck(db, '4')
}

// ── Migration 5: Create document_metadata ──────────────────────────────

function migrateCreateDocumentMetadata(db: Database.Database): void {
  db.exec(`
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
    )
  `)

  db.exec('CREATE INDEX IF NOT EXISTS idx_document_metadata_title ON document_metadata(title)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_document_metadata_year ON document_metadata(year)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_document_metadata_status ON document_metadata(metadata_status)')

  assertForeignKeyCheck(db, '5')
}
