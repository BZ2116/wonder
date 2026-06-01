import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { StorageService } from '../services/storage'
import { PythonBackendClient } from '../services/python-backend'
import { randomUUID } from 'crypto'

interface PythonGatewayResponse {
  doc_id: string
  file_name: string
  status: 'ok' | 'partial'
  failed_agents: string[]
  reading_card: string
  relation_analysis: string
  writing_materials: string
  todo_list: string
  summary: string
  tags: string[]
  fit_score?: number
  placement?: string
  recommended_action?: string
  readme_suggestions: Array<{ section: string; suggestion: string; reason?: string }>
  source_chunks: string[]
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
      let cancelled = false
      stream.onAbort(() => { cancelled = true })

      try {
        // Step 1: 文献解析
        await stream.writeSSE({
          event: 'step',
          data: JSON.stringify({ step: 'literature', status: 'done', label: '文献解析', progress: 0 }),
        })

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

        // Step 2: 关联分析 (forward to Python)
        if (cancelled) return
        await stream.writeSSE({
          event: 'step',
          data: JSON.stringify({ step: 'relation', status: 'running', label: '关联分析', progress: 0 }),
        })

        const truncatedText = text.length > 50000 ? text.slice(0, 50000) + '\n\n[文本已截断]' : text

        const result = await python.post<PythonGatewayResponse>('/api/analysis/gateway', {
          doc_id: docId,
          file_name: fileName,
          file_type: fileType,
          text: truncatedText,
          knowledge_base_id: knowledgeBaseId,
          knowledge_base_readme: kbContext,
          global_profile: globalProfile,
          max_chars: 7000,
          overlap: 500,
        })

        if (cancelled) {
          await stream.writeSSE({
            event: 'cancel',
            data: JSON.stringify({ message: '分析已取消' }),
          })
          return
        }

        // Mark remaining steps done
        await stream.writeSSE({
          event: 'step',
          data: JSON.stringify({ step: 'relation', status: 'done', label: '关联分析', progress: 0 }),
        })
        await stream.writeSSE({
          event: 'step',
          data: JSON.stringify({ step: 'writing', status: 'done', label: '写作素材', progress: 0 }),
        })
        await stream.writeSSE({
          event: 'step',
          data: JSON.stringify({ step: 'todo', status: 'done', label: '待办提取', progress: 0 }),
        })

        // Step 3: 存储
        if (cancelled) return
        await stream.writeSSE({
          event: 'step',
          data: JSON.stringify({ step: 'store', status: 'running', label: '保存结果', progress: 0 }),
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
          summary: result.summary || safeStr(result.reading_card?.split('\n')[0]),
          readingCard: result.reading_card,
          relationAnalysis: result.relation_analysis,
          writingMaterials: result.writing_materials,
          todoList: result.todo_list,
          tags: Array.isArray(result.tags) ? result.tags.join(',') : undefined,
          matchScore: result.fit_score,
        })

        // Link to KB if selected
        if (knowledgeBaseId) {
          storage.addDocumentToKB({
            documentId: docId,
            knowledgeBaseId,
            subDirection: result.placement,
            tags: Array.isArray(result.tags) ? result.tags.join(',') : undefined,
            fitScore: result.fit_score,
            recommendedAction: result.recommended_action,
          })

          // Save README suggestions
          if (Array.isArray(result.readme_suggestions)) {
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
        }

        // Save history
        const historyId = randomUUID()
        storage.addHistory({ id: historyId, documentId: docId, result: JSON.stringify(result) })

        await stream.writeSSE({
          event: 'step',
          data: JSON.stringify({ step: 'store', status: 'done', label: '保存结果', progress: 0 }),
        })

        // Complete
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({ documentId: docId, knowledgeBaseId: knowledgeBaseId || null, historyId }),
        })
      } catch (err) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
        })
      }
    })
  })

  return app
}
