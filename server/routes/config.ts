import { Hono } from 'hono'
import { StorageService } from '../services/storage'

export function configRoutes(storage: StorageService) {
  const app = new Hono()

  app.get('/', (c) => {
    const config = storage.getAllConfig()
    return c.json(config)
  })

  app.put('/', async (c) => {
    const body = await c.req.json<Record<string, string>>()
    for (const [key, value] of Object.entries(body)) {
      storage.setConfig(key, typeof value === 'string' ? value : JSON.stringify(value))
    }
    return c.json({ success: true })
  })

  return app
}
