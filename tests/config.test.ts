import { describe, expect, it } from 'vitest'
import { ConfigManager, DEFAULT_CONFIG } from '@/lib/core/config'
import { MemoryStorageAdapter } from '@/lib/core/storage'

describe('ConfigManager', () => {
  it('creates default config when no file exists', async () => {
    const storage = new MemoryStorageAdapter()
    const manager = new ConfigManager(storage)

    const config = await manager.load()

    expect(config.model.provider).toBe(DEFAULT_CONFIG.model.provider)
    expect(config.analysis.maxChars).toBe(7000)
  })

  it('persists updated config', async () => {
    const storage = new MemoryStorageAdapter()
    const manager = new ConfigManager(storage)

    const config = await manager.load()
    config.model.provider = 'DeepSeek'
    config.model.baseUrl = 'https://api.deepseek.com/v1'
    await manager.save(config)

    const reloaded = await manager.load()
    expect(reloaded.model.provider).toBe('DeepSeek')
    expect(reloaded.model.baseUrl).toBe('https://api.deepseek.com/v1')
  })
})
