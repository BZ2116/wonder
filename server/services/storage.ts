import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { runMigrations } from '../db/migrations'

// ── Interfaces ──────────────────────────────────────────────────────────

export interface DocumentRow {
  id: string
  file_name: string | null
  file_path: string | null
  file_type: string | null
  created_at: string
  match_score: number | null
  lifecycle_status: string | null
  // Analysis fields (from document_analysis JOIN)
  summary: string | null
  reading_card: string | null
  relation_analysis: string | null
  writing_materials: string | null
  todo_list: string | null
  tags: string | null
}

export interface DocumentAnalysisRow {
  document_id: string
  summary: string | null
  reading_card: string | null
  relation_analysis: string | null
  writing_materials: string | null
  todo_list: string | null
  tags: string | null
  analysis_version: number
  source_history_id: string | null
  created_at: string
  updated_at: string
}

export interface ChunkRow {
  id: string
  document_id: string
  chunk_index: number
  content: string
  embedding: Buffer | null
}

export interface HistoryRow {
  id: string
  document_id: string | null
  created_at: string
  result: string
}

export interface KnowledgeBaseRow {
  id: string
  name: string
  description: string | null
  readme: string
  created_at: string
  updated_at: string
}

export interface DocumentKBRow {
  document_id: string
  knowledge_base_id: string
  sub_direction: string | null
  tags: string | null
  fit_score: number | null
  recommended_action: string | null
  created_at: string
}

export interface DiscoveryCandidateRow {
  id: string
  paper_id: string
  source_query: string | null
  discovery_priority_score: number
  discovery_reason: string | null
  state: string
  knowledge_base_id: string | null
  created_at: string
  updated_at: string
}

export interface ReadmeSuggestionRow {
  id: string
  knowledge_base_id: string
  document_id: string | null
  section: string
  suggestion: string
  reason: string | null
  status: string
  created_at: string
}

export interface BatchRunRow {
  id: string
  name: string
  knowledge_base_id: string | null
  status: string
  created_at: string
  completed_at: string | null
}

export interface PaperNodeRow {
  paper_id: string
  title: string
  abstract: string | null
  year: number | null
  citation_count: number
  venue: string | null
  authors: string | null
  url: string | null
  updated_at: string
}

export interface PaperEdgeRow {
  id: string
  from_paper_id: string
  to_paper_id: string
  type: string
  source_seed_paper_id: string | null
  created_at: string
}

export interface BatchItemRow {
  id: string
  batch_run_id: string
  file_name: string
  file_type: string | null
  status: string
  document_id: string | null
  history_id: string | null
  error: string | null
  created_at: string
  completed_at: string | null
}

export interface QASessionRow {
  id: string
  title: string
  scope_type: string
  scope_ids: string
  created_at: string
  updated_at: string
}

export interface QAMessageRow {
  id: string
  session_id: string
  role: string
  content: string
  sources: string | null
  created_at: string
}

// ── StorageService ──────────────────────────────────────────────────────

export class StorageService {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    runMigrations(this.db)
  }

  static create(dataDir: string): StorageService {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    const dbPath = path.join(dataDir, 'wonder.db')
    const db = new Database(dbPath)
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf-8')
    db.exec(schema)
    return new StorageService(db)
  }

  // ── Document CRUD ───────────────────────────────────────────────────

  upsertDocument(doc: {
    id: string; fileName: string; filePath?: string | null; fileType?: string;
    summary?: string; readingCard?: string; relationAnalysis?: string;
    writingMaterials?: string; todoList?: string; tags?: string; matchScore?: number
  }) {
    this.db.prepare(`
      INSERT INTO documents (id, file_name, file_path, file_type, match_score)
      VALUES (@id, @fileName, @filePath, @fileType, @matchScore)
      ON CONFLICT(id) DO UPDATE SET
        file_name=excluded.file_name, file_path=excluded.file_path, file_type=excluded.file_type,
        match_score=COALESCE(excluded.match_score, match_score)
    `).run({
      id: doc.id,
      fileName: doc.fileName,
      filePath: doc.filePath ?? null,
      fileType: doc.fileType ?? null,
      matchScore: doc.matchScore ?? null,
    })

    // Upsert analysis fields into document_analysis
    if (doc.summary || doc.readingCard || doc.relationAnalysis || doc.writingMaterials || doc.todoList || doc.tags) {
      this.db.prepare(`
        INSERT INTO document_analysis (document_id, summary, reading_card, relation_analysis, writing_materials, todo_list, tags)
        VALUES (@documentId, @summary, @readingCard, @relationAnalysis, @writingMaterials, @todoList, @tags)
        ON CONFLICT(document_id) DO UPDATE SET
          summary=COALESCE(excluded.summary, summary), reading_card=COALESCE(excluded.reading_card, reading_card),
          relation_analysis=COALESCE(excluded.relation_analysis, relation_analysis),
          writing_materials=COALESCE(excluded.writing_materials, writing_materials),
          todo_list=COALESCE(excluded.todo_list, todo_list), tags=COALESCE(excluded.tags, tags),
          updated_at=datetime('now')
      `).run({
        documentId: doc.id,
        summary: doc.summary ?? null,
        readingCard: doc.readingCard ?? null,
        relationAnalysis: doc.relationAnalysis ?? null,
        writingMaterials: doc.writingMaterials ?? null,
        todoList: doc.todoList ?? null,
        tags: doc.tags ?? null,
      })
    }
  }

  getDocument(id: string): DocumentRow | undefined {
    return this.db.prepare(`
      SELECT d.*, da.summary, da.reading_card, da.relation_analysis,
             da.writing_materials, da.todo_list, da.tags
      FROM documents d
      LEFT JOIN document_analysis da ON d.id = da.document_id
      WHERE d.id = ?
    `).get(id) as DocumentRow | undefined
  }

  listDocuments(): DocumentRow[] {
    return this.db.prepare(`
      SELECT d.*, da.summary, da.reading_card, da.relation_analysis,
             da.writing_materials, da.todo_list, da.tags
      FROM documents d
      LEFT JOIN document_analysis da ON d.id = da.document_id
      ORDER BY d.created_at DESC
    `).all() as DocumentRow[]
  }

  deleteDocument(id: string) {
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id)
  }

  updateDocumentLifecycle(id: string, status: string) {
    this.db.prepare('UPDATE documents SET lifecycle_status = ? WHERE id = ?').run(status, id)
  }

  updateDocumentIndexStatus(id: string, status: string, error?: string | null, knowledgeBaseId?: string | null) {
    const kbId = knowledgeBaseId ?? null
    const existing = this.db.prepare(
      'SELECT id FROM document_vector_indexes WHERE document_id = ? AND (knowledge_base_id = ? OR (knowledge_base_id IS NULL AND ? IS NULL))'
    ).get(id, kbId, kbId) as { id: string } | undefined

    if (existing) {
      this.db.prepare(`
        UPDATE document_vector_indexes SET
          status = ?, error = ?,
          indexed_at = CASE WHEN ? = 'indexed' THEN datetime('now') ELSE indexed_at END,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(status, error ?? null, status, existing.id)
    } else {
      this.db.prepare(`
        INSERT INTO document_vector_indexes (id, document_id, knowledge_base_id, status, error, indexed_at)
        VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 'indexed' THEN datetime('now') ELSE NULL END)
      `).run(randomUUID(), id, kbId, status, error ?? null, status)
    }
  }

  // ── Chunk methods ───────────────────────────────────────────────────

  insertChunk(chunk: { id: string; documentId: string; content: string; embedding?: Buffer; chunkIndex: number }) {
    this.db.prepare('INSERT INTO chunks (id, document_id, content, embedding, chunk_index) VALUES (?, ?, ?, ?, ?)')
      .run(chunk.id, chunk.documentId, chunk.content, chunk.embedding ?? null, chunk.chunkIndex)
  }

  getChunksByDocument(documentId: string): ChunkRow[] {
    return this.db.prepare('SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index').all(documentId) as ChunkRow[]
  }

  getAllChunksWithEmbedding(): ChunkRow[] {
    return this.db.prepare('SELECT * FROM chunks WHERE embedding IS NOT NULL').all() as ChunkRow[]
  }

  deleteChunksByDocument(documentId: string) {
    this.db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId)
  }

  // ── Config methods ──────────────────────────────────────────────────

  setConfig(key: string, value: string) {
    this.db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, value)
  }

  getConfig(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value
  }

  getAllConfig(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM config').all() as { key: string; value: string }[]
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  }

  // ── History methods ─────────────────────────────────────────────────

  addHistory(entry: { id: string; documentId?: string; result: string }) {
    this.db.prepare('INSERT INTO analysis_history (id, document_id, result) VALUES (?, ?, ?)')
      .run(entry.id, entry.documentId ?? null, entry.result)
  }

  getHistory(id: string): HistoryRow | undefined {
    return this.db.prepare('SELECT * FROM analysis_history WHERE id = ?').get(id) as HistoryRow | undefined
  }

  listHistory(limit = 50): HistoryRow[] {
    return this.db.prepare('SELECT * FROM analysis_history ORDER BY created_at DESC LIMIT ?').all(limit) as HistoryRow[]
  }

  getLatestHistoryByDocumentId(documentId: string): HistoryRow | undefined {
    return this.db.prepare('SELECT * FROM analysis_history WHERE document_id = ? ORDER BY created_at DESC LIMIT 1').get(documentId) as HistoryRow | undefined
  }

  deleteHistory(id: string): boolean {
    const result = this.db.prepare('DELETE FROM analysis_history WHERE id = ?').run(id)
    return result.changes > 0
  }

  // ── Knowledge Base methods ──────────────────────────────────────────

  createKnowledgeBase(kb: { id: string; name: string; description?: string; readme?: string }) {
    this.db.prepare('INSERT INTO knowledge_bases (id, name, description, readme) VALUES (?, ?, ?, ?)')
      .run(kb.id, kb.name, kb.description ?? null, kb.readme ?? '')
  }

  getKnowledgeBase(id: string): KnowledgeBaseRow | undefined {
    return this.db.prepare('SELECT * FROM knowledge_bases WHERE id = ?').get(id) as KnowledgeBaseRow | undefined
  }

  listKnowledgeBases(): KnowledgeBaseRow[] {
    return this.db.prepare('SELECT * FROM knowledge_bases ORDER BY created_at DESC').all() as KnowledgeBaseRow[]
  }

  updateKnowledgeBase(id: string, updates: { name?: string; description?: string; readme?: string }) {
    const fields: string[] = []
    const values: unknown[] = []
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
    if (updates.readme !== undefined) { fields.push('readme = ?'); values.push(updates.readme) }
    if (fields.length === 0) return
    fields.push("updated_at = datetime('now')")
    values.push(id)
    this.db.prepare(`UPDATE knowledge_bases SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  deleteKnowledgeBase(id: string) {
    this.db.prepare('DELETE FROM knowledge_bases WHERE id = ?').run(id)
  }

  deleteKnowledgeBaseCascade(id: string) {
    const tx = this.db.transaction((knowledgeBaseId: string) => {
      this.db.prepare('DELETE FROM readme_suggestions WHERE knowledge_base_id = ?').run(knowledgeBaseId)
      this.db.prepare('DELETE FROM discovery_candidates WHERE knowledge_base_id = ?').run(knowledgeBaseId)
      this.db.prepare('DELETE FROM document_knowledge_bases WHERE knowledge_base_id = ?').run(knowledgeBaseId)
      this.db.prepare('DELETE FROM knowledge_bases WHERE id = ?').run(knowledgeBaseId)
    })
    tx(id)
  }

  // ── Document-KB methods ─────────────────────────────────────────────

  addDocumentToKB(assoc: { documentId: string; knowledgeBaseId: string; subDirection?: string; tags?: string; fitScore?: number; recommendedAction?: string }) {
    this.db.prepare(`
      INSERT INTO document_knowledge_bases (document_id, knowledge_base_id, sub_direction, tags, fit_score, recommended_action)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id, knowledge_base_id) DO UPDATE SET
        sub_direction=COALESCE(excluded.sub_direction, sub_direction), tags=COALESCE(excluded.tags, tags),
        fit_score=COALESCE(excluded.fit_score, fit_score), recommended_action=COALESCE(excluded.recommended_action, recommended_action)
    `).run(assoc.documentId, assoc.knowledgeBaseId, assoc.subDirection ?? null, assoc.tags ?? null, assoc.fitScore ?? null, assoc.recommendedAction ?? null)
  }

  removeDocumentFromKB(documentId: string, knowledgeBaseId: string) {
    this.db.prepare('DELETE FROM document_knowledge_bases WHERE document_id = ? AND knowledge_base_id = ?').run(documentId, knowledgeBaseId)
  }

  getDocumentsByKB(knowledgeBaseId: string): (DocumentRow & {
    kb_tags: string | null
    fit_score: number | null
    recommended_action: string | null
  })[] {
    return this.db.prepare(`
      SELECT d.*,
        da.summary, da.reading_card, da.relation_analysis,
        da.writing_materials, da.todo_list, da.tags,
        dkb.tags AS kb_tags,
        dkb.fit_score,
        dkb.recommended_action
      FROM documents d
      INNER JOIN document_knowledge_bases dkb ON d.id = dkb.document_id
      LEFT JOIN document_analysis da ON d.id = da.document_id
      WHERE dkb.knowledge_base_id = ?
      ORDER BY d.created_at DESC
    `).all(knowledgeBaseId) as (DocumentRow & {
      kb_tags: string | null
      fit_score: number | null
      recommended_action: string | null
    })[]
  }

  getKBsForDocument(documentId: string): KnowledgeBaseRow[] {
    return this.db.prepare(`
      SELECT kb.*
      FROM knowledge_bases kb
      INNER JOIN document_knowledge_bases dkb ON kb.id = dkb.knowledge_base_id
      WHERE dkb.document_id = ?
      ORDER BY kb.created_at DESC
    `).all(documentId) as KnowledgeBaseRow[]
  }

  getDocumentKBCount(knowledgeBaseId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM document_knowledge_bases WHERE knowledge_base_id = ?')
      .get(knowledgeBaseId) as { count: number }
    return row.count
  }

  getKBTags(knowledgeBaseId: string): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT tags FROM document_knowledge_bases
      WHERE knowledge_base_id = ? AND tags IS NOT NULL
    `).all(knowledgeBaseId) as { tags: string }[]
    const tagSet = new Set<string>()
    for (const row of rows) {
      for (const tag of row.tags.split(',')) {
        const t = tag.trim()
        if (t) tagSet.add(t)
      }
    }
    return Array.from(tagSet)
  }

  getPendingSuggestionCount(knowledgeBaseId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM readme_suggestions
      WHERE knowledge_base_id = ? AND status = 'pending'
    `).get(knowledgeBaseId) as { count: number }
    return row.count
  }

  // ── README suggestion methods ───────────────────────────────────────

  addReadmeSuggestion(suggestion: { id: string; knowledgeBaseId: string; documentId: string; section: string; suggestion: string; reason?: string }) {
    this.db.prepare(`
      INSERT INTO readme_suggestions (id, knowledge_base_id, document_id, section, suggestion, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(suggestion.id, suggestion.knowledgeBaseId, suggestion.documentId, suggestion.section, suggestion.suggestion, suggestion.reason ?? null)
  }

  getReadmeSuggestions(knowledgeBaseId: string, status?: string): ReadmeSuggestionRow[] {
    if (status) {
      return this.db.prepare('SELECT * FROM readme_suggestions WHERE knowledge_base_id = ? AND status = ? ORDER BY created_at DESC')
        .all(knowledgeBaseId, status) as ReadmeSuggestionRow[]
    }
    return this.db.prepare('SELECT * FROM readme_suggestions WHERE knowledge_base_id = ? ORDER BY created_at DESC')
      .all(knowledgeBaseId) as ReadmeSuggestionRow[]
  }

  getReadmeSuggestionById(id: string): ReadmeSuggestionRow | undefined {
    return this.db.prepare('SELECT * FROM readme_suggestions WHERE id = ?').get(id) as ReadmeSuggestionRow | undefined
  }

  updateReadmeSuggestionStatus(id: string, status: string) {
    this.db.prepare('UPDATE readme_suggestions SET status = ? WHERE id = ?').run(status, id)
  }

  // ── Discovery candidate methods ──────────────────────────────────────

  upsertDiscoveryCandidate(candidate: {
    id: string; paperId: string; title?: string; abstract?: string | null;
    year?: number | null; citationCount?: number; influentialCitationCount?: number;
    venue?: string | null; authors?: string | null; url?: string | null;
    sourceQuery?: string | null; discoveryPriorityScore?: number;
    discoveryReason?: string | null; state?: string; knowledgeBaseId?: string | null
  }) {
    const kbId = candidate.knowledgeBaseId ?? null

    // Upsert paper metadata into paper_nodes if title is provided
    if (candidate.title) {
      this.upsertPaperNode({
        paperId: candidate.paperId,
        title: candidate.title,
        abstract: candidate.abstract ?? undefined,
        year: candidate.year ?? undefined,
        citationCount: candidate.citationCount ?? undefined,
        venue: candidate.venue ?? undefined,
        authors: candidate.authors ?? undefined,
        url: candidate.url ?? undefined,
      })
    }

    // Check for existing candidate with same paper_id and matching knowledge_base_id
    const existing = this.db.prepare(
      'SELECT id FROM discovery_candidates WHERE paper_id = ? AND (knowledge_base_id = ? OR (knowledge_base_id IS NULL AND ? IS NULL))'
    ).get(candidate.paperId, kbId, kbId) as { id: string } | undefined

    if (existing) {
      this.db.prepare(`
        UPDATE discovery_candidates SET
          source_query=COALESCE(@sourceQuery, source_query),
          discovery_priority_score=@discoveryPriorityScore,
          discovery_reason=@discoveryReason,
          state=@state,
          updated_at=datetime('now')
        WHERE id=@id
      `).run({
        id: existing.id,
        sourceQuery: candidate.sourceQuery ?? null,
        discoveryPriorityScore: candidate.discoveryPriorityScore ?? 0,
        discoveryReason: candidate.discoveryReason ?? null,
        state: candidate.state ?? 'saved',
      })
    } else {
      this.db.prepare(`
        INSERT INTO discovery_candidates (id, paper_id, source_query,
          discovery_priority_score, discovery_reason, state, knowledge_base_id)
        VALUES (@id, @paperId, @sourceQuery,
          @discoveryPriorityScore, @discoveryReason, @state, @knowledgeBaseId)
      `).run({
        id: candidate.id,
        paperId: candidate.paperId,
        sourceQuery: candidate.sourceQuery ?? null,
        discoveryPriorityScore: candidate.discoveryPriorityScore ?? 0,
        discoveryReason: candidate.discoveryReason ?? null,
        state: candidate.state ?? 'saved',
        knowledgeBaseId: kbId,
      })
    }
  }

  getDiscoveryCandidate(id: string): DiscoveryCandidateRow | undefined {
    return this.db.prepare('SELECT * FROM discovery_candidates WHERE id = ?').get(id) as DiscoveryCandidateRow | undefined
  }

  listDiscoveryCandidates(opts?: { knowledgeBaseId?: string; state?: string }): DiscoveryCandidateRow[] {
    const conditions: string[] = []
    const values: unknown[] = []
    if (opts?.knowledgeBaseId) {
      conditions.push('knowledge_base_id = ?')
      values.push(opts.knowledgeBaseId)
    }
    if (opts?.state) {
      conditions.push('state = ?')
      values.push(opts.state)
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    return this.db.prepare(`SELECT * FROM discovery_candidates ${where} ORDER BY created_at DESC`)
      .all(...values) as DiscoveryCandidateRow[]
  }

  updateDiscoveryCandidateState(id: string, state: string) {
    this.db.prepare("UPDATE discovery_candidates SET state = ?, updated_at = datetime('now') WHERE id = ?")
      .run(state, id)
  }

  deleteDiscoveryCandidate(id: string) {
    this.db.prepare('DELETE FROM discovery_candidates WHERE id = ?').run(id)
  }

  // ── KB-scoped chunks ───────────────────────────────────────────────

  getChunksByKB(knowledgeBaseId: string): ChunkRow[] {
    return this.db.prepare(`
      SELECT c.* FROM chunks c
      INNER JOIN document_knowledge_bases dkb ON c.document_id = dkb.document_id
      WHERE dkb.knowledge_base_id = ?
      ORDER BY c.document_id, c.chunk_index
    `).all(knowledgeBaseId) as ChunkRow[]
  }

  // ── Batch methods ─────────────────────────────────────────────────────

  createBatchRun(run: { id: string; name: string; knowledge_base_id?: string }) {
    this.db.prepare('INSERT INTO batch_runs (id, name, knowledge_base_id) VALUES (?, ?, ?)')
      .run(run.id, run.name, run.knowledge_base_id ?? null)
  }

  getBatchRun(id: string): BatchRunRow | undefined {
    return this.db.prepare('SELECT * FROM batch_runs WHERE id = ?').get(id) as BatchRunRow | undefined
  }

  getBatchRuns(): BatchRunRow[] {
    return this.db.prepare('SELECT * FROM batch_runs ORDER BY created_at DESC').all() as BatchRunRow[]
  }

  updateBatchRunStatus(id: string, status: string, completed_at?: string) {
    this.db.prepare('UPDATE batch_runs SET status = ?, completed_at = ? WHERE id = ?')
      .run(status, completed_at ?? null, id)
  }

  createBatchItem(item: { id: string; batch_run_id: string; file_name: string; file_type?: string }) {
    this.db.prepare('INSERT INTO batch_items (id, batch_run_id, file_name, file_type) VALUES (?, ?, ?, ?)')
      .run(item.id, item.batch_run_id, item.file_name, item.file_type ?? null)
  }

  getBatchItemsByRunId(runId: string): BatchItemRow[] {
    return this.db.prepare('SELECT * FROM batch_items WHERE batch_run_id = ? ORDER BY created_at ASC')
      .all(runId) as BatchItemRow[]
  }

  updateBatchItemStatus(id: string, fields: { status?: string; document_id?: string; history_id?: string; error?: string; completed_at?: string }) {
    const cols: string[] = []
    const values: unknown[] = []
    if (fields.status !== undefined) { cols.push('status = ?'); values.push(fields.status) }
    if (fields.document_id !== undefined) { cols.push('document_id = ?'); values.push(fields.document_id) }
    if (fields.history_id !== undefined) { cols.push('history_id = ?'); values.push(fields.history_id) }
    if (fields.error !== undefined) { cols.push('error = ?'); values.push(fields.error) }
    if (fields.completed_at !== undefined) { cols.push('completed_at = ?'); values.push(fields.completed_at) }
    if (cols.length === 0) return
    values.push(id)
    this.db.prepare(`UPDATE batch_items SET ${cols.join(', ')} WHERE id = ?`).run(...values)
  }

  // ── Citation graph methods ─────────────────────────────────────────

  upsertPaperNode(node: {
    paperId: string; title: string; abstract?: string | null;
    year?: number | null; citationCount?: number; venue?: string | null;
    authors?: string | null; url?: string | null
  }) {
    this.db.prepare(`
      INSERT INTO paper_nodes (paper_id, title, abstract, year, citation_count, venue, authors, url, updated_at)
      VALUES (@paperId, @title, @abstract, @year, @citationCount, @venue, @authors, @url, datetime('now'))
      ON CONFLICT(paper_id) DO UPDATE SET
        title=excluded.title, abstract=COALESCE(excluded.abstract, abstract),
        year=COALESCE(excluded.year, year), citation_count=excluded.citation_count,
        venue=COALESCE(excluded.venue, venue), authors=COALESCE(excluded.authors, authors),
        url=COALESCE(excluded.url, url), updated_at=datetime('now')
    `).run({
      paperId: node.paperId,
      title: node.title,
      abstract: node.abstract ?? null,
      year: node.year ?? null,
      citationCount: node.citationCount ?? 0,
      venue: node.venue ?? null,
      authors: node.authors ?? null,
      url: node.url ?? null,
    })
  }

  getPaperNode(paperId: string): PaperNodeRow | undefined {
    return this.db.prepare('SELECT * FROM paper_nodes WHERE paper_id = ?').get(paperId) as PaperNodeRow | undefined
  }

  insertPaperEdge(edge: {
    id: string; fromPaperId: string; toPaperId: string;
    type: string; sourceSeedPaperId?: string | null
  }) {
    this.db.prepare(`
      INSERT OR IGNORE INTO paper_edges (id, from_paper_id, to_paper_id, type, source_seed_paper_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(edge.id, edge.fromPaperId, edge.toPaperId, edge.type, edge.sourceSeedPaperId ?? null)
  }

  getPaperEdgesBySeed(seedPaperId: string): PaperEdgeRow[] {
    return this.db.prepare(
      'SELECT * FROM paper_edges WHERE source_seed_paper_id = ?'
    ).all(seedPaperId) as PaperEdgeRow[]
  }

  getPaperEdgesByNode(paperId: string): PaperEdgeRow[] {
    return this.db.prepare(
      'SELECT * FROM paper_edges WHERE from_paper_id = ? OR to_paper_id = ?'
    ).all(paperId, paperId) as PaperEdgeRow[]
  }

  // ── QA Session methods ─────────────────────────────────────────────────

  createQASession(session: { id: string; title: string; scope_type?: string; scope_ids?: string }) {
    this.db.prepare('INSERT INTO qa_sessions (id, title, scope_type, scope_ids) VALUES (?, ?, ?, ?)')
      .run(session.id, session.title, session.scope_type ?? 'knowledge_base', session.scope_ids ?? '[]')
  }

  getQASession(id: string): QASessionRow | undefined {
    return this.db.prepare('SELECT * FROM qa_sessions WHERE id = ?').get(id) as QASessionRow | undefined
  }

  getQASessions(): QASessionRow[] {
    return this.db.prepare('SELECT * FROM qa_sessions ORDER BY updated_at DESC').all() as QASessionRow[]
  }

  updateQASession(id: string, fields: { title?: string; scope_type?: string; scope_ids?: string }) {
    const cols: string[] = []
    const values: unknown[] = []
    if (fields.title !== undefined) { cols.push('title = ?'); values.push(fields.title) }
    if (fields.scope_type !== undefined) { cols.push('scope_type = ?'); values.push(fields.scope_type) }
    if (fields.scope_ids !== undefined) { cols.push('scope_ids = ?'); values.push(fields.scope_ids) }
    if (cols.length === 0) return
    cols.push("updated_at = datetime('now')")
    values.push(id)
    this.db.prepare(`UPDATE qa_sessions SET ${cols.join(', ')} WHERE id = ?`).run(...values)
  }

  deleteQASession(id: string) {
    this.db.prepare('DELETE FROM qa_sessions WHERE id = ?').run(id)
  }

  addQAMessage(msg: { id: string; session_id: string; role: string; content: string; sources?: string }) {
    this.db.prepare('INSERT INTO qa_messages (id, session_id, role, content, sources) VALUES (?, ?, ?, ?, ?)')
      .run(msg.id, msg.session_id, msg.role, msg.content, msg.sources ?? null)
  }

  getQAMessagesBySessionId(sessionId: string): QAMessageRow[] {
    return this.db.prepare('SELECT * FROM qa_messages WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as QAMessageRow[]
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  close() {
    this.db.close()
  }
}
