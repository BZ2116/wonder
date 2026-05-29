import { Hono } from 'hono'
import { StorageService } from '../services/storage'

export function historyRoutes(storage: StorageService) {
  const app = new Hono()

  app.get('/', (c) => {
    const limit = parseInt(c.req.query('limit') || '50')
    const history = storage.listHistory(limit)
    return c.json(history)
  })

  app.get('/:id', (c) => {
    const id = c.req.param('id')
    const entry = storage.getHistory(id)
    if (!entry) return c.json({ error: 'Not found' }, 404)
    return c.json(entry)
  })

  return app
}
