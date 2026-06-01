import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { Hono } from 'hono'
import { StorageService } from '../../../server/services/storage'
import { configRoutes } from '../../../server/routes/config'
import fs from 'fs'
import path from 'path'

const TEST_DB = path.join(__dirname, 'test-config.db')

describe('configRoutes', () => {
  let db: Database.Database
  let storage: StorageService
  let app: Hono

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB)
    db = new Database(TEST_DB)
    const schema = fs.readFileSync(
      path.join(__dirname, '../../../server/db/schema.sql'), 'utf-8'
    )
    db.exec(schema)
    storage = new StorageService(db)
    app = new Hono()
    app.route('/api/config', configRoutes(storage))
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB)
  })

  it('GET returns normalized config from legacy appConfig', async () => {
    storage.setConfig('appConfig', JSON.stringify({
      provider: 'anthropic',
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-20250514',
    }))

    const res = await app.request('/api/config')
    const body = await res.json()

    expect(body.normalizedConfig).toBeDefined()
    const normalized = JSON.parse(body.normalizedConfig)
    expect(normalized.chat.provider).toBe('anthropic')
    expect(normalized.chat.apiKey).toBe('sk-test')
  })

  it('GET resolves globalProfile from globalUserProfile key', async () => {
    storage.setConfig('appConfig', JSON.stringify({}))
    storage.setConfig('globalUserProfile', 'I study AI')

    const res = await app.request('/api/config')
    const body = await res.json()
    const normalized = JSON.parse(body.normalizedConfig)

    expect(normalized.research.globalProfile).toBe('I study AI')
  })

  it('GET prefers globalProfile over globalUserProfile', async () => {
    storage.setConfig('appConfig', JSON.stringify({ globalUserProfile: 'old' }))
    storage.setConfig('globalProfile', 'new')

    const res = await app.request('/api/config')
    const body = await res.json()
    const normalized = JSON.parse(body.normalizedConfig)

    expect(normalized.research.globalProfile).toBe('new')
  })

  it('PUT stores normalized config and writes globalProfile key', async () => {
    const normalized = {
      chat: {
        provider: 'anthropic', preset: 'anthropic',
        apiKey: 'sk-new', baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-20250514', temperature: 0.2, maxTokens: 4096,
      },
      embedding: {
        provider: 'openai_compatible', preset: 'openai',
        apiKey: '', baseUrl: 'https://api.openai.com/v1',
        model: 'text-embedding-3-small', dimensions: 1536,
      },
      knowledge: { enabled: true, autoIndex: true, contextTokenLimit: 8000 },
      research: { globalProfile: 'New profile' },
    }

    const res = await app.request('/api/config', {
      method: 'PUT',
      body: JSON.stringify({ normalizedConfig: normalized }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect((await res.json()).success).toBe(true)
    expect(storage.getConfig('appConfig')).toBeDefined()
    expect(storage.getConfig('globalProfile')).toBe('New profile')
  })

  it('PUT still stores legacy string KV pairs', async () => {
    const res = await app.request('/api/config', {
      method: 'PUT',
      body: JSON.stringify({ someKey: 'someValue' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect((await res.json()).success).toBe(true)
    expect(storage.getConfig('someKey')).toBe('someValue')
  })

  it('GET returns empty defaults when no config exists', async () => {
    const res = await app.request('/api/config')
    const body = await res.json()

    expect(body.normalizedConfig).toBeDefined()
    const normalized = JSON.parse(body.normalizedConfig)
    expect(normalized.chat.provider).toBe('openai_compatible')
    expect(normalized.chat.apiKey).toBe('')
    expect(normalized.knowledge.enabled).toBe(true)
    expect(normalized.research.globalProfile).toBe('')
  })
})
