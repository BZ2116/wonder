import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { StorageService } from '../services/storage'
import { PythonBackendClient } from '../services/python-backend'
import { randomUUID } from 'crypto'

function extractTopicSummary(readingCard: string, maxLen = 500): string {
  if (!readingCard) return ''
  // Try "## 1. Topic Summary" or similar
  const match = readingCard.match(/##\s*(?:\d+[.)、]\s*)?Topic\s*Summary\s*\n([\s\S]*?)(?=\n##\s|\Z)/i)
  if (match?.[1]?.trim()) return match[1].trim().slice(0, maxLen)
  // Try Chinese heading
  const match2 = readingCard.match(/##\s*(?:\d+[.)、]\s*)?(?:主题摘要|摘要|概要)\s*\n([\s\S]*?)(?=\n##\s|\Z)/)
  if (match2?.[1]?.trim()) return match2[1].trim().slice(0, maxLen)
  // Fallback: first non-heading line
  for (const line of readingCard.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) return trimmed.slice(0, maxLen)
  }
  return ''
}

interface PythonGatewayResponse {
  doc_id: string
  file_name: string
  paper_title?: string
  status: 'ok' | 'partial'
  failed_agents: string[]
  reading_card: string
  relation_analysis: string
  writing_materials: string
  todo_list: string
  summary: string
  tags: string[]
  fit_score?: number
  fit_reason?: string
  relation_type?: string
  placement?: string
  recommended_action?: string
  readme_suggestions: Array<{ section: string; suggestion: string; reason?: string }>
  source_chunks: string[]
  suggested_placement?: { sub_direction: string; tags: string[] }
  novelty_for_kb?: string
  writing_assets?: {
    usable_claims: string[]
    method_references: string[]
    theory_references: string[]
    possible_literature_review_use: string
    limitations_or_critique: string
  }
}

export function analysisRoutes(storage: StorageService, python: PythonBackendClient) {
  const app = new Hono()

  app.post('/single', async (c) => {
    const body = await c.req.json<{
      fileName: string
      fileType: string
      text: string
      knowledgeBaseId?: string
    }>()

    const { fileName, fileType, text, knowledgeBaseId } = body
    if (!text) return c.json({ error: '文本内容不能为空' }, 400)

    return streamSSE(c, async (stream) => {
      const docId = randomUUID()
      const abortController = new AbortController()
      stream.onAbort(() => { abortController.abort() })

      try {
        // Load KB context
        let kbContext = ''
        if (knowledgeBaseId) {
          const kb = storage.getKnowledgeBase(knowledgeBaseId)
          if (kb) {
            kbContext = `知识库名称：${kb.name}\n`
            if (kb.description) kbContext += `描述：${kb.description}\n`
            if (kb.readme) kbContext += `README：\n${kb.readme}\n`
            const existingDocs = storage.getDocumentsByKB(knowledgeBaseId)
            if (existingDocs.length > 0) {
              kbContext += `\n知识库中已有 ${existingDocs.length} 篇文献，摘要如下：\n`
              for (const doc of existingDocs.slice(0, 10)) {
                kbContext += `- ${doc.file_name}: ${doc.summary || '无摘要'}\n`
              }
            }
          }
        }

        const globalProfile = storage.getConfig('globalProfile') || ''

        // Load chat config to pass to Python backend
        let chatConfig: Record<string, unknown> | undefined
        try {
          const raw = storage.getConfig('appConfig')
          if (raw) {
            const parsed = JSON.parse(raw)
            chatConfig = parsed.chat || undefined
          }
        } catch { /* ignore */ }

        // Step 2+: Forward Python SSE events
        const truncatedText = text.length > 50000 ? text.slice(0, 50000) + '\n\n[文本已截断]' : text

        const stepLabels: Record<string, string> = {
          literature: '文献解析',
          relation: '关联分析',
          writing: '写作素材',
          todo: '待办提取',
        }
        let result: PythonGatewayResponse | null = null

        for await (const sse of python.postSSE('/api/analysis/gateway', {
          doc_id: docId,
          file_name: fileName,
          file_type: fileType,
          text: truncatedText,
          knowledge_base_id: knowledgeBaseId,
          knowledge_base_readme: kbContext,
          global_profile: knowledgeBaseId ? '' : globalProfile,
          max_chars: 7000,
          overlap: 500,
          chat_config: chatConfig,
        }, abortController.signal)) {
          if (sse.event === 'agent_start') {
            const { step } = JSON.parse(sse.data) as { step: string }
            await stream.writeSSE({
              event: 'step',
              data: JSON.stringify({ step, status: 'running', label: stepLabels[step] || step }),
            })
          } else if (sse.event === 'progress') {
            const { step, chunkCount, total } = JSON.parse(sse.data) as { step: string; chunkCount: number; total: number }
            await stream.writeSSE({
              event: 'progress',
              data: JSON.stringify({ step, chunkCount, total }),
            })
          } else if (sse.event === 'agent_done') {
            const { step } = JSON.parse(sse.data) as { step: string }
            await stream.writeSSE({
              event: 'step',
              data: JSON.stringify({ step, status: 'done', label: stepLabels[step] || step }),
            })
          } else if (sse.event === 'complete') {
            result = JSON.parse(sse.data) as PythonGatewayResponse
          } else if (sse.event === 'error') {
            const errData = JSON.parse(sse.data) as { error: string }
            throw new Error(errData.error)
          }
        }

        if (!result) {
          throw new Error('Python backend did not return analysis result')
        }

        // Step 3: 存储
        await stream.writeSSE({
          event: 'step',
          data: JSON.stringify({ step: 'store', status: 'running', label: '保存结果' }),
        })

        const safeStr = (v: unknown): string | undefined => {
          if (v == null) return undefined
          if (typeof v === 'string') return v
          return JSON.stringify(v)
        }

        storage.upsertDocument({
          id: docId,
          fileName,
          fileType,
          summary: extractTopicSummary(result.reading_card || '') || result.summary || result.file_name,
          readingCard: result.reading_card,
          relationAnalysis: result.relation_analysis,
          writingMaterials: result.writing_materials,
          todoList: result.todo_list,
          tags: Array.isArray(result.tags) ? result.tags.join(',') : undefined,
          matchScore: result.fit_score,
        })

        // Store source chunks for later vector indexing (used by "收录" button)
        if (Array.isArray(result.source_chunks)) {
          for (let i = 0; i < result.source_chunks.length; i++) {
            storage.insertChunk({
              id: randomUUID(),
              documentId: docId,
              content: result.source_chunks[i],
              chunkIndex: i,
            })
          }
        }

        // Save README suggestions (KB context is used for analysis, but document is NOT auto-added to KB)
        if (knowledgeBaseId && Array.isArray(result.readme_suggestions)) {
          for (const sug of result.readme_suggestions) {
            storage.addReadmeSuggestion({
              id: randomUUID(),
              knowledgeBaseId,
              documentId: docId,
              section: sug.section,
              suggestion: sug.suggestion,
              reason: sug.reason,
            })
          }
        }

        // Save history (dual snake_case + camelCase for backward compat)
        const historyId = randomUUID()
        const summaryText = extractTopicSummary(result.reading_card || '') || result.summary || result.file_name
        const historyResult: Record<string, unknown> = {
          summary: summaryText,
          paper_title: result.paper_title || undefined,
          paperTitle: result.paper_title || undefined,
          reading_card: result.reading_card,
          readingCard: result.reading_card,
          fit_score: result.fit_score,
          knowledgeBaseFitScore: result.fit_score,
          fit_reason: result.fit_reason,
          fitReason: result.fit_reason,
          relation_type: result.relation_type,
          relation_analysis: result.relation_analysis,
          writing_materials: result.writing_materials,
          todo_list: result.todo_list,
          recommended_action: result.recommended_action,
          recommendedAction: result.recommended_action,
          tags: result.tags,
          suggested_placement: result.suggested_placement,
          suggestedPlacement: result.suggested_placement
            ? { subDirection: result.suggested_placement.sub_direction, tags: result.suggested_placement.tags }
            : undefined,
          novelty_for_kb: result.novelty_for_kb,
          noveltyForKnowledgeBase: result.novelty_for_kb || undefined,
          readme_suggestions: result.readme_suggestions,
          readmeUpdateSuggestions: result.readme_suggestions?.length ? result.readme_suggestions : undefined,
          writing_assets: result.writing_assets,
          writingAssets: result.writing_assets?.usable_claims?.length ? {
            usableClaims: result.writing_assets.usable_claims,
            methodReferences: result.writing_assets.method_references,
            theoryReferences: result.writing_assets.theory_references,
            possibleLiteratureReviewUse: result.writing_assets.possible_literature_review_use,
            limitationsOrCritique: result.writing_assets.limitations_or_critique,
          } : undefined,
          knowledgeBaseId: knowledgeBaseId || null,
          fileName: fileName,
        }
        storage.addHistory({ id: historyId, documentId: docId, result: JSON.stringify(historyResult) })

        await stream.writeSSE({
          event: 'step',
          data: JSON.stringify({ step: 'store', status: 'done', label: '保存结果' }),
        })

        // Complete — include full analysis result so frontend can display immediately
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({
            documentId: docId,
            knowledgeBaseId: knowledgeBaseId || null,
            historyId,
            result: {
              summary: extractTopicSummary(result.reading_card || '') || result.summary || result.file_name,
              paperTitle: result.paper_title || undefined,
              readingCard: result.reading_card,
              knowledgeBaseFitScore: result.fit_score,
              fitReason: result.fit_reason,
              relationType: result.relation_type,
              relationAnalysis: result.relation_analysis,
              writingMaterials: result.writing_materials,
              todoList: result.todo_list,
              recommendedAction: result.recommended_action,
              tags: result.tags,
              suggestedPlacement: result.suggested_placement
                ? { subDirection: result.suggested_placement.sub_direction, tags: result.suggested_placement.tags }
                : undefined,
              noveltyForKnowledgeBase: result.novelty_for_kb || undefined,
              readmeUpdateSuggestions: result.readme_suggestions?.length ? result.readme_suggestions : undefined,
              writingAssets: result.writing_assets?.usable_claims?.length ? {
                usableClaims: result.writing_assets.usable_claims,
                methodReferences: result.writing_assets.method_references,
                theoryReferences: result.writing_assets.theory_references,
                possibleLiteratureReviewUse: result.writing_assets.possible_literature_review_use,
                limitationsOrCritique: result.writing_assets.limitations_or_critique,
              } : undefined,
            },
          }),
        })
      } catch (err) {
        if (abortController.signal.aborted) {
          await stream.writeSSE({
            event: 'cancel',
            data: JSON.stringify({ message: '分析已取消' }),
          })
        } else {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          })
        }
      }
    })
  })

  return app
}
