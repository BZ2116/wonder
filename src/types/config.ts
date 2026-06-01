export type ChatProvider = 'openai_compatible' | 'anthropic' | 'minimax' | 'custom_openai_compatible'
export type EmbeddingProvider = 'openai_compatible' | 'custom_openai_compatible' | 'minimax'

export interface ChatConfig {
  provider: ChatProvider
  preset: string
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
}

export interface EmbeddingConfig {
  provider: EmbeddingProvider
  preset: string
  apiKey: string
  baseUrl: string
  model: string
  dimensions: number
}

export interface KnowledgeConfig {
  enabled: boolean
  autoIndex: boolean
  contextTokenLimit: number
}

export interface ResearchConfig {
  globalProfile: string
}

export interface NormalizedAppConfig {
  chat: ChatConfig
  embedding: EmbeddingConfig
  knowledge: KnowledgeConfig
  research: ResearchConfig
  nickname?: string
  avatar?: string
}
