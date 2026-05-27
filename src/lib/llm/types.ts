export type ProviderName =
  | 'MiniMax'
  | 'GPT/OpenAI'
  | 'Claude/Anthropic'
  | 'DeepSeek'
  | 'MiMo/Xiaomi'
  | '自定义'

export interface LLMConfig {
  provider: ProviderName
  apiKey: string
  baseUrl: string
  modelName: string
}

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMUsage {
  prompt: number
  completion: number
}

export interface LLMResponse {
  content: string
  usage?: LLMUsage
}

export interface AppConfig {
  model: LLMConfig
  research: {
    background: string
    writingStyle: string
  }
  analysis: {
    maxChars: number
    overlap: number
  }
}
