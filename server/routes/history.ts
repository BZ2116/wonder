import { Hono } from 'hono'
import { StorageService } from '../services/storage'

const MAX_HISTORY_LIMIT = 500

export function historyRoutes(storage: StorageService) {
  const app = new Hono()

  app.get('/', (c) => {
    const raw = parseInt(c.req.query('limit') || '50', 10)
    const limit = Number.isFinite(raw) ? Math.min(MAX_HISTORY_LIMIT, Math.max(1, raw)) : 50
    const history = storage.listHistory(limit)
    return c.json(history)
  })

  app.get('/:id', (c) => {
    const id = c.req.param('id')
    const entry = storage.getHistory(id)
    if (!entry) return c.json({ error: 'Not found' }, 404)
    return c.json(entry)
  })

  app.delete('/:id', (c) => {
    const id = c.req.param('id')
    const deleted = storage.deleteHistory(id)
    if (!deleted) return c.json({ error: 'Not found' }, 404)
    return c.json({ ok: true })
  })

  return app
}
