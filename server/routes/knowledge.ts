import { Hono } from 'hono'
import { StorageService } from '../services/storage'
import { PythonBackendClient } from '../services/python-backend'
import { extractDocumentMetadata, metadataStatus } from '../services/document-metadata'

function parseAuthors(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch { /* use comma fallback */ }
    return value.split(/[;,，、]/).map(v => v.trim()).filter(Boolean)
  }
  return []
}

export function knowledgeRoutes(storage: StorageService, python: PythonBackendClient) {
  const app = new Hono()

  app.get('/', (c) => {
    const docs = storage.listDocuments()
    return c.json(docs)
  })

  app.get('/documents/search', (c) => {
    const q = (c.req.query('q') || '').trim().toLowerCase()
    const knowledgeBaseId = c.req.query('knowledgeBaseId') || ''
    const limit = Math.min(Number(c.req.query('limit') || 20), 50)

    const rawDocs = knowledgeBaseId
      ? storage.getDocumentsByKBWithMetadata(knowledgeBaseId)
      : storage.listDocumentsWithMetadata()

    const docs = rawDocs
      .filter((doc: any) => {
        if (!q) return true
        const haystack = [
          doc.file_name,
          doc.title,
          typeof doc.authors === 'string' ? doc.authors : JSON.stringify(doc.authors),
          doc.year != null ? String(doc.year) : '',
          doc.venue,
          doc.doi,
          doc.tags,
          doc.kb_tags,
        ].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(q)
      })
      .slice(0, limit)
      .map((doc: any) => ({
        id: doc.id,
        fileName: doc.file_name || doc.title || doc.id,
        title: doc.title || null,
        authors: parseAuthors(doc.authors),
        year: doc.year || null,
        venue: doc.venue || null,
        knowledgeBaseId: doc.knowledge_base_id || null,
        indexedStatus: doc.index_status || doc.status || doc.indexed_status || doc.lifecycle_status || 'unknown',
        metadataStatus: doc.metadata_status || null,
      }))

    return c.json(docs)
  })

  app.post('/documents/metadata/backfill', async (c) => {
    const docs = storage.listDocuments()
    let updated = 0
    let missing = 0
    let skipped = 0

    for (const doc of docs) {
      const existing = storage.getDocumentMetadata(doc.id)
      if (existing?.metadata_status === 'complete') {
        skipped += 1
        continue
      }

      const history = storage.getLatestHistoryByDocumentId(doc.id)
      const meta = extractDocumentMetadata({
        fileName: doc.file_name,
        readingCard: doc.reading_card,
        summary: doc.summary,
        historyResult: history?.result,
      })
      const status = metadataStatus(meta)
      storage.upsertDocumentMetadata({
        documentId: doc.id,
        title: meta.title,
        authors: meta.authors,
        year: meta.year,
        venue: meta.venue,
        doi: meta.doi,
        url: meta.url,
        abstract: meta.abstract,
        keywords: meta.keywords,
        metadataStatus: status,
        metadataSource: meta.source,
      })
      if (status === 'missing') missing += 1
      else updated += 1
    }

    return c.json({ updated, missing, skipped, total: docs.length })
  })

  app.post('/documents/:id/metadata/backfill', async (c) => {
    const id = c.req.param('id')
    const doc = storage.getDocument(id)
    if (!doc) return c.json({ error: 'Document not found' }, 404)
    const history = storage.getLatestHistoryByDocumentId(id)
    const meta = extractDocumentMetadata({
      fileName: doc.file_name,
      readingCard: doc.reading_card,
      summary: doc.summary,
      historyResult: history?.result,
    })
    const status = metadataStatus(meta)
    storage.upsertDocumentMetadata({
      documentId: id,
      title: meta.title,
      authors: meta.authors,
      year: meta.year,
      venue: meta.venue,
      doi: meta.doi,
      url: meta.url,
      abstract: meta.abstract,
      keywords: meta.keywords,
      metadataStatus: status,
      metadataSource: meta.source,
    })
    return c.json({ documentId: id, metadataStatus: status, metadata: meta })
  })

  app.delete('/:id', async (c) => {
    const id = c.req.param('id')
    try {
      await python.delete(`/api/knowledge/documents/${id}`)
    } catch {
      // SQLite remains source of truth; failed index deletion can be retried by reindex tooling.
    }
    storage.deleteChunksByDocument(id)
    storage.deleteDocument(id)
    return c.json({ success: true })
  })

  return app
}
