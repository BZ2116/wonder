import { callLLMStream } from '@/lib/llm/client'
import type { LLMConfig, Message } from '@/lib/llm/types'

export type AgentCaller = (
  config: LLMConfig,
  messages: Message[],
  onChunk?: (text: string) => void,
) => Promise<string>

export const defaultAgentCaller: AgentCaller = async (config, messages, onChunk) => {
  const response = await callLLMStream(config, messages, onChunk ?? (() => {}))
  return response.content
}

export abstract class BaseAgent<TInput, TOutput> {
  constructor(
    protected readonly config: LLMConfig,
    protected readonly caller: AgentCaller = defaultAgentCaller,
  ) {}

  protected call(systemPrompt: string, userPrompt: string, onChunk?: (text: string) => void): Promise<string> {
    return this.caller(
      this.config,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      onChunk,
    )
  }

  abstract run(input: TInput, onChunk?: (text: string) => void): Promise<TOutput>
}
