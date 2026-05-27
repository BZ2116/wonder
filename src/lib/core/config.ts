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
    return { ...structuredClone(DEFAULT_CONFIG), ...JSON.parse(raw) } as AppConfig
  }

  async save(config: AppConfig): Promise<void> {
    await this.storage.writeText(this.path, JSON.stringify(config, null, 2))
  }
}
