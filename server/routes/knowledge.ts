import { Hono } from 'hono'
import { StorageService } from '../services/storage'
import { LLMService } from '../services/llm'

export function knowledgeRoutes(storage: StorageService, llm: LLMService) {
  const app = new Hono()

  app.get('/', (c) => {
    const docs = storage.listDocuments()
    return c.json(docs)
  })

  app.delete('/:id', (c) => {
    const id = c.req.param('id')
    storage.deleteChunksByDocument(id)
    storage.deleteDocument(id)
    return c.json({ success: true })
  })

  return app
}
