import { Hono } from 'hono'
import { StorageService } from '../services/storage'
import { PythonBackendClient } from '../services/python-backend'
import { randomUUID } from 'crypto'

const DEFAULT_README = `# 知识库 README

## 主题

## 收录范围

## 排除范围

## 核心关键词

## 子方向

## 当前问题

## 阅读与分析偏好
`

export function knowledgeBaseRoutes(storage: StorageService, python: PythonBackendClient) {
  const app = new Hono()

  // List all knowledge bases
  app.get('/', (c) => {
    const kbs = storage.listKnowledgeBases()
    const enriched = kbs.map(kb => ({
      ...kb,
      documentCount: storage.getDocumentKBCount(kb.id),
      tags: storage.getKBTags(kb.id),
      pendingSuggestionCount: storage.getPendingSuggestionCount(kb.id),
    }))
    return c.json(enriched)
  })

  // Create knowledge base
  app.post('/', async (c) => {
    const body = await c.req.json<{ name: string; description?: string; readme?: string }>()
    if (!body.name) return c.json({ error: '名称不能为空' }, 400)
    const id = randomUUID()
    storage.createKnowledgeBase({
      id,
      name: body.name,
      description: body.description,
      readme: body.readme ?? DEFAULT_README,
    })
    const kb = storage.getKnowledgeBase(id)
    return c.json(kb, 201)
  })

  // Get single knowledge base
  app.get('/:id', (c) => {
    const kb = storage.getKnowledgeBase(c.req.param('id'))
    if (!kb) return c.json({ error: '知识库不存在' }, 404)
    return c.json({
      ...kb,
      documentCount: storage.getDocumentKBCount(kb.id),
      tags: storage.getKBTags(kb.id),
      pendingSuggestionCount: storage.getPendingSuggestionCount(kb.id),
    })
  })

  // Update knowledge base
  app.patch('/:id', async (c) => {
    const id = c.req.param('id')
    const kb = storage.getKnowledgeBase(id)
    if (!kb) return c.json({ error: '知识库不存在' }, 404)
    const body = await c.req.json<{ name?: string; description?: string; readme?: string }>()
    storage.updateKnowledgeBase(id, body)
    return c.json(storage.getKnowledgeBase(id))
  })

  // Delete knowledge base
  app.delete('/:id', (c) => {
    const id = c.req.param('id')
    storage.deleteKnowledgeBase(id)
    return c.json({ success: true })
  })

  // Get documents in a knowledge base
  app.get('/:id/documents', (c) => {
    const docs = storage.getDocumentsByKB(c.req.param('id'))
    return c.json(docs)
  })

  // Add document to knowledge base
  app.post('/:id/documents', async (c) => {
    const kbId = c.req.param('id')
    const body = await c.req.json<{ documentId: string; subDirection?: string; tags?: string; fitScore?: number; recommendedAction?: string }>()
    if (!body.documentId) return c.json({ error: '文档 ID 不能为空' }, 400)
    storage.addDocumentToKB({
      documentId: body.documentId,
      knowledgeBaseId: kbId,
      subDirection: body.subDirection,
      tags: body.tags,
      fitScore: body.fitScore,
      recommendedAction: body.recommendedAction,
    })

    // Trigger vector indexing in background
    const docId = body.documentId
    const doc = storage.getDocument(docId)
    if (doc) {
      const chunks = storage.getChunksByDocument(docId)
      const chunkTexts = chunks.map(ch => ch.content)
      storage.updateDocumentLifecycle(docId, 'indexing')
      let embeddingConfig: Record<string, unknown> | undefined
      try {
        const raw = storage.getConfig('appConfig')
        if (raw) embeddingConfig = JSON.parse(raw).embedding || undefined
      } catch { /* ignore */ }
      python.post('/api/knowledge/documents/gateway', {
        doc_id: docId,
        knowledge_base_id: kbId,
        file_name: doc.file_name,
        file_path: doc.file_path,
        chunks: chunkTexts,
        summary: doc.summary ?? '',
        analysis_result: {
          reading_card: doc.reading_card ?? '',
          relation_analysis: doc.relation_analysis ?? '',
          writing_materials: doc.writing_materials ?? '',
          todo_list: doc.todo_list ?? '',
        },
        tags: doc.tags ? doc.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        embedding_config: embeddingConfig,
      }).then(() => {
        storage.updateDocumentLifecycle(docId, 'indexed')
        storage.updateDocumentIndexStatus(docId, 'indexed', null)
      }).catch((err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : String(err)
        storage.updateDocumentLifecycle(docId, 'index_failed')
        storage.updateDocumentIndexStatus(docId, 'index_failed', errorMsg)
      })
    }

    return c.json({ success: true })
  })

  // Remove document from knowledge base
  app.delete('/:id/documents/:docId', (c) => {
    storage.removeDocumentFromKB(c.req.param('docId'), c.req.param('id'))
    return c.json({ success: true })
  })

  // Get README suggestions for a knowledge base
  app.get('/:id/readme-suggestions', (c) => {
    const status = c.req.query('status')
    const suggestions = storage.getReadmeSuggestions(c.req.param('id'), status || undefined)
    return c.json(suggestions)
  })

  // Accept a readme suggestion (apply it to the README)
  app.post('/readme-suggestions/:suggestionId/accept', (c) => {
    const suggestionId = c.req.param('suggestionId')
    const suggestion = storage.getReadmeSuggestionById(suggestionId)
    if (!suggestion) return c.json({ error: '建议不存在' }, 404)

    const kb = storage.getKnowledgeBase(suggestion.knowledge_base_id)
    if (!kb) return c.json({ error: '知识库不存在' }, 404)

    // Append suggestion to the relevant README section
    let readme = kb.readme
    const sectionHeader = `## ${suggestion.section}`
    if (readme.includes(sectionHeader)) {
      readme = readme.replace(sectionHeader, `${sectionHeader}\n- ${suggestion.suggestion}`)
    } else {
      readme += `\n${sectionHeader}\n- ${suggestion.suggestion}\n`
    }
    storage.updateKnowledgeBase(kb.id, { readme })
    storage.updateReadmeSuggestionStatus(suggestionId, 'accepted')
    return c.json({ success: true })
  })

  // Reject a readme suggestion
  app.post('/readme-suggestions/:suggestionId/reject', (c) => {
    storage.updateReadmeSuggestionStatus(c.req.param('suggestionId'), 'rejected')
    return c.json({ success: true })
  })

  // Reindex a document into a knowledge base's vector store
  app.post('/:kbId/documents/:docId/reindex', async (c) => {
    const kbId = c.req.param('kbId')
    const docId = c.req.param('docId')

    const doc = storage.getDocument(docId)
    if (!doc) return c.json({ error: '文档不存在' }, 404)

    const chunks = storage.getChunksByDocument(docId)
    const chunkTexts = chunks.map(ch => ch.content)

    storage.updateDocumentLifecycle(docId, 'indexing')
    let embeddingConfig: Record<string, unknown> | undefined
    try {
      const raw = storage.getConfig('appConfig')
      if (raw) embeddingConfig = JSON.parse(raw).embedding || undefined
    } catch { /* ignore */ }
    try {
      await python.post('/api/knowledge/documents/gateway', {
        doc_id: docId,
        knowledge_base_id: kbId,
        file_name: doc.file_name,
        file_path: doc.file_path,
        chunks: chunkTexts,
        summary: doc.summary ?? '',
        analysis_result: {
          reading_card: doc.reading_card ?? '',
          relation_analysis: doc.relation_analysis ?? '',
          writing_materials: doc.writing_materials ?? '',
          todo_list: doc.todo_list ?? '',
        },
        tags: doc.tags ? doc.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        embedding_config: embeddingConfig,
      })
      storage.updateDocumentLifecycle(docId, 'indexed')
      storage.updateDocumentIndexStatus(docId, 'indexed', null)
      return c.json({ success: true })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      storage.updateDocumentLifecycle(docId, 'index_failed')
      storage.updateDocumentIndexStatus(docId, 'index_failed', errorMsg)
      return c.json({ error: errorMsg }, 500)
    }
  })

  return app
}
