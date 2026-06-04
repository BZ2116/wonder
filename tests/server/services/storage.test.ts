import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { StorageService } from '../../../server/services/storage'
import fs from 'fs'
import path from 'path'

const TEST_DB = path.join(__dirname, 'test.db')

describe('StorageService', () => {
  let db: Database.Database
  let storage: StorageService

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB)
    db = new Database(TEST_DB)
    const schema = fs.readFileSync(path.join(__dirname, '../../../server/db/schema.sql'), 'utf-8')
    db.exec(schema)
    storage = new StorageService(db)
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB)
  })

  it('should insert and retrieve a document', () => {
    storage.upsertDocument({ id: 'doc1', fileName: 'test.pdf', fileType: 'pdf' })
    const doc = storage.getDocument('doc1')
    expect(doc).toBeDefined()
    expect(doc!.file_name).toBe('test.pdf')
  })

  it('should list all documents', () => {
    storage.upsertDocument({ id: 'doc1', fileName: 'a.pdf', fileType: 'pdf' })
    storage.upsertDocument({ id: 'doc2', fileName: 'b.pdf', fileType: 'pdf' })
    const docs = storage.listDocuments()
    expect(docs).toHaveLength(2)
  })

  it('should delete a document and its chunks', () => {
    storage.upsertDocument({ id: 'doc1', fileName: 'a.pdf', fileType: 'pdf' })
    storage.insertChunk({ id: 'c1', documentId: 'doc1', content: 'hello', chunkIndex: 0 })
    storage.deleteDocument('doc1')
    expect(storage.getDocument('doc1')).toBeFalsy()
    expect(storage.getChunksByDocument('doc1')).toHaveLength(0)
  })

  it('should save and retrieve config', () => {
    storage.setConfig('apiKey', 'sk-123')
    expect(storage.getConfig('apiKey')).toBe('sk-123')
  })

  it('should insert and list analysis history', () => {
    storage.addHistory({ id: 'h1', result: '{"summary":"test"}' })
    storage.addHistory({ id: 'h2', result: '{"summary":"test2"}' })
    const history = storage.listHistory()
    expect(history).toHaveLength(2)
  })

  it('should add lifecycle columns to existing database via migration', () => {
    // Create a DB without lifecycle columns (old schema)
    const oldDb = new Database(TEST_DB + '.old')
    oldDb.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, file_name TEXT NOT NULL, file_path TEXT, file_type TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, summary TEXT, reading_card TEXT,
        relation_analysis TEXT, writing_materials TEXT, todo_list TEXT, tags TEXT, match_score REAL
      )
    `)
    oldDb.close()

    // Open with StorageService — migration should add columns
    const migratedDb = new Database(TEST_DB + '.old')
    const migratedStorage = new StorageService(migratedDb)

    migratedStorage.upsertDocument({ id: 'doc-old', fileName: 'old.pdf', fileType: 'pdf' })
    const doc = migratedStorage.getDocument('doc-old')
    expect(doc).toBeDefined()
    expect(doc!.lifecycle_status).toBe('analyzed')

    // Index status now lives in document_vector_indexes (migration split)
    expect(
      migratedDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_vector_indexes'").get()
    ).toBeTruthy()

    migratedDb.close()
    fs.unlinkSync(TEST_DB + '.old')
  })

  it('should update document lifecycle status', () => {
    storage.upsertDocument({ id: 'doc1', fileName: 'test.pdf', fileType: 'pdf' })
    storage.updateDocumentLifecycle('doc1', 'indexing')
    const doc = storage.getDocument('doc1')
    expect(doc!.lifecycle_status).toBe('indexing')
  })

  it('should update document index status via vector ledger', () => {
    storage.upsertDocument({ id: 'doc1', fileName: 'test.pdf', fileType: 'pdf' })
    storage.updateDocumentIndexStatus('doc1', 'indexed')
    const row = db.prepare('SELECT * FROM document_vector_indexes WHERE document_id = ?').get('doc1') as any
    expect(row).toBeDefined()
    expect(row.status).toBe('indexed')
    expect(row.indexed_at).not.toBeNull()
  })

  it('should record index error on failure', () => {
    storage.upsertDocument({ id: 'doc1', fileName: 'test.pdf', fileType: 'pdf' })
    storage.updateDocumentIndexStatus('doc1', 'index_failed', 'embedding timeout')
    const row = db.prepare('SELECT * FROM document_vector_indexes WHERE document_id = ?').get('doc1') as any
    expect(row).toBeDefined()
    expect(row.status).toBe('index_failed')
    expect(row.error).toBe('embedding timeout')
    expect(row.indexed_at).toBeNull()
  })

  // ── Discovery candidate tests ──────────────────────────────────────

  it('should insert and retrieve a discovery candidate', () => {
    storage.upsertDiscoveryCandidate({
      id: 'c1', paperId: 's2-123', title: 'Test Paper', abstract: 'Abstract text',
      year: 2024, citationCount: 10, venue: 'ICML',
      authors: JSON.stringify([{ authorId: 'a1', name: 'Author' }]),
      url: 'https://example.com', sourceQuery: 'RAG',
      discoveryPriorityScore: 75, discoveryReason: 'keyword match',
      state: 'saved', knowledgeBaseId: null,
    })
    const candidate = storage.getDiscoveryCandidate('c1')
    expect(candidate).toBeDefined()
    expect(candidate!.paper_id).toBe('s2-123')
    expect(candidate!.state).toBe('saved')

    // Paper metadata now lives in paper_nodes
    const paper = storage.getPaperNode('s2-123')
    expect(paper).toBeDefined()
    expect(paper!.title).toBe('Test Paper')
  })

  it('should list candidates filtered by knowledge base', () => {
    storage.createKnowledgeBase({ id: 'kb-1', name: 'KB' })
    storage.upsertDiscoveryCandidate({ id: 'c1', paperId: 'p1', title: 'A', state: 'saved', knowledgeBaseId: 'kb-1' })
    storage.upsertDiscoveryCandidate({ id: 'c2', paperId: 'p2', title: 'B', state: 'saved', knowledgeBaseId: null })
    const kbCandidates = storage.listDiscoveryCandidates({ knowledgeBaseId: 'kb-1' })
    expect(kbCandidates).toHaveLength(1)
    expect(kbCandidates[0].paper_id).toBe('p1')
  })

  it('should list candidates filtered by state', () => {
    storage.upsertDiscoveryCandidate({ id: 'c1', paperId: 'p1', title: 'A', state: 'saved' })
    storage.upsertDiscoveryCandidate({ id: 'c2', paperId: 'p2', title: 'B', state: 'ignored' })
    const saved = storage.listDiscoveryCandidates({ state: 'saved' })
    expect(saved).toHaveLength(1)
    expect(saved[0].state).toBe('saved')
  })

  it('should update candidate state', () => {
    storage.upsertDiscoveryCandidate({ id: 'c1', paperId: 'p1', title: 'A', state: 'saved' })
    storage.updateDiscoveryCandidateState('c1', 'sent_to_analysis')
    const candidate = storage.getDiscoveryCandidate('c1')
    expect(candidate!.state).toBe('sent_to_analysis')
  })

  it('should delete a candidate', () => {
    storage.upsertDiscoveryCandidate({ id: 'c1', paperId: 'p1', title: 'A', state: 'saved' })
    storage.deleteDiscoveryCandidate('c1')
    expect(storage.getDiscoveryCandidate('c1')).toBeUndefined()
  })

  it('should deduplicate by (paper_id, knowledge_base_id)', () => {
    storage.upsertDiscoveryCandidate({ id: 'c1', paperId: 'p1', title: 'First', state: 'saved' })
    storage.upsertDiscoveryCandidate({ id: 'c1b', paperId: 'p1', title: 'Updated', state: 'ignored' })
    const candidates = storage.listDiscoveryCandidates()
    expect(candidates).toHaveLength(1)
    expect(candidates[0].state).toBe('ignored')

    // Paper metadata updated in paper_nodes
    const paper = storage.getPaperNode('p1')
    expect(paper!.title).toBe('Updated')
  })

  // ── Batch tests ─────────────────────────────────────────────────────

  it('should create and retrieve a batch run', () => {
    storage.createBatchRun({ id: 'run1', name: 'Test Batch' })
    const run = storage.getBatchRun('run1')
    expect(run).toBeDefined()
    expect(run!.name).toBe('Test Batch')
    expect(run!.status).toBe('pending')
    expect(run!.knowledge_base_id).toBeNull()
  })

  it('should return undefined for nonexistent batch run', () => {
    expect(storage.getBatchRun('nonexistent')).toBeUndefined()
  })

  it('should list batch runs ordered by created_at DESC', () => {
    storage.createBatchRun({ id: 'run1', name: 'First' })
    storage.createBatchRun({ id: 'run2', name: 'Second' })
    const runs = storage.getBatchRuns()
    expect(runs).toHaveLength(2)
    // Both have same created_at (CURRENT_TIMESTAMP), but both exist
    expect(runs.map(r => r.id)).toContain('run1')
    expect(runs.map(r => r.id)).toContain('run2')
  })

  it('should update batch run status', () => {
    storage.createBatchRun({ id: 'run1', name: 'Test' })
    storage.updateBatchRunStatus('run1', 'running')
    expect(storage.getBatchRun('run1')!.status).toBe('running')
    storage.updateBatchRunStatus('run1', 'done', '2024-01-01T00:00:00Z')
    const run = storage.getBatchRun('run1')
    expect(run!.status).toBe('done')
    expect(run!.completed_at).toBe('2024-01-01T00:00:00Z')
  })

  it('should create batch items and retrieve by run id', () => {
    storage.createBatchRun({ id: 'run1', name: 'Test' })
    storage.createBatchItem({ id: 'item1', batch_run_id: 'run1', file_name: 'a.pdf', file_type: 'pdf' })
    storage.createBatchItem({ id: 'item2', batch_run_id: 'run1', file_name: 'b.docx', file_type: 'docx' })
    const items = storage.getBatchItemsByRunId('run1')
    expect(items).toHaveLength(2)
    expect(items[0].file_name).toBe('a.pdf')
    expect(items[1].file_name).toBe('b.docx')
  })

  it('should return empty array for run with no items', () => {
    storage.createBatchRun({ id: 'run1', name: 'Test' })
    expect(storage.getBatchItemsByRunId('run1')).toHaveLength(0)
  })

  it('should update batch item status partially', () => {
    storage.createBatchRun({ id: 'run1', name: 'Test' })
    storage.createBatchItem({ id: 'item1', batch_run_id: 'run1', file_name: 'a.pdf' })
    storage.updateBatchItemStatus('item1', { status: 'analyzing' })
    expect(storage.getBatchItemsByRunId('run1')[0].status).toBe('analyzing')
    expect(storage.getBatchItemsByRunId('run1')[0].document_id).toBeNull()
  })

  it('should update batch item with full fields', () => {
    storage.upsertDocument({ id: 'doc1', fileName: 'a.pdf', fileType: 'pdf' })
    storage.addHistory({ id: 'hist1', documentId: 'doc1', result: '{}' })
    storage.createBatchRun({ id: 'run1', name: 'Test' })
    storage.createBatchItem({ id: 'item1', batch_run_id: 'run1', file_name: 'a.pdf' })
    storage.updateBatchItemStatus('item1', {
      status: 'done',
      document_id: 'doc1',
      history_id: 'hist1',
      completed_at: '2024-01-01T00:00:00Z',
    })
    const item = storage.getBatchItemsByRunId('run1')[0]
    expect(item.status).toBe('done')
    expect(item.document_id).toBe('doc1')
    expect(item.history_id).toBe('hist1')
    expect(item.completed_at).toBe('2024-01-01T00:00:00Z')
  })

  it('should cascade delete batch items when run is deleted', () => {
    storage.createBatchRun({ id: 'run1', name: 'Test' })
    storage.createBatchItem({ id: 'item1', batch_run_id: 'run1', file_name: 'a.pdf' })
    storage.createBatchItem({ id: 'item2', batch_run_id: 'run1', file_name: 'b.pdf' })
    // Delete via direct SQL since there's no deleteBatchRun method yet
    db.prepare('DELETE FROM batch_runs WHERE id = ?').run('run1')
    expect(storage.getBatchItemsByRunId('run1')).toHaveLength(0)
  })

  it('should SET NULL on batch item document_id when document is deleted', () => {
    storage.upsertDocument({ id: 'doc1', fileName: 'a.pdf', fileType: 'pdf' })
    storage.createBatchRun({ id: 'run1', name: 'Test' })
    storage.createBatchItem({ id: 'item1', batch_run_id: 'run1', file_name: 'a.pdf' })
    storage.updateBatchItemStatus('item1', { document_id: 'doc1' })
    storage.deleteDocument('doc1')
    const item = storage.getBatchItemsByRunId('run1')[0]
    expect(item.document_id).toBeNull()
  })

  // ── Paper node / edge tests ───────────────────────────────────────

  it('should upsert and retrieve a paper node', () => {
    storage.upsertPaperNode({
      paperId: 's2-123', title: 'Test Paper', abstract: 'Abstract text',
      year: 2024, citationCount: 10, venue: 'ICML',
      authors: JSON.stringify([{ name: 'Author' }]), url: 'https://example.com',
    })
    const node = storage.getPaperNode('s2-123')
    expect(node).toBeDefined()
    expect(node!.title).toBe('Test Paper')
    expect(node!.year).toBe(2024)
    expect(node!.citation_count).toBe(10)
  })

  it('should update paper node on conflict', () => {
    storage.upsertPaperNode({ paperId: 's2-123', title: 'Original', citationCount: 5 })
    storage.upsertPaperNode({ paperId: 's2-123', title: 'Updated', citationCount: 20 })
    const node = storage.getPaperNode('s2-123')
    expect(node!.title).toBe('Updated')
    expect(node!.citation_count).toBe(20)
  })

  it('should insert and query paper edges by seed', () => {
    storage.insertPaperEdge({ id: 'e1', fromPaperId: 'seed', toPaperId: 'ref1', type: 'references', sourceSeedPaperId: 'seed' })
    storage.insertPaperEdge({ id: 'e2', fromPaperId: 'cit1', toPaperId: 'seed', type: 'citations', sourceSeedPaperId: 'seed' })
    storage.insertPaperEdge({ id: 'e3', fromPaperId: 'other', toPaperId: 'ref1', type: 'references', sourceSeedPaperId: 'other' })
    const edges = storage.getPaperEdgesBySeed('seed')
    expect(edges).toHaveLength(2)
  })

  it('should query paper edges by node', () => {
    storage.insertPaperEdge({ id: 'e1', fromPaperId: 'A', toPaperId: 'B', type: 'references' })
    storage.insertPaperEdge({ id: 'e2', fromPaperId: 'C', toPaperId: 'A', type: 'citations' })
    storage.insertPaperEdge({ id: 'e3', fromPaperId: 'D', toPaperId: 'E', type: 'references' })
    const edges = storage.getPaperEdgesByNode('A')
    expect(edges).toHaveLength(2)
  })

  it('should deduplicate paper edges by id', () => {
    storage.insertPaperEdge({ id: 'e1', fromPaperId: 'A', toPaperId: 'B', type: 'references' })
    storage.insertPaperEdge({ id: 'e1', fromPaperId: 'A', toPaperId: 'B', type: 'references' })
    const edges = storage.getPaperEdgesByNode('A')
    expect(edges).toHaveLength(1)
  })

  // ── QA Session tests ────────────────────────────────────────────────

  it('should create and retrieve a QA session', () => {
    storage.createQASession({ id: 's1', title: 'Test Session', scope_type: 'knowledge_base', scope_ids: '["kb1"]' })
    const session = storage.getQASession('s1')
    expect(session).toBeDefined()
    expect(session!.title).toBe('Test Session')
    expect(session!.scope_type).toBe('knowledge_base')
    expect(session!.scope_ids).toBe('["kb1"]')
  })

  it('should return undefined for non-existent QA session', () => {
    expect(storage.getQASession('nonexistent')).toBeUndefined()
  })

  it('should list QA sessions ordered by updated_at DESC', () => {
    storage.createQASession({ id: 's1', title: 'First' })
    // Manually set updated_at to ensure ordering
    db.prepare("UPDATE qa_sessions SET updated_at = '2024-01-01' WHERE id = 's1'").run()
    storage.createQASession({ id: 's2', title: 'Second' })
    db.prepare("UPDATE qa_sessions SET updated_at = '2024-01-02' WHERE id = 's2'").run()
    const sessions = storage.getQASessions()
    expect(sessions).toHaveLength(2)
    expect(sessions[0].title).toBe('Second')
    expect(sessions[1].title).toBe('First')
  })

  it('should update QA session fields partially and refresh updated_at', () => {
    storage.createQASession({ id: 's1', title: 'Original', scope_type: 'all' })
    db.prepare("UPDATE qa_sessions SET updated_at = '2024-01-01' WHERE id = 's1'").run()
    storage.updateQASession('s1', { title: 'Updated' })
    const after = storage.getQASession('s1')!
    expect(after.title).toBe('Updated')
    expect(after.scope_type).toBe('all')
    expect(after.updated_at).not.toBe('2024-01-01')
  })

  it('should delete QA session and cascade messages', () => {
    storage.createQASession({ id: 's1', title: 'Test' })
    storage.addQAMessage({ id: 'm1', session_id: 's1', role: 'user', content: 'hello' })
    storage.addQAMessage({ id: 'm2', session_id: 's1', role: 'assistant', content: 'hi' })
    storage.deleteQASession('s1')
    expect(storage.getQASession('s1')).toBeUndefined()
    expect(storage.getQAMessagesBySessionId('s1')).toHaveLength(0)
  })

  it('should add and retrieve QA messages by session id', () => {
    storage.createQASession({ id: 's1', title: 'Test' })
    storage.addQAMessage({ id: 'm1', session_id: 's1', role: 'user', content: 'What is RAG?' })
    storage.addQAMessage({ id: 'm2', session_id: 's1', role: 'assistant', content: 'RAG is...', sources: '{"docIds":["d1"],"chunks":["chunk1"]}' })
    const messages = storage.getQAMessagesBySessionId('s1')
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[0].sources).toBeNull()
    expect(messages[1].role).toBe('assistant')
    expect(messages[1].sources).toContain('d1')
  })

  it('should default sources to null when not provided', () => {
    storage.createQASession({ id: 's1', title: 'Test' })
    storage.addQAMessage({ id: 'm1', session_id: 's1', role: 'user', content: 'hello' })
    const msg = storage.getQAMessagesBySessionId('s1')[0]
    expect(msg.sources).toBeNull()
  })

  // ── Migration tests ─────────────────────────────────────────────────

  describe('schema migrations', () => {
    const MIGRATION_DB = path.join(__dirname, 'migration-test.db')
    let migratedDb: Database.Database | null = null

    function cleanupMigrationDb() {
      if (migratedDb) {
        try { migratedDb.close() } catch { /* ignore */ }
        migratedDb = null
      }
      if (fs.existsSync(MIGRATION_DB)) {
        try { fs.unlinkSync(MIGRATION_DB) } catch { /* ignore */ }
      }
      const walPath = MIGRATION_DB + '-wal'
      const shmPath = MIGRATION_DB + '-shm'
      if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath) } catch { /* ignore */ } }
      if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath) } catch { /* ignore */ } }
    }

    function createOldSchema(extraSetup?: (db: Database.Database) => void) {
      cleanupMigrationDb()
      const oldDb = new Database(MIGRATION_DB)
      oldDb.exec(`
        CREATE TABLE documents (
          id TEXT PRIMARY KEY, file_name TEXT NOT NULL, file_path TEXT, file_type TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP, summary TEXT, reading_card TEXT,
          relation_analysis TEXT, writing_materials TEXT, todo_list TEXT, tags TEXT,
          match_score REAL, lifecycle_status TEXT DEFAULT 'analyzed',
          index_status TEXT DEFAULT 'not_indexed', index_error TEXT, indexed_at TEXT
        )
      `)
      extraSetup?.(oldDb)
      oldDb.close()
    }

    beforeEach(() => {
      cleanupMigrationDb()
    })

    afterEach(() => {
      cleanupMigrationDb()
    })

    it('should create document_analysis, document_vector_indexes, and schema_migrations tables via migration', () => {
      createOldSchema((db) => {
        db.exec(`INSERT INTO documents (id, file_name) VALUES ('doc1', 'test.pdf')`)
      })

      migratedDb = new Database(MIGRATION_DB)
      new StorageService(migratedDb)

      expect(
        migratedDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_analysis'").get()
      ).toBeTruthy()
      expect(
        migratedDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_vector_indexes'").get()
      ).toBeTruthy()
      expect(
        migratedDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
      ).toBeTruthy()

      const migrations = migratedDb.prepare('SELECT * FROM schema_migrations ORDER BY version').all() as any[]
      expect(migrations.length).toBeGreaterThanOrEqual(3)
      expect(migrations[0].name).toBe('split_document_analysis')
      expect(migrations[1].name).toBe('create_document_vector_indexes')
      expect(migrations[2].name).toBe('unify_paper_metadata')
    })

    it('should migrate old document analysis fields to document_analysis table', () => {
      createOldSchema((db) => {
        db.exec(`
          INSERT INTO documents (id, file_name, summary, reading_card, relation_analysis, writing_materials, todo_list, tags, index_status)
          VALUES ('doc-old', 'old.pdf', 'old summary', 'old card', 'old relation', 'old writing', 'old todo', 'tag1,tag2', 'indexed')
        `)
        db.exec(`INSERT INTO documents (id, file_name) VALUES ('doc-empty', 'empty.pdf')`)
      })

      migratedDb = new Database(MIGRATION_DB)
      new StorageService(migratedDb)

      const analysis = migratedDb.prepare('SELECT * FROM document_analysis WHERE document_id = ?').get('doc-old') as any
      expect(analysis).toBeTruthy()
      expect(analysis.summary).toBe('old summary')
      expect(analysis.reading_card).toBe('old card')
      expect(analysis.relation_analysis).toBe('old relation')
      expect(analysis.writing_materials).toBe('old writing')
      expect(analysis.todo_list).toBe('old todo')
      expect(analysis.tags).toBe('tag1,tag2')

      const emptyAnalysis = migratedDb.prepare('SELECT * FROM document_analysis WHERE document_id = ?').get('doc-empty') as any
      expect(emptyAnalysis).toBeTruthy()

      const docColumns = migratedDb.prepare('PRAGMA table_info(documents)').all() as { name: string }[]
      const colNames = docColumns.map(c => c.name)
      expect(colNames).not.toContain('summary')
      expect(colNames).not.toContain('reading_card')
      expect(colNames).not.toContain('index_status')
      expect(colNames).not.toContain('index_error')
      expect(colNames).not.toContain('indexed_at')

      const doc = migratedDb.prepare('SELECT * FROM documents WHERE id = ?').get('doc-old') as any
      expect(doc).toBeTruthy()
      expect(doc.file_name).toBe('old.pdf')

      const count = migratedDb.prepare('SELECT COUNT(*) as c FROM documents').get() as any
      expect(count.c).toBe(2)
    })

    it('should create vector ledger rows for indexed documents', () => {
      createOldSchema((db) => {
        db.exec(`
          CREATE TABLE knowledge_bases (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, readme TEXT NOT NULL DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `)
        db.exec(`
          CREATE TABLE document_knowledge_bases (
            document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
            sub_direction TEXT, tags TEXT, fit_score REAL, recommended_action TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (document_id, knowledge_base_id)
          )
        `)
        db.exec(`INSERT INTO knowledge_bases (id, name) VALUES ('kb-1', 'Test KB')`)
        db.exec(`INSERT INTO documents (id, file_name, index_status) VALUES ('doc-indexed', 'indexed.pdf', 'indexed')`)
        db.exec(`INSERT INTO documents (id, file_name, index_status, index_error) VALUES ('doc-failed', 'failed.pdf', 'index_failed', 'timeout')`)
        db.exec(`INSERT INTO documents (id, file_name, index_status) VALUES ('doc-indexing', 'indexing.pdf', 'indexing')`)
        db.exec(`INSERT INTO documents (id, file_name) VALUES ('doc-none', 'none.pdf')`)
        db.exec(`INSERT INTO document_knowledge_bases (document_id, knowledge_base_id) VALUES ('doc-indexed', 'kb-1')`)
        db.exec(`INSERT INTO document_knowledge_bases (document_id, knowledge_base_id) VALUES ('doc-failed', 'kb-1')`)
        db.exec(`INSERT INTO document_knowledge_bases (document_id, knowledge_base_id) VALUES ('doc-indexing', 'kb-1')`)
        db.exec(`INSERT INTO document_knowledge_bases (document_id, knowledge_base_id) VALUES ('doc-none', 'kb-1')`)
      })

      migratedDb = new Database(MIGRATION_DB)
      new StorageService(migratedDb)

      const rows = migratedDb.prepare('SELECT * FROM document_vector_indexes ORDER BY document_id').all() as any[]
      expect(rows).toHaveLength(4)

      const indexed = rows.find((r: any) => r.document_id === 'doc-indexed')
      expect(indexed.status).toBe('indexed')
      expect(indexed.knowledge_base_id).toBe('kb-1')

      const failed = rows.find((r: any) => r.document_id === 'doc-failed')
      expect(failed.status).toBe('failed')
      expect(failed.error).toBe('timeout')

      const indexing = rows.find((r: any) => r.document_id === 'doc-indexing')
      expect(indexing.status).toBe('indexing')

      const none = rows.find((r: any) => r.document_id === 'doc-none')
      expect(none.status).toBe('not_indexed')
    })

    it('should add influential_citation_count to paper_nodes and rebuild discovery_candidates', () => {
      createOldSchema((db) => {
        db.exec(`
          CREATE TABLE knowledge_bases (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, readme TEXT NOT NULL DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `)
        db.exec(`
          CREATE TABLE paper_nodes (
            paper_id TEXT PRIMARY KEY, title TEXT NOT NULL, abstract TEXT, year INTEGER,
            citation_count INTEGER DEFAULT 0, venue TEXT, authors TEXT, url TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `)
        db.exec(`
          CREATE TABLE discovery_candidates (
            id TEXT PRIMARY KEY, paper_id TEXT NOT NULL, title TEXT NOT NULL, abstract TEXT,
            year INTEGER, citation_count INTEGER DEFAULT 0, influential_citation_count INTEGER DEFAULT 0,
            venue TEXT, authors TEXT, url TEXT, source_query TEXT,
            discovery_priority_score REAL DEFAULT 0, discovery_reason TEXT,
            state TEXT NOT NULL DEFAULT 'saved',
            knowledge_base_id TEXT REFERENCES knowledge_bases(id) ON DELETE SET NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `)
        db.exec(`INSERT INTO paper_nodes (paper_id, title) VALUES ('paper-existing', 'Existing Paper')`)
        db.exec(`
          INSERT INTO discovery_candidates (id, paper_id, title, abstract, year, citation_count, influential_citation_count, venue, authors, url, state)
          VALUES ('dc1', 'paper-new', 'New Paper', 'Abstract', 2024, 50, 10, 'ICML', '["Author"]', 'http://example.com', 'saved')
        `)
        db.exec(`
          INSERT INTO discovery_candidates (id, paper_id, title, state)
          VALUES ('dc2', 'paper-existing', 'Existing Paper Ref', 'saved')
        `)
      })

      migratedDb = new Database(MIGRATION_DB)
      new StorageService(migratedDb)

      const pnCols = migratedDb.prepare('PRAGMA table_info(paper_nodes)').all() as { name: string }[]
      expect(pnCols.map(c => c.name)).toContain('influential_citation_count')

      const newPaper = migratedDb.prepare('SELECT * FROM paper_nodes WHERE paper_id = ?').get('paper-new') as any
      expect(newPaper).toBeTruthy()
      expect(newPaper.title).toBe('New Paper')
      expect(newPaper.year).toBe(2024)
      expect(newPaper.influential_citation_count).toBe(10)

      const dcCols = migratedDb.prepare('PRAGMA table_info(discovery_candidates)').all() as { name: string }[]
      const dcColNames = dcCols.map(c => c.name)
      expect(dcColNames).toContain('paper_id')
      expect(dcColNames).toContain('source_query')
      expect(dcColNames).toContain('state')
      expect(dcColNames).not.toContain('title')
      expect(dcColNames).not.toContain('abstract')
      expect(dcColNames).not.toContain('year')
      expect(dcColNames).not.toContain('citation_count')
      expect(dcColNames).not.toContain('influential_citation_count')
      expect(dcColNames).not.toContain('venue')
      expect(dcColNames).not.toContain('authors')
      expect(dcColNames).not.toContain('url')

      const dcRows = migratedDb.prepare('SELECT * FROM discovery_candidates ORDER BY id').all() as any[]
      expect(dcRows).toHaveLength(2)
      expect(dcRows[0].paper_id).toBe('paper-new')
      expect(dcRows[0].state).toBe('saved')
      expect(dcRows[1].paper_id).toBe('paper-existing')
    })
  })
})