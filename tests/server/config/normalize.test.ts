import { describe, it, expect } from 'vitest'
import { normalizeConfig, denormalizeConfig } from '../../../server/config/normalize'

describe('normalizeConfig', () => {
  it('maps legacy flat appConfig to chat config', () => {
    const kv = {
      appConfig: JSON.stringify({
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        model: 'claude-sonnet-4-20250514',
      }),
    }
    const result = normalizeConfig(kv)
    expect(result.chat.provider).toBe('anthropic')
    expect(result.chat.apiKey).toBe('sk-ant-test')
    expect(result.chat.baseUrl).toBe('https://api.anthropic.com')
    expect(result.chat.model).toBe('claude-sonnet-4-20250514')
    expect(result.chat.temperature).toBe(0.2)
    expect(result.chat.maxTokens).toBe(4096)
  })

  it('maps globalUserProfile to research.globalProfile', () => {
    const kv = {
      appConfig: JSON.stringify({}),
      globalUserProfile: 'I am a researcher',
    }
    const result = normalizeConfig(kv)
    expect(result.research.globalProfile).toBe('I am a researcher')
  })

  it('maps globalProfile to research.globalProfile', () => {
    const kv = {
      appConfig: JSON.stringify({}),
      globalProfile: 'Existing profile',
    }
    const result = normalizeConfig(kv)
    expect(result.research.globalProfile).toBe('Existing profile')
  })

  it('prefers globalProfile over globalUserProfile when both exist', () => {
    const kv = {
      appConfig: JSON.stringify({ globalUserProfile: 'old' }),
      globalProfile: 'new',
    }
    const result = normalizeConfig(kv)
    expect(result.research.globalProfile).toBe('new')
  })

  it('provides embedding defaults when embedding config is missing', () => {
    const kv = {
      appConfig: JSON.stringify({ apiKey: 'sk-test', model: 'gpt-4o' }),
    }
    const result = normalizeConfig(kv)
    expect(result.embedding.provider).toBe('openai_compatible')
    expect(result.embedding.model).toBe('text-embedding-3-small')
    expect(result.embedding.dimensions).toBe(1536)
  })

  it('maps legacy embedding fields to embedding config', () => {
    const kv = {
      appConfig: JSON.stringify({
        embeddingProvider: 'MiniMax',
        embeddingBaseUrl: 'https://api.minimaxi.com/v1',
        embeddingApiKey: 'sk-mm',
        embeddingModel: 'text-embedding-003',
      }),
    }
    const result = normalizeConfig(kv)
    expect(result.embedding.provider).toBe('minimax')
    expect(result.embedding.apiKey).toBe('sk-mm')
    expect(result.embedding.model).toBe('text-embedding-003')
  })

  it('returns defaults when no config exists', () => {
    const kv = {}
    const result = normalizeConfig(kv)
    expect(result.chat.provider).toBe('openai_compatible')
    expect(result.chat.apiKey).toBe('')
    expect(result.embedding.provider).toBe('openai_compatible')
    expect(result.knowledge.enabled).toBe(true)
    expect(result.research.globalProfile).toBe('')
  })

  it('preserves nickname and avatar', () => {
    const kv = {
      appConfig: JSON.stringify({
        nickname: 'Alice',
        avatar: 'data:image/png;base64,abc',
      }),
    }
    const result = normalizeConfig(kv)
    expect(result.nickname).toBe('Alice')
    expect(result.avatar).toBe('data:image/png;base64,abc')
  })

  it('handles corrupt appConfig JSON gracefully', () => {
    const kv = {
      appConfig: 'not-valid-json{{{',
      globalProfile: 'fallback profile',
    }
    const result = normalizeConfig(kv)
    expect(result.chat.provider).toBe('openai_compatible')
    expect(result.research.globalProfile).toBe('fallback profile')
  })
})

describe('denormalizeConfig', () => {
  it('produces appConfig JSON and globalProfile key', () => {
    const normalized = {
      chat: {
        provider: 'anthropic' as const,
        preset: 'anthropic',
        apiKey: 'sk-test',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-20250514',
        temperature: 0.2,
        maxTokens: 4096,
      },
      embedding: {
        provider: 'openai_compatible' as const,
        preset: 'openai',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'text-embedding-3-small',
        dimensions: 1536,
      },
      knowledge: { enabled: true, autoIndex: true, contextTokenLimit: 8000 },
      research: { globalProfile: 'My profile' },
    }
    const result = denormalizeConfig(normalized)
    expect(result.globalProfile).toBe('My profile')
    const parsed = JSON.parse(result.appConfig)
    expect(parsed.chat.provider).toBe('anthropic')
    expect(parsed.research.globalProfile).toBe('My profile')
  })
})
