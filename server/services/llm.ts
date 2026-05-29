import { StorageService } from './storage'

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export class LLMService {
  private storage: StorageService

  constructor(storage: StorageService) {
    this.storage = storage
  }

  private getApiKey(): string {
    const key = this.storage.getConfig('llm_api_key')
    if (!key) throw new Error('LLM API key not configured')
    return key
  }

  private getBaseUrl(): string {
    return this.storage.getConfig('llm_base_url') || 'https://api.openai.com/v1'
  }

  private getModel(): string {
    return this.storage.getConfig('llm_model') || 'gpt-4o-mini'
  }

  async call(messages: LLMMessage[], systemPrompt?: string): Promise<string> {
    const apiKey = this.getApiKey()
    const baseUrl = this.getBaseUrl()
    const model = this.getModel()

    const fullMessages: LLMMessage[] = []
    if (systemPrompt) fullMessages.push({ role: 'system', content: systemPrompt })
    fullMessages.push(...messages)

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: fullMessages }),
    })

    if (!resp.ok) {
      throw new Error(`LLM API error: ${resp.status} ${await resp.text()}`)
    }

    const data = await resp.json() as { choices: { message: { content: string } }[] }
    return data.choices[0]?.message?.content ?? ''
  }

  async *callStream(messages: LLMMessage[], systemPrompt?: string): AsyncGenerator<string> {
    const apiKey = this.getApiKey()
    const baseUrl = this.getBaseUrl()
    const model = this.getModel()

    const fullMessages: LLMMessage[] = []
    if (systemPrompt) fullMessages.push({ role: 'system', content: systemPrompt })
    fullMessages.push(...messages)

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: fullMessages, stream: true }),
    })

    if (!resp.ok) {
      throw new Error(`LLM API error: ${resp.status} ${await resp.text()}`)
    }

    const reader = resp.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') return
        try {
          const parsed = JSON.parse(data) as { choices: { delta: { content?: string } }[] }
          const content = parsed.choices[0]?.delta?.content
          if (content) yield content
        } catch {
          // skip malformed JSON lines
        }
      }
    }
  }
}
