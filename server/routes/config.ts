import { Hono } from 'hono'
import fs from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'
import { StorageService } from '../services/storage'
import { normalizeConfig } from '../config/normalize'

const dataDir = process.env.DATA_DIR || path.join(cwd(), 'data')
const pythonConfigPath = path.join(dataDir, 'config.json')

/**
 * Write normalized config to data/config.json so Python backend can read it.
 * Python backend's ConfigManager reads from this file for health checks etc.
 */
function syncConfigToPython(normalized: Record<string, unknown>) {
  let existing: Record<string, unknown> = {}
  try {
    existing = JSON.parse(fs.readFileSync(pythonConfigPath, 'utf-8'))
  } catch { /* file may not exist yet */ }

  const chat = normalized.chat as Record<string, unknown> | undefined
  const embedding = normalized.embedding as Record<string, unknown> | undefined

  if (chat) {
    const chatProvider = chat.provider === 'anthropic' || String(chat.baseUrl).includes('/anthropic')
      ? 'Anthropic'
      : chat.provider === 'minimax' ? 'MiniMax' : 'OpenAI'
    existing.model = {
      provider: chatProvider,
      api_key: chat.apiKey,
      base_url: chat.baseUrl,
      model_name: chat.model,
    }
  }
  if (embedding) {
    let pythonProvider = 'OpenAI'
    if (embedding.provider === 'minimax') pythonProvider = 'MiniMax'
    else if (embedding.provider === 'local') pythonProvider = 'local'

    existing.embedding = {
      provider: pythonProvider,
      api_key: embedding.apiKey || '',
      base_url: embedding.baseUrl || '',
      model_name: embedding.model,
      dimensions: embedding.dimensions,
    }
  }
  existing.normalized_config = normalized

  fs.writeFileSync(pythonConfigPath, JSON.stringify(existing, null, 2), 'utf-8')
}

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
    if (!body.normalizedConfig && Object.keys(body).length === 0) {
      return c.json({ error: 'Request body is required' }, 400)
    }
    let syncWarning: string | undefined

    // Handle normalized config storage
    if (body.normalizedConfig) {
      const normalized = typeof body.normalizedConfig === 'string'
        ? body.normalizedConfig
        : JSON.stringify(body.normalizedConfig)
      storage.setConfig('appConfig', normalized)
      // Sync to Python backend's config.json
      try {
        const parsed = typeof body.normalizedConfig === 'string'
          ? JSON.parse(body.normalizedConfig)
          : body.normalizedConfig
        syncConfigToPython(parsed as Record<string, unknown>)
      } catch (err) {
        syncWarning = err instanceof Error ? err.message : String(err)
      }
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

    return c.json(syncWarning ? { success: true, syncWarning } : { success: true })
  })

  return app
}
