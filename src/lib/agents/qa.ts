import { BaseAgent } from './base'

export interface QAInput {
  documentContext: string
  analysisReport: string
  question: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface QAOutput {
  answer: string
}

const SYSTEM_PROMPT = `
You are a research Q&A agent based on document context.
Requirements:
1. Prioritize answering based on uploaded materials and existing analysis.
2. If the answer is not in the materials, explicitly state "当前资料中未找到直接依据".
3. Do not fabricate paper results, experiment data, or citations.
4. Output in Chinese.
`

export class QAAgent extends BaseAgent<QAInput, QAOutput> {
  async run(input: QAInput, onChunk?: (text: string) => void): Promise<QAOutput> {
    const historyText = (input.conversationHistory ?? [])
      .slice(-6)
      .map(message => `${message.role}: ${message.content}`)
      .join('\n')
    const answer = await this.call(SYSTEM_PROMPT, `
Document excerpt:
${input.documentContext.slice(0, 10000)}

Existing analysis report:
${input.analysisReport}

Conversation history:
${historyText}

User question:
${input.question}

Answer the user's question. When necessary, indicate which type of information from the materials your answer is based on.
`, onChunk)
    return { answer }
  }
}
