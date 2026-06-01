import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the api module before importing the store
vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

import { useConfigStore } from '../config'
import { api } from '../../services/api'

const mockApi = vi.mocked(api)

function resetStore() {
  useConfigStore.setState({ config: null, loaded: false })
}

describe('useConfigStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  describe('loadConfig', () => {
    it('loads normalized config when normalizedConfig is present', async () => {
      const normalized = {
        chat: {
          provider: 'anthropic',
          preset: 'anthropic',
          apiKey: 'sk-ant-test',
          baseUrl: 'https://api.anthropic.com',
          model: 'claude-sonnet-4-20250514',
          temperature: 0.2,
          maxTokens: 4096,
        },
        embedding: {
          provider: 'openai_compatible',
          preset: 'openai',
          apiKey: 'sk-test',
          baseUrl: 'https://api.openai.com/v1',
          model: 'text-embedding-3-small',
          dimensions: 1536,
        },
        knowledge: { enabled: true, autoIndex: true, contextTokenLimit: 8000 },
        research: { globalProfile: 'Student' },
      }

      mockApi.get.mockResolvedValue({
        normalizedConfig: JSON.stringify(normalized),
      })

      await useConfigStore.getState().loadConfig()

      const state = useConfigStore.getState()
      expect(state.loaded).toBe(true)
      expect(state.config?.chat.provider).toBe('anthropic')
      expect(state.config?.chat.model).toBe('claude-sonnet-4-20250514')
      expect(state.config?.embedding.provider).toBe('openai_compatible')
      expect(state.config?.research.globalProfile).toBe('Student')
    })

    it('falls back to legacy flat config when normalizedConfig is absent', async () => {
      mockApi.get.mockResolvedValue({
        appConfig: JSON.stringify({
          apiKey: 'sk-legacy',
          baseUrl: 'https://api.anthropic.com',
          model: 'claude-3-opus',
          embeddingApiKey: 'sk-emb',
          embeddingBaseUrl: 'https://api.openai.com/v1',
          embeddingModel: 'text-embedding-3-large',
          nickname: 'Alice',
        }),
        globalUserProfile: 'Researcher',
      })

      await useConfigStore.getState().loadConfig()

      const state = useConfigStore.getState()
      expect(state.loaded).toBe(true)
      expect(state.config?.chat.apiKey).toBe('sk-legacy')
      expect(state.config?.chat.model).toBe('claude-3-opus')
      expect(state.config?.embedding.apiKey).toBe('sk-emb')
      expect(state.config?.embedding.model).toBe('text-embedding-3-large')
      expect(state.config?.research.globalProfile).toBe('Researcher')
      expect(state.config?.nickname).toBe('Alice')
    })

    it('uses defaults when config is empty', async () => {
      mockApi.get.mockResolvedValue({})

      await useConfigStore.getState().loadConfig()

      const state = useConfigStore.getState()
      expect(state.loaded).toBe(true)
      expect(state.config?.chat.provider).toBe('openai_compatible')
      expect(state.config?.chat.model).toBe('claude-sonnet-4-20250514')
      expect(state.config?.embedding.model).toBe('text-embedding-3-small')
    })
  })

  describe('saveConfig', () => {
    it('saves normalized config via PUT /api/config', async () => {
      mockApi.put.mockResolvedValue(undefined)

      const config = {
        chat: {
          provider: 'anthropic' as const,
          preset: 'anthropic',
          apiKey: 'sk-ant',
          baseUrl: 'https://api.anthropic.com',
          model: 'claude-sonnet-4-20250514',
          temperature: 0.2,
          maxTokens: 4096,
        },
        embedding: {
          provider: 'openai_compatible' as const,
          preset: 'openai',
          apiKey: 'sk-emb',
          baseUrl: 'https://api.openai.com/v1',
          model: 'text-embedding-3-small',
          dimensions: 1536,
        },
        knowledge: { enabled: true, autoIndex: true, contextTokenLimit: 8000 },
        research: { globalProfile: '' },
      }

      await useConfigStore.getState().saveConfig(config)

      expect(mockApi.put).toHaveBeenCalledWith('/api/config', { normalizedConfig: config })
      expect(useConfigStore.getState().config).toEqual(config)
    })

    it('updates store state after save', async () => {
      mockApi.put.mockResolvedValue(undefined)

      const config = {
        chat: {
          provider: 'openai_compatible' as const,
          preset: 'deepseek',
          apiKey: 'sk-ds',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
          temperature: 0.3,
          maxTokens: 8192,
        },
        embedding: {
          provider: 'openai_compatible' as const,
          preset: 'openai',
          apiKey: 'sk-emb',
          baseUrl: 'https://api.openai.com/v1',
          model: 'text-embedding-3-small',
          dimensions: 1536,
        },
        knowledge: { enabled: true, autoIndex: true, contextTokenLimit: 8000 },
        research: { globalProfile: '' },
      }

      await useConfigStore.getState().saveConfig(config)

      const state = useConfigStore.getState()
      expect(state.config?.chat.provider).toBe('openai_compatible')
      expect(state.config?.chat.model).toBe('deepseek-chat')
    })
  })
})
