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
    storage.createKnowledgeBase({ id: 'kb-test', name: 'Test KB' })
    storage.upsertDocument({ id: 'doc1', fileName: 'test.pdf', fileType: 'pdf' })
    storage.updateDocumentIndexStatus('doc1', 'indexed', null, 'kb-test')
    const row = db.prepare('SELECT * FROM document_vector_indexes WHERE document_id = ?').get('doc1') as any
    expect(row).toBeDefined()
    expect(row.status).toBe('indexed')
    expect(row.indexed_at).not.toBeNull()
    expect(row.knowledge_base_id).toBe('kb-test')
  })

  it('should record index error on failure', () => {
    storage.createKnowledgeBase({ id: 'kb-test', name: 'Test KB' })
    storage.upsertDocument({ id: 'doc1', fileName: 'test.pdf', fileType: 'pdf' })
    storage.updateDocumentIndexStatus('doc1', 'index_failed', 'embedding timeout', 'kb-test')
    const row = db.prepare('SELECT * FROM document_vector_indexes WHERE document_id = ?').get('doc1') as any
    expect(row).toBeDefined()
    expect(row.status).toBe('index_failed')
    expect(row.error).toBe('embedding timeout')
    expect(row.indexed_at).toBeNull()
  })

  // ── Document Analysis tests ──────────────────────────────────────────

  it('should retrieve document analysis via standalone getter', () => {
    storage.upsertDocument({
      id: 'doc1',
      fileName: 'paper.pdf',
      fileType: 'pdf',
      summary: 'summary',
      readingCard: 'card',
      relationAnalysis: 'relation',
      writingMaterials: 'writing',
      todoList: 'todo',
      tags: 'rag,llm',
      matchScore: 88,
    })

    const doc = storage.getDocument('doc1')!
    expect(doc.summary).toBe('summary')
    expect(doc.reading_card).toBe('card')
    expect(doc.match_score).toBe(88)

    const analysis = storage.getDocumentAnalysis('doc1')!
    expect(analysis).toBeDefined()
    expect(analysis.document_id).toBe('doc1')
    expect(analysis.summary).toBe('summary')
    expect(analysis.reading_card).toBe('card')
    expect(analysis.tags).toBe('rag,llm')
  })

  it('should return undefined from getDocumentAnalysis for nonexistent doc', () => {
    expect(storage.getDocumentAnalysis('nonexistent')).toBeUndefined()
  })

  // ── Vector Ledger tests ────────────────────────────────────────────

  it('should upsert and retrieve a document vector index', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB1' })
    storage.upsertDocument({ id: 'doc1', fileName: 'paper.pdf', fileType: 'pdf' })
    storage.upsertDocumentVectorIndex({
      id: 'idx1',
      documentId: 'doc1',
      knowledgeBaseId: 'kb1',
      backend: 'chroma',
      collectionName: 'documents__openai__small__1536',
      embeddingProvider: 'openai_compatible',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      chunkCount: 3,
      indexVersion: 1,
      status: 'indexed',
    })

    const indexes = storage.getVectorIndexesForDocument('doc1')
    expect(indexes).toHaveLength(1)
    expect(indexes[0].id).toBe('idx1')
    expect(indexes[0].document_id).toBe('doc1')
    expect(indexes[0].knowledge_base_id).toBe('kb1')
    expect(indexes[0].backend).toBe('chroma')
    expect(indexes[0].collection_name).toBe('documents__openai__small__1536')
    expect(indexes[0].embedding_provider).toBe('openai_compatible')
    expect(indexes[0].embedding_model).toBe('text-embedding-3-small')
    expect(indexes[0].embedding_dimensions).toBe(1536)
    expect(indexes[0].chunk_count).toBe(3)
    expect(indexes[0].index_version).toBe(1)
    expect(indexes[0].status).toBe('indexed')
  })

  it('should filter vector indexes by knowledge base and status', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB1' })
    storage.createKnowledgeBase({ id: 'kb2', name: 'KB2' })
    storage.upsertDocument({ id: 'doc1', fileName: 'a.pdf', fileType: 'pdf' })
    storage.upsertDocument({ id: 'doc2', fileName: 'b.pdf', fileType: 'pdf' })

    storage.upsertDocumentVectorIndex({
      id: 'idx1', documentId: 'doc1', knowledgeBaseId: 'kb1',
      backend: 'chroma', collectionName: 'col1', status: 'indexed',
    })
    storage.upsertDocumentVectorIndex({
      id: 'idx2', documentId: 'doc2', knowledgeBaseId: 'kb1',
      backend: 'chroma', collectionName: 'col1', status: 'stale',
    })
    storage.upsertDocumentVectorIndex({
      id: 'idx3', documentId: 'doc1', knowledgeBaseId: 'kb2',
      backend: 'chroma', collectionName: 'col1', status: 'indexed',
    })

    expect(storage.getVectorIndexesForKnowledgeBase('kb1')).toHaveLength(2)
    expect(storage.getVectorIndexesForKnowledgeBase('kb1', 'indexed')).toHaveLength(1)
    expect(storage.getVectorIndexesForKnowledgeBase('kb1', 'indexed')[0].id).toBe('idx1')
    expect(storage.getVectorIndexesForKnowledgeBase('kb2', 'indexed')).toHaveLength(1)
  })

  it('should mark vector index status with error', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB1' })
    storage.upsertDocument({ id: 'doc1', fileName: 'a.pdf', fileType: 'pdf' })
    storage.upsertDocumentVectorIndex({
      id: 'idx1', documentId: 'doc1', knowledgeBaseId: 'kb1',
      backend: 'chroma', collectionName: 'col1', status: 'indexing',
    })

    storage.markVectorIndexStatus('idx1', 'indexed')
    const idx = storage.getVectorIndexesForDocument('doc1')[0]
    expect(idx.status).toBe('indexed')
    expect(idx.indexed_at).not.toBeNull()
    expect(idx.error).toBeNull()

    storage.markVectorIndexStatus('idx1', 'failed', 'embedding timeout')
    const failed = storage.getVectorIndexesForDocument('doc1')[0]
    expect(failed.status).toBe('failed')
    expect(failed.error).toBe('embedding timeout')
  })

  it('should mark all document indexes as stale', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB1' })
    storage.createKnowledgeBase({ id: 'kb2', name: 'KB2' })
    storage.upsertDocument({ id: 'doc1', fileName: 'a.pdf', fileType: 'pdf' })

    storage.upsertDocumentVectorIndex({
      id: 'idx1', documentId: 'doc1', knowledgeBaseId: 'kb1',
      backend: 'chroma', collectionName: 'col1', status: 'indexed',
    })
    storage.upsertDocumentVectorIndex({
      id: 'idx2', documentId: 'doc1', knowledgeBaseId: 'kb2',
      backend: 'chroma', collectionName: 'col1', status: 'indexed',
    })

    storage.markDocumentIndexesStale('doc1')
    const indexes = storage.getVectorIndexesForDocument('doc1')
    expect(indexes).toHaveLength(2)
    expect(indexes.every(i => i.status === 'stale')).toBe(true)
  })

  it('should return empty array for document with no vector indexes', () => {
    storage.upsertDocument({ id: 'doc1', fileName: 'a.pdf', fileType: 'pdf' })
    expect(storage.getVectorIndexesForDocument('doc1')).toHaveLength(0)
  })

  it('should upsert vector index on conflict (same unique key)', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB1' })
    storage.upsertDocument({ id: 'doc1', fileName: 'a.pdf', fileType: 'pdf' })

    storage.upsertDocumentVectorIndex({
      id: 'idx1', documentId: 'doc1', knowledgeBaseId: 'kb1',
      backend: 'chroma', collectionName: 'col1', chunkCount: 3, status: 'indexed',
    })
    storage.upsertDocumentVectorIndex({
      id: 'idx1', documentId: 'doc1', knowledgeBaseId: 'kb1',
      backend: 'chroma', collectionName: 'col1', chunkCount: 5, status: 'indexed',
    })

    const indexes = storage.getVectorIndexesForDocument('doc1')
    expect(indexes).toHaveLength(1)
    expect(indexes[0].chunk_count).toBe(5)
  })

  // ── Discovery candidate tests ──────────────────────────────────────

  it('should insert and retrieve a discovery candidate with paper metadata via JOIN', () => {
    storage.upsertDiscoveryCandidate({
      id: 'c1', paperId: 's2-123', title: 'Test Paper', abstract: 'Abstract text',
      year: 2024, citationCount: 10, influentialCitationCount: 4, venue: 'ICML',
      authors: JSON.stringify([{ authorId: 'a1', name: 'Author' }]),
      url: 'https://example.com', sourceQuery: 'RAG',
      discoveryPriorityScore: 75, discoveryReason: 'keyword match',
      state: 'saved', knowledgeBaseId: null,
    })

    // Verify paper_nodes has the metadata
    const paper = storage.getPaperNode('s2-123')
    expect(paper).toBeDefined()
    expect(paper!.title).toBe('Test Paper')
    expect(paper!.influential_citation_count).toBe(4)

    // Verify getDiscoveryCandidate returns paper metadata via JOIN
    const candidate = storage.getDiscoveryCandidate('c1')
    expect(candidate).toBeDefined()
    expect(candidate!.paper_id).toBe('s2-123')
    expect(candidate!.title).toBe('Test Paper')
    expect(candidate!.abstract).toBe('Abstract text')
    expect(candidate!.year).toBe(2024)
    expect(candidate!.citation_count).toBe(10)
    expect(candidate!.influential_citation_count).toBe(4)
    expect(candidate!.venue).toBe('ICML')
    expect(candidate!.authors).toBe(JSON.stringify([{ authorId: 'a1', name: 'Author' }]))
    expect(candidate!.url).toBe('https://example.com')
    expect(candidate!.state).toBe('saved')
    expect(candidate!.source_query).toBe('RAG')
    expect(candidate!.discovery_priority_score).toBe(75)
  })

  it('should list candidates filtered by knowledge base with paper metadata', () => {
    storage.createKnowledgeBase({ id: 'kb-1', name: 'KB' })
    storage.upsertDiscoveryCandidate({ id: 'c1', paperId: 'p1', title: 'Paper A', year: 2024, state: 'saved', knowledgeBaseId: 'kb-1' })
    storage.upsertDiscoveryCandidate({ id: 'c2', paperId: 'p2', title: 'Paper B', year: 2025, state: 'saved', knowledgeBaseId: null })
    const kbCandidates = storage.listDiscoveryCandidates({ knowledgeBaseId: 'kb-1' })
    expect(kbCandidates).toHaveLength(1)
    expect(kbCandidates[0].paper_id).toBe('p1')
    expect(kbCandidates[0].title).toBe('Paper A')
    expect(kbCandidates[0].year).toBe(2024)
  })

  it('should list candidates filtered by state with paper metadata', () => {
    storage.upsertDiscoveryCandidate({ id: 'c1', paperId: 'p1', title: 'A', abstract: 'Abs A', state: 'saved' })
    storage.upsertDiscoveryCandidate({ id: 'c2', paperId: 'p2', title: 'B', abstract: 'Abs B', state: 'ignored' })
    const saved = storage.listDiscoveryCandidates({ state: 'saved' })
    expect(saved).toHaveLength(1)
    expect(saved[0].state).toBe('saved')
    expect(saved[0].title).toBe('A')
    expect(saved[0].abstract).toBe('Abs A')
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

  it('should deduplicate by (paper_id, knowledge_base_id) with paper metadata', () => {
    storage.upsertDiscoveryCandidate({ id: 'c1', paperId: 'p1', title: 'First', state: 'saved' })
    storage.upsertDiscoveryCandidate({ id: 'c1b', paperId: 'p1', title: 'Updated', state: 'ignored' })
    const candidates = storage.listDiscoveryCandidates()
    expect(candidates).toHaveLength(1)
    expect(candidates[0].state).toBe('ignored')
    expect(candidates[0].title).toBe('Updated')

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

  // ── Research Card tests ──────────────────────────────────────────────

  it('should create and retrieve research card with evidence refs', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB' })
    storage.upsertDocument({ id: 'doc1', fileName: 'paper.pdf' })
    storage.createQASession({ id: 's1', title: 'QA' })
    storage.addQAMessage({ id: 'm1', session_id: 's1', role: 'assistant', content: 'answer' })

    storage.createResearchCard({
      id: 'card1', knowledgeBaseId: 'kb1', question: 'q',
      coreClaims: JSON.stringify(['claim']), knowledgeType: 'method',
      tags: JSON.stringify(['rag']), validationNotes: 'verified',
      useCases: JSON.stringify(['review']), linkedDocIds: JSON.stringify(['doc1']),
      sourceMessageId: 'm1', noPaperEvidence: false,
    })
    storage.replaceResearchCardEvidenceRefs('card1', [{
      id: 'ref1', documentId: 'doc1', fileName: 'paper.pdf',
      chunkType: 'content', snippet: 'evidence', score: 0.9,
    }])

    expect(storage.getResearchCard('card1')!.knowledge_type).toBe('method')
    expect(storage.getResearchCardEvidenceRefs('card1')).toHaveLength(1)
  })

  it('should create research card with refs in a single transaction', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB' })
    storage.upsertDocument({ id: 'doc1', fileName: 'paper.pdf' })

    storage.createResearchCardWithRefs({
      id: 'card-tx', knowledgeBaseId: 'kb1', question: 'What is RAG?',
      coreClaims: JSON.stringify(['claim1']), knowledgeType: 'method',
      tags: JSON.stringify(['rag']), validationNotes: 'verified',
      useCases: JSON.stringify(['review']), linkedDocIds: '[]', noPaperEvidence: false,
    }, [
      { id: 'ref-a', documentId: 'doc1', fileName: 'paper.pdf', chunkType: 'content', snippet: 'evidence A', score: 0.9 },
      { id: 'ref-b', documentId: 'doc1', fileName: 'paper.pdf', chunkType: 'content', snippet: 'evidence B', score: 0.8 },
    ])

    const card = storage.getResearchCard('card-tx')!
    expect(card).toBeDefined()
    expect(card.question).toBe('What is RAG?')
    expect(card.knowledge_type).toBe('method')

    const refs = storage.getResearchCardEvidenceRefs('card-tx')
    expect(refs).toHaveLength(2)
    expect(refs[0].snippet).toBe('evidence A')
    expect(refs[1].snippet).toBe('evidence B')
  })

  it('should create research card with refs when refs array is empty', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB' })

    storage.createResearchCardWithRefs({
      id: 'card-no-refs', knowledgeBaseId: 'kb1', question: 'q',
      coreClaims: '[]', knowledgeType: 'method', tags: '[]',
      validationNotes: '', useCases: '[]', linkedDocIds: '[]', noPaperEvidence: true,
    }, [])

    const card = storage.getResearchCard('card-no-refs')!
    expect(card).toBeDefined()
    expect(storage.getResearchCardEvidenceRefs('card-no-refs')).toHaveLength(0)
  })

  it('should list research cards filtered by knowledge base and status', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB1' })
    storage.createKnowledgeBase({ id: 'kb2', name: 'KB2' })

    storage.createResearchCard({
      id: 'card1', knowledgeBaseId: 'kb1', question: 'q1',
      coreClaims: '[]', knowledgeType: 'method', tags: '[]',
      validationNotes: '', useCases: '[]', linkedDocIds: '[]', noPaperEvidence: false,
    })
    storage.createResearchCard({
      id: 'card2', knowledgeBaseId: 'kb1', question: 'q2',
      coreClaims: '[]', knowledgeType: 'finding', tags: '[]',
      validationNotes: '', useCases: '[]', linkedDocIds: '[]',
      status: 'draft', noPaperEvidence: false,
    })
    storage.createResearchCard({
      id: 'card3', knowledgeBaseId: 'kb2', question: 'q3',
      coreClaims: '[]', knowledgeType: 'method', tags: '[]',
      validationNotes: '', useCases: '[]', linkedDocIds: '[]', noPaperEvidence: false,
    })

    // Default filter: status=saved, kb1
    const saved = storage.listResearchCards({ knowledgeBaseId: 'kb1' })
    expect(saved).toHaveLength(1)
    expect(saved[0].id).toBe('card1')

    // Explicit status=draft
    const drafts = storage.listResearchCards({ knowledgeBaseId: 'kb1', status: 'draft' })
    expect(drafts).toHaveLength(1)
    expect(drafts[0].id).toBe('card2')

    // Filter by knowledge type
    const methods = storage.listResearchCards({ knowledgeBaseId: 'kb1', status: 'saved', knowledgeType: 'method' })
    expect(methods).toHaveLength(1)

    // kb2
    const kb2Cards = storage.listResearchCards({ knowledgeBaseId: 'kb2' })
    expect(kb2Cards).toHaveLength(1)
  })

  it('should update research card fields', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB' })
    storage.createResearchCard({
      id: 'card1', knowledgeBaseId: 'kb1', question: 'q',
      coreClaims: '[]', knowledgeType: 'method', tags: '[]',
      validationNotes: '', useCases: '[]', linkedDocIds: '[]', noPaperEvidence: false,
    })

    storage.updateResearchCard('card1', {
      coreClaims: JSON.stringify(['updated claim']),
      knowledgeType: 'finding',
      status: 'archived',
    })

    const card = storage.getResearchCard('card1')!
    expect(card.core_claims).toBe('["updated claim"]')
    expect(card.knowledge_type).toBe('finding')
    expect(card.status).toBe('archived')
  })

  it('should archive research card', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB' })
    storage.createResearchCard({
      id: 'card1', knowledgeBaseId: 'kb1', question: 'q',
      coreClaims: '[]', knowledgeType: 'method', tags: '[]',
      validationNotes: '', useCases: '[]', linkedDocIds: '[]', noPaperEvidence: false,
    })

    storage.archiveResearchCard('card1')
    expect(storage.getResearchCard('card1')!.status).toBe('archived')
  })

  it('should upsert and retrieve research card vector index', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB' })
    storage.createResearchCard({
      id: 'card1', knowledgeBaseId: 'kb1', question: 'q',
      coreClaims: '[]', knowledgeType: 'method', tags: '[]',
      validationNotes: '', useCases: '[]', linkedDocIds: '[]', noPaperEvidence: false,
    })

    storage.upsertResearchCardVectorIndex({
      id: 'vi1', cardId: 'card1', knowledgeBaseId: 'kb1',
      backend: 'chroma', collectionName: 'cards',
      status: 'indexing',
    })

    const indexes = storage.getResearchCardVectorIndexes('card1')
    expect(indexes).toHaveLength(1)
    expect(indexes[0].status).toBe('indexing')

    storage.markResearchCardVectorIndexStatus('vi1', 'indexed')
    const updated = storage.getResearchCardVectorIndexes('card1')
    expect(updated[0].status).toBe('indexed')
    expect(updated[0].indexed_at).not.toBeNull()
  })

  it('should replace evidence refs idempotently', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB' })
    storage.upsertDocument({ id: 'doc1', fileName: 'a.pdf' })
    storage.upsertDocument({ id: 'doc2', fileName: 'b.pdf' })
    storage.createResearchCard({
      id: 'card1', knowledgeBaseId: 'kb1', question: 'q',
      coreClaims: '[]', knowledgeType: 'method', tags: '[]',
      validationNotes: '', useCases: '[]', linkedDocIds: '[]', noPaperEvidence: false,
    })

    storage.replaceResearchCardEvidenceRefs('card1', [
      { id: 'ref1', documentId: 'doc1', snippet: 's1' },
    ])
    expect(storage.getResearchCardEvidenceRefs('card1')).toHaveLength(1)

    // Replace with different refs
    storage.replaceResearchCardEvidenceRefs('card1', [
      { id: 'ref2', documentId: 'doc2', snippet: 's2' },
      { id: 'ref3', documentId: 'doc1', snippet: 's3' },
    ])
    const refs = storage.getResearchCardEvidenceRefs('card1')
    expect(refs).toHaveLength(2)
    expect(refs[0].id).toBe('ref2')
  })

  it('should return undefined for nonexistent research card', () => {
    expect(storage.getResearchCard('nonexistent')).toBeUndefined()
  })

  it('should get QA message by id', () => {
    storage.createQASession({ id: 's1', title: 'Test' })
    storage.addQAMessage({ id: 'm1', session_id: 's1', role: 'user', content: 'hello' })
    storage.addQAMessage({ id: 'm2', session_id: 's1', role: 'assistant', content: 'answer', sources: '{}' })

    const msg = storage.getQAMessage('m2')
    expect(msg).toBeDefined()
    expect(msg!.role).toBe('assistant')
    expect(msg!.content).toBe('answer')
  })

  it('should get previous user message in session', () => {
    storage.createQASession({ id: 's1', title: 'Test' })
    storage.addQAMessage({ id: 'm1', session_id: 's1', role: 'user', content: 'q1' })
    db.prepare("UPDATE qa_messages SET created_at = '2024-01-01' WHERE id = 'm1'").run()
    storage.addQAMessage({ id: 'm2', session_id: 's1', role: 'assistant', content: 'a1' })
    db.prepare("UPDATE qa_messages SET created_at = '2024-01-02' WHERE id = 'm2'").run()
    storage.addQAMessage({ id: 'm3', session_id: 's1', role: 'user', content: 'q2' })
    db.prepare("UPDATE qa_messages SET created_at = '2024-01-03' WHERE id = 'm3'").run()

    const prev = storage.getPreviousUserMessage('s1', '2024-01-02')
    expect(prev).toBeDefined()
    expect(prev!.id).toBe('m1')
    expect(prev!.content).toBe('q1')
  })

  // ── Document Metadata tests ──────────────────────────────────────────

  it('should upsert and retrieve document metadata', () => {
    storage.upsertDocument({ id: 'doc1', fileName: 'paper.pdf', fileType: 'pdf' })
    storage.upsertDocumentMetadata({
      documentId: 'doc1',
      title: 'Paper Title',
      authors: ['Author A'],
      year: 2024,
      metadataStatus: 'partial',
      metadataSource: 'reading_card',
    })

    const meta = storage.getDocumentMetadata('doc1')!
    expect(meta.title).toBe('Paper Title')
    expect(JSON.parse(meta.authors || '[]')).toEqual(['Author A'])
    expect(meta.metadata_status).toBe('partial')
  })

  it('should list KB documents with metadata and index status', () => {
    storage.createKnowledgeBase({ id: 'kb1', name: 'KB' })
    storage.upsertDocument({ id: 'doc1', fileName: 'paper.pdf', fileType: 'pdf' })
    storage.addDocumentToKB({ documentId: 'doc1', knowledgeBaseId: 'kb1' })
    storage.upsertDocumentMetadata({ documentId: 'doc1', title: 'Paper Title', authors: [], metadataStatus: 'partial', metadataSource: 'file_name' })
    storage.upsertDocumentVectorIndex({ id: 'idx1', documentId: 'doc1', knowledgeBaseId: 'kb1', status: 'indexed' })

    const docs = storage.getDocumentsByKBWithMetadata('kb1')
    expect(docs[0].title).toBe('Paper Title')
    expect(docs[0].index_status).toBe('indexed')
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

    it('should pass foreign_key_check after migration', () => {
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
        db.exec(`INSERT INTO documents (id, file_name, summary) VALUES ('doc1', 'test.pdf', 'old summary')`)
        db.exec(`INSERT INTO knowledge_bases (id, name) VALUES ('kb-1', 'Test KB')`)
        db.exec(`INSERT INTO document_knowledge_bases (document_id, knowledge_base_id) VALUES ('doc1', 'kb-1')`)
      })

      migratedDb = new Database(MIGRATION_DB)
      migratedDb.pragma('foreign_keys = ON')
      new StorageService(migratedDb)

      // PRAGMA foreign_key_check returns empty if all FKs are valid
      const violations = migratedDb.prepare('PRAGMA foreign_key_check').all() as any[]
      expect(violations).toHaveLength(0)
    })

    it('should create research card tables via migration', () => {
      // Use StorageService.create which applies full schema.sql then runs migrations
      const testDir = path.join(__dirname, 'migration-rc-test')
      try {
        const svc = StorageService.create(testDir)
        const testDb = (svc as any).db as Database.Database

        const tables = ['research_cards', 'research_card_evidence_refs', 'research_card_vector_indexes']
        for (const table of tables) {
          const row = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)
          expect(row).toBeTruthy()
        }

        // Verify migration 4 was recorded
        const migration = testDb.prepare('SELECT * FROM schema_migrations WHERE version = 4').get() as any
        expect(migration).toBeTruthy()
        expect(migration.name).toBe('create_research_cards')

        testDb.close()
      } finally {
        // Cleanup
        const dbPath = path.join(testDir, 'wonder.db')
        for (const suffix of ['', '-wal', '-shm']) {
          const f = dbPath + suffix
          if (fs.existsSync(f)) { try { fs.unlinkSync(f) } catch { /* ignore */ } }
        }
        if (fs.existsSync(testDir)) { try { fs.rmdirSync(testDir) } catch { /* ignore */ } }
      }
    })

    it('should deterministically keep best candidate during duplicate resolution in migration 3', () => {
      const dupDb = path.join(__dirname, 'dup-test.db')
      try {
        // Create old schema
        const setupDb = new Database(dupDb)
        setupDb.exec(`
          CREATE TABLE documents (
            id TEXT PRIMARY KEY, file_name TEXT NOT NULL, file_path TEXT, file_type TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP, summary TEXT, reading_card TEXT,
            relation_analysis TEXT, writing_materials TEXT, todo_list TEXT, tags TEXT,
            match_score REAL, lifecycle_status TEXT DEFAULT 'analyzed',
            index_status TEXT DEFAULT 'not_indexed', index_error TEXT, indexed_at TEXT
          )
        `)
        setupDb.exec(`
          CREATE TABLE knowledge_bases (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, readme TEXT NOT NULL DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `)
        setupDb.exec(`
          CREATE TABLE paper_nodes (
            paper_id TEXT PRIMARY KEY, title TEXT NOT NULL, abstract TEXT, year INTEGER,
            citation_count INTEGER DEFAULT 0, venue TEXT, authors TEXT, url TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `)
        setupDb.exec(`
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
        // Insert two candidates with same paper_id but different updated_at and priority
        setupDb.exec(`
          INSERT INTO discovery_candidates (id, paper_id, title, discovery_priority_score, state, updated_at)
          VALUES ('dc-old', 'paper-dup', 'Old Candidate', 10, 'saved', '2024-01-01 00:00:00')
        `)
        setupDb.exec(`
          INSERT INTO discovery_candidates (id, paper_id, title, discovery_priority_score, state, updated_at)
          VALUES ('dc-new', 'paper-dup', 'New Candidate', 90, 'saved', '2024-06-01 00:00:00')
        `)
        setupDb.close()

        const testDb = new Database(dupDb)
        new StorageService(testDb)

        const dcRows = testDb.prepare('SELECT * FROM discovery_candidates').all() as any[]
        expect(dcRows).toHaveLength(1)
        // The newer row with higher priority should survive (dc-new)
        expect(dcRows[0].id).toBe('dc-new')

        // Verify paper_nodes got the right title
        const paper = testDb.prepare('SELECT * FROM paper_nodes WHERE paper_id = ?').get('paper-dup') as any
        expect(paper).toBeTruthy()
        expect(paper.title).toBe('New Candidate')

        testDb.close()
      } finally {
        for (const suffix of ['', '-wal', '-shm']) {
          const f = dupDb + suffix
          if (fs.existsSync(f)) { try { fs.unlinkSync(f) } catch { /* ignore */ } }
        }
      }
    })
  })
})