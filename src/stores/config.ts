import { create } from 'zustand'
import { api } from '../services/api'
import type { NormalizedAppConfig } from '../types/config'
import type { AppConfig } from '../types/analysis'

interface ConfigState {
  config: NormalizedAppConfig | null
  loaded: boolean
  loadConfig: () => Promise<void>
  saveConfig: (config: NormalizedAppConfig) => Promise<void>
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: null,
  loaded: false,
  loadConfig: async () => {
    const data = await api.get<Record<string, string>>('/api/config')

    // Try normalized path first
    if (data.normalizedConfig) {
      try {
        const parsed = JSON.parse(data.normalizedConfig) as NormalizedAppConfig
        set({ config: parsed, loaded: true })
        return
      } catch {
        // fall through to legacy
      }
    }

    // Legacy fallback: build NormalizedAppConfig from flat appConfig + globalUserProfile/globalProfile
    const raw = data.appConfig
    const flat: AppConfig = raw ? JSON.parse(raw) : {}
    const globalProfile = data.globalProfile || data.globalUserProfile || flat.globalUserProfile || ''

    const normalized: NormalizedAppConfig = {
      chat: {
        provider: 'openai_compatible',
        preset: '',
        apiKey: flat.apiKey || '',
        baseUrl: flat.baseUrl || 'https://api.anthropic.com',
        model: flat.model || 'claude-sonnet-4-20250514',
        temperature: 0.2,
        maxTokens: 4096,
      },
      embedding: {
        provider: 'openai_compatible',
        preset: '',
        apiKey: flat.embeddingApiKey || '',
        baseUrl: flat.embeddingBaseUrl || 'https://api.openai.com/v1',
        model: flat.embeddingModel || 'text-embedding-3-small',
        dimensions: 1536,
      },
      knowledge: { enabled: true, autoIndex: true, contextTokenLimit: 8000 },
      research: { globalProfile },
      nickname: flat.nickname,
      avatar: flat.avatar,
    }

    set({ config: normalized, loaded: true })
  },
  saveConfig: async (config) => {
    await api.put('/api/config', { normalizedConfig: config })
    set({ config })
  },
}))
