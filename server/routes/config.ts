import { Hono } from 'hono'
import { StorageService } from '../services/storage'
import { normalizeConfig } from '../config/normalize'

export function configRoutes(storage: StorageService) {
  const app = new Hono()

  app.get('/', (c) => {
    const rawKv = storage.getAllConfig()
    const normalized = normalizeConfig(rawKv)
    return c.json({
      ...rawKv,
      normalizedConfig: JSON.stringify(normalized),
    })
  })

  app.put('/', async (c) => {
    const body = await c.req.json<Record<string, unknown>>()

    // Handle normalized config storage
    if (body.normalizedConfig) {
      const normalized = typeof body.normalizedConfig === 'string'
        ? body.normalizedConfig
        : JSON.stringify(body.normalizedConfig)
      storage.setConfig('appConfig', normalized)
      // Extract and store globalProfile as standalone key for qa/analysis routes
      try {
        const parsed = JSON.parse(normalized)
        if (parsed.research?.globalProfile) {
          storage.setConfig('globalProfile', parsed.research.globalProfile)
        }
      } catch { /* ignore parse errors */ }
    }

    // Continue handling legacy KV writes
    for (const [key, value] of Object.entries(body)) {
      if (key === 'normalizedConfig') continue
      storage.setConfig(key, typeof value === 'string' ? value : JSON.stringify(value))
    }

    return c.json({ success: true })
  })

  return app
}
