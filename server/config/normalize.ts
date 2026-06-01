import type { NormalizedAppConfig, ChatProvider, EmbeddingProvider } from '../../src/types/config'

interface LegacyFlat {
  provider?: string
  baseUrl?: string
  apiKey?: string
  model?: string
  embeddingProvider?: string
  embeddingBaseUrl?: string
  embeddingApiKey?: string
  embeddingModel?: string
  nickname?: string
  avatar?: string
  globalUserProfile?: string
}

function mapChatProvider(raw: string | undefined): ChatProvider {
  if (!raw) return 'openai_compatible'
  const lower = raw.toLowerCase()
  if (lower === 'anthropic') return 'anthropic'
  if (lower === 'openai' || lower === 'openai_compatible') return 'openai_compatible'
  if (lower === 'minimax') return 'minimax'
  return 'custom_openai_compatible'
}

function mapEmbeddingProvider(raw: string | undefined): EmbeddingProvider {
  if (!raw) return 'openai_compatible'
  const lower = raw.toLowerCase()
  if (lower === 'openai' || lower === 'openai_compatible') return 'openai_compatible'
  if (lower === 'minimax') return 'minimax'
  return 'custom_openai_compatible'
}

function derivePreset(provider: string): string {
  const lower = provider.toLowerCase()
  if (lower === 'anthropic') return 'anthropic'
  if (lower === 'openai' || lower === 'openai_compatible') return 'openai'
  if (lower === 'minimax') return 'minimax'
  return ''
}

export function normalizeConfig(kvPairs: Record<string, string>): NormalizedAppConfig {
  let flat: LegacyFlat = {}
  if (kvPairs.appConfig) {
    try {
      flat = JSON.parse(kvPairs.appConfig)
    } catch {
      // corrupt JSON, use empty defaults
    }
  }

  // globalProfile resolution: kvPairs.globalProfile > kvPairs.globalUserProfile > flat.globalUserProfile > ''
  const globalProfile = kvPairs.globalProfile || kvPairs.globalUserProfile || flat.globalUserProfile || ''

  const chatProvider = mapChatProvider(flat.provider)
  const embeddingProvider = mapEmbeddingProvider(flat.embeddingProvider)

  return {
    chat: {
      provider: chatProvider,
      preset: derivePreset(chatProvider),
      apiKey: flat.apiKey || '',
      baseUrl: flat.baseUrl || 'https://api.anthropic.com',
      model: flat.model || 'claude-sonnet-4-20250514',
      temperature: 0.2,
      maxTokens: 4096,
    },
    embedding: {
      provider: embeddingProvider,
      preset: derivePreset(embeddingProvider),
      apiKey: flat.embeddingApiKey || '',
      baseUrl: flat.embeddingBaseUrl || 'https://api.openai.com/v1',
      model: flat.embeddingModel || 'text-embedding-3-small',
      dimensions: 1536,
    },
    knowledge: {
      enabled: true,
      autoIndex: true,
      contextTokenLimit: 8000,
    },
    research: {
      globalProfile,
    },
    nickname: flat.nickname,
    avatar: flat.avatar,
  }
}

export function denormalizeConfig(normalized: NormalizedAppConfig): Record<string, string> {
  return {
    appConfig: JSON.stringify(normalized),
    globalProfile: normalized.research.globalProfile,
  }
}
