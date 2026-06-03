import { Hono } from 'hono'
import { randomUUID } from 'crypto'
import { StorageService } from '../services/storage'

export function batchRoutes(storage: StorageService) {
  const app = new Hono()

  // Create a batch run with items
  app.post('/runs', async (c) => {
    const body = await c.req.json<{
      name: string
      files: Array<{ fileName: string; fileType?: string }>
      knowledgeBaseId?: string
    }>()

    if (!body.name) return c.json({ error: '批次名称不能为空' }, 400)
    if (!body.files || body.files.length === 0) return c.json({ error: '文件列表不能为空' }, 400)

    const runId = randomUUID()
    storage.createBatchRun({
      id: runId,
      name: body.name,
      knowledge_base_id: body.knowledgeBaseId,
    })

    const itemIds = body.files.map((f) => {
      const itemId = randomUUID()
      storage.createBatchItem({
        id: itemId,
        batch_run_id: runId,
        file_name: f.fileName,
        file_type: f.fileType,
      })
      return itemId
    })

    const allItems = storage.getBatchItemsByRunId(runId)
    const items = itemIds.map(id => allItems.find(i => i.id === id)!)

    return c.json({ id: runId, name: body.name, items })
  })

  // List all batch runs
  app.get('/runs', (c) => {
    return c.json(storage.getBatchRuns())
  })

  // Get single batch run with items
  app.get('/runs/:id', (c) => {
    const id = c.req.param('id')
    const run = storage.getBatchRun(id)
    if (!run) return c.json({ error: '批次不存在' }, 404)
    const items = storage.getBatchItemsByRunId(id)
    return c.json({ ...run, items })
  })

  // Update batch run status
  app.patch('/runs/:id', async (c) => {
    const id = c.req.param('id')
    const run = storage.getBatchRun(id)
    if (!run) return c.json({ error: '批次不存在' }, 404)

    const body = await c.req.json<{ status?: string }>()
    if (!body.status) return c.json({ error: '状态不能为空' }, 400)

    const completed_at = (body.status === 'done' || body.status === 'error')
      ? new Date().toISOString()
      : undefined
    storage.updateBatchRunStatus(id, body.status, completed_at)

    return c.json(storage.getBatchRun(id))
  })

  // Update batch item status
  app.patch('/runs/:id/items/:itemId', async (c) => {
    const itemId = c.req.param('itemId')
    const items = storage.getBatchItemsByRunId(c.req.param('id'))
    const item = items.find(i => i.id === itemId)
    if (!item) return c.json({ error: '批次项不存在' }, 404)

    const body = await c.req.json<{
      status?: string
      documentId?: string
      historyId?: string
      error?: string
    }>()

    const completed_at = (body.status === 'done' || body.status === 'error')
      ? new Date().toISOString()
      : undefined

    storage.updateBatchItemStatus(itemId, {
      status: body.status,
      document_id: body.documentId,
      history_id: body.historyId,
      error: body.error,
      completed_at,
    })

    const updated = storage.getBatchItemsByRunId(c.req.param('id')).find(i => i.id === itemId)!
    return c.json(updated)
  })

  return app
}
