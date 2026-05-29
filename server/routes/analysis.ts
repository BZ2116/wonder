import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { StorageService } from '../services/storage'
import { LLMService } from '../services/llm'
import { randomUUID } from 'crypto'

export function analysisRoutes(storage: StorageService, llm: LLMService) {
  const app = new Hono()

  app.post('/single', async (c) => {
    const { fileName, fileType, text } = await c.req.json<{
      fileName: string; fileType: string; text: string
    }>()

    return streamSSE(c, async (stream) => {
      const docId = randomUUID()

      const steps = [
        { name: 'literature', label: '文献解析' },
        { name: 'relation', label: '关联分析' },
        { name: 'writing', label: '写作素材' },
        { name: 'todo', label: '待办提取' },
        { name: 'matching', label: '匹配评分' },
      ]

      for (const step of steps) {
        await stream.writeSSE({
          event: 'step',
          data: JSON.stringify({ step: step.name, status: 'running', label: step.label }),
        })

        // Actual agent integration comes later
        await stream.writeSSE({
          event: 'step',
          data: JSON.stringify({ step: step.name, status: 'done', label: step.label }),
        })
      }

      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({ documentId: docId }),
      })
    })
  })

  return app
}
