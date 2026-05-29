import type { AppConfig } from '@/lib/llm/types'
import type { StorageAdapter } from './storage'

export const DEFAULT_CONFIG: AppConfig = {
  model: {
    provider: 'MiniMax',
    apiKey: '',
    baseUrl: 'https://api.minimaxi.com/v1',
    modelName: 'MiniMax-M2.7',
  },
  research: {
    background: 'I am a student interested in AI and research.',
    writingStyle: '本科毕业论文风格，表达清晰，避免过度复杂',
  },
  analysis: {
    maxChars: 7000,
    overlap: 500,
  },
  embedding: {
    provider: 'OpenAI',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    modelName: 'text-embedding-3-small',
    dimensions: 1536,
  },
  knowledge: {
    enabled: true,
    autoIndex: true,
    maxContextTokens: 8000,
  },
}

export class ConfigManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly path = 'config.json',
  ) {}

  async load(): Promise<AppConfig> {
    const raw = await this.storage.readText(this.path)
    if (!raw) {
      await this.save(DEFAULT_CONFIG)
      return structuredClone(DEFAULT_CONFIG)
    }
    const saved = JSON.parse(raw)
    return {
      ...structuredClone(DEFAULT_CONFIG),
      ...saved,
      model: { ...structuredClone(DEFAULT_CONFIG.model), ...saved.model },
      research: { ...structuredClone(DEFAULT_CONFIG.research), ...saved.research },
      analysis: { ...structuredClone(DEFAULT_CONFIG.analysis), ...saved.analysis },
      embedding: { ...structuredClone(DEFAULT_CONFIG.embedding!), ...saved.embedding },
      knowledge: { ...structuredClone(DEFAULT_CONFIG.knowledge!), ...saved.knowledge },
    } as AppConfig
  }

  async save(config: AppConfig): Promise<void> {
    await this.storage.writeText(this.path, JSON.stringify(config, null, 2))
  }
}
