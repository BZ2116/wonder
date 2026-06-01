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
  if (lower === 'local' || lower === 'local_embedding') return 'local'
  return 'custom_openai_compatible'
}

function derivePreset(provider: string): string {
  const lower = provider.toLowerCase()
  if (lower === 'anthropic') return 'anthropic'
  if (lower === 'openai' || lower === 'openai_compatible') return 'openai'
  if (lower === 'minimax') return 'minimax'
  if (lower === 'local') return 'local'
  return ''
}

export function normalizeConfig(kvPairs: Record<string, string>): NormalizedAppConfig {
  const globalProfile = kvPairs.globalProfile || kvPairs.globalUserProfile || ''

  if (kvPairs.appConfig) {
    try {
      const parsed = JSON.parse(kvPairs.appConfig)
      // Already-normalized format (has nested chat/embedding objects)
      if (parsed.chat && typeof parsed.chat === 'object') {
        const storedProfile = parsed.research?.globalProfile || ''
        const storedBackground = parsed.research?.background || ''
        return {
          chat: {
            provider: parsed.chat.provider || 'openai_compatible',
            preset: parsed.chat.preset || '',
            apiKey: parsed.chat.apiKey || '',
            baseUrl: parsed.chat.baseUrl || 'https://api.anthropic.com',
            model: parsed.chat.model || 'claude-sonnet-4-20250514',
            temperature: parsed.chat.temperature ?? 0.2,
            maxTokens: parsed.chat.maxTokens ?? 4096,
          },
          embedding: {
            provider: parsed.embedding?.provider || 'openai_compatible',
            preset: parsed.embedding?.preset || '',
            apiKey: parsed.embedding?.apiKey || '',
            baseUrl: parsed.embedding?.baseUrl || 'https://api.openai.com/v1',
            model: parsed.embedding?.model || 'text-embedding-3-small',
            dimensions: parsed.embedding?.dimensions ?? 1536,
          },
          knowledge: parsed.knowledge || { enabled: true, autoIndex: true, contextTokenLimit: 8000 },
          research: { globalProfile: storedProfile || globalProfile, background: storedBackground },
          nickname: parsed.nickname,
          avatar: parsed.avatar,
        }
      }

      // Legacy flat format
      const flat: LegacyFlat = parsed
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
        knowledge: { enabled: true, autoIndex: true, contextTokenLimit: 8000 },
        research: { globalProfile: globalProfile || flat.globalUserProfile || '' },
        nickname: flat.nickname,
        avatar: flat.avatar,
      }
    } catch {
      // corrupt JSON, fall through to defaults
    }
  }

  return {
    chat: {
      provider: 'openai_compatible',
      preset: '',
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-20250514',
      temperature: 0.2,
      maxTokens: 4096,
    },
    embedding: {
      provider: 'openai_compatible',
      preset: '',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
      dimensions: 1536,
    },
    knowledge: { enabled: true, autoIndex: true, contextTokenLimit: 8000 },
    research: { globalProfile },
    nickname: undefined,
    avatar: undefined,
  }
}

export function denormalizeConfig(normalized: NormalizedAppConfig): Record<string, string> {
  return {
    appConfig: JSON.stringify(normalized),
    globalProfile: normalized.research.globalProfile,
  }
}
