import { LiteratureParserAgent } from '@/lib/agents/literature'
import { MatrixAgent } from '@/lib/agents/matrix'
import type { AgentCaller } from '@/lib/agents/base'
import { chunkText } from '@/lib/core/chunker'
import type { AppConfig } from '@/lib/llm/types'

export type BatchStep = 'parsing' | 'comparing' | 'done'

export interface BatchResult {
  files: Array<{ fileName: string; readingCard: string }>
  matrix: string
}

export interface RunBatchAnalysisInput {
  files: Array<{ fileName: string; text: string }>
  config: AppConfig
  caller?: AgentCaller
  onProgress?: (step: BatchStep, fileIndex?: number) => void
  onChunk?: (step: BatchStep, text: string) => void
}

export async function runBatchAnalysis(input: RunBatchAnalysisInput): Promise<BatchResult> {
  const readingCards: Array<{ fileName: string; readingCard: string }> = []

  // Phase 1: parse each file sequentially
  for (const [index, file] of input.files.entries()) {
    input.onProgress?.('parsing', index)
    const chunks = chunkText(file.text, input.config.analysis.maxChars, input.config.analysis.overlap)
    const agent = new LiteratureParserAgent(input.config.model, input.caller)
    const result = await agent.run({ textChunks: chunks }, text => {
      input.onChunk?.('parsing', `[${file.fileName} - 分块解析] ${text}`)
    })
    readingCards.push({ fileName: file.fileName, readingCard: result.readingCard })
  }

  // Phase 2: generate comparison matrix
  input.onProgress?.('comparing')
  const matrixAgent = new MatrixAgent(input.config.model, input.caller)
  const { matrix } = await matrixAgent.run(
    {
      readingCards,
      researchBackground: input.config.research.background,
    },
    text => {
      input.onChunk?.('comparing', text)
    },
  )

  input.onProgress?.('done')
  return { files: readingCards, matrix }
}
