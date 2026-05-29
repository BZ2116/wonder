import { LiteratureParserAgent } from '@/lib/agents/literature'
import { ProjectRelationAgent } from '@/lib/agents/relation'
import { WritingAgent } from '@/lib/agents/writing'
import { TodoAgent } from '@/lib/agents/todo'
import { MatchingAgent } from '@/lib/agents/matching'
import type { AgentCaller } from '@/lib/agents/base'
import { chunkText, estimateTokens } from '@/lib/core/chunker'
import type { HistoryManager } from '@/lib/core/history'
import type { AppConfig } from '@/lib/llm/types'

export type AnalysisStep = 'reading' | 'relation' | 'writing' | 'todo' | 'matching' | 'saving' | 'done'

export interface AnalysisResult {
  fileName: string
  readingCard: string
  relationAnalysis: string
  writingMaterials: string
  todoList: string
  matching?: string
  fullReport: string
}

export interface RunSingleAnalysisInput {
  fileName: string
  documentText: string
  config: AppConfig
  history: HistoryManager
  caller?: AgentCaller
  onProgress?: (step: AnalysisStep) => void
  onChunk?: (step: AnalysisStep, text: string) => void
}

export async function runSingleAnalysis(input: RunSingleAnalysisInput): Promise<{
  recordId: string
  result: AnalysisResult
}> {
  const chunks = chunkText(input.documentText, input.config.analysis.maxChars, input.config.analysis.overlap)
  const tokenEstimate = estimateTokens(input.documentText)
  const emit = (step: AnalysisStep) => input.onProgress?.(step)
  const stream = (step: AnalysisStep) => (text: string) => input.onChunk?.(step, text)

  emit('reading')
  const literature = await new LiteratureParserAgent(input.config.model, input.caller).run(
    { textChunks: chunks },
    stream('reading'),
  )

  emit('relation')
  const relation = await new ProjectRelationAgent(input.config.model, input.caller).run(
    {
      readingCard: literature.readingCard,
      researchBackground: input.config.research.background,
    },
    stream('relation'),
  )

  emit('writing')
  const writing = await new WritingAgent(input.config.model, input.caller).run(
    {
      readingCard: literature.readingCard,
      relationAnalysis: relation.relationAnalysis,
      writingStyle: input.config.research.writingStyle,
    },
    stream('writing'),
  )

  emit('todo')
  const todo = await new TodoAgent(input.config.model, input.caller).run(
    {
      readingCard: literature.readingCard,
      relationAnalysis: relation.relationAnalysis,
    },
    stream('todo'),
  )

  let matching: string | undefined
  if (input.config.research.background) {
    emit('matching')
    const matchingResult = await new MatchingAgent(input.config.model, input.caller).run(
      {
        readingCard: literature.readingCard,
        researchBackground: input.config.research.background,
      },
      stream('matching'),
    )
    matching = matchingResult.matchingAnalysis
  }

  const fullReport = buildFullReport({
    fileName: input.fileName,
    model: input.config.model.modelName,
    tokenEstimate,
    textLength: input.documentText.length,
    readingCard: literature.readingCard,
    relationAnalysis: relation.relationAnalysis,
    writingMaterials: writing.writingMaterials,
    todoList: todo.todoList,
    matching,
  })

  emit('saving')
  const recordId = await input.history.saveRecord({
    fileName: input.fileName,
    model: input.config.model.modelName,
    summary: extractSummary(literature.readingCard),
    readingCard: literature.readingCard,
    relationAnalysis: relation.relationAnalysis,
    writingMaterials: writing.writingMaterials,
    todoList: todo.todoList,
    matching,
    fullReport,
  })

  emit('done')
  return {
    recordId,
    result: {
      fileName: input.fileName,
      readingCard: literature.readingCard,
      relationAnalysis: relation.relationAnalysis,
      writingMaterials: writing.writingMaterials,
      todoList: todo.todoList,
      matching,
      fullReport,
    },
  }
}

function buildFullReport(input: {
  fileName: string
  model: string
  tokenEstimate: number
  textLength: number
  readingCard: string
  relationAnalysis: string
  writingMaterials: string
  todoList: string
  matching?: string
}): string {
  return `# Wonder 分析报告

- File: ${input.fileName}
- Model: ${input.model}
- Time: ${new Date().toLocaleString()}
- Text Length: ${input.textLength} chars
- Token Estimate: ${input.tokenEstimate}

---

${input.readingCard}

---

${input.relationAnalysis}

---

${input.writingMaterials}

---

${input.todoList}
${input.matching ? `\n---\n\n${input.matching}` : ''}
`
}

function extractSummary(readingCard: string): string {
  return readingCard
    .split('\n')
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#'))
    ?.slice(0, 120) ?? 'No summary'
}
