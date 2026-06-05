import { Hono } from 'hono'
import { StorageService } from '../services/storage'
import { PythonBackendClient } from '../services/python-backend'

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
