import { Hono } from 'hono'
import { StorageService } from '../services/storage'
import { PythonBackendClient } from '../services/python-backend'
import { randomUUID } from 'crypto'

function buildCollectionName(provider: string, model: string, dimensions: number): string {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `documents__${normalize(provider)}__${normalize(model)}__${dimensions}`
}

function buildMetadataPayload(storage: StorageService, doc: any, chunks: string[], tags: string[]) {
  const meta = storage.getDocumentMetadata(doc.id)
  const authors = meta?.authors ? JSON.parse(meta.authors) : []
  const keywords = meta?.keywords ? JSON.parse(meta.keywords) : []
  return {
    file_name: doc.file_name,
    file_path: doc.file_path,
    chunks,
    summary: doc.summary ?? '',
    analysis_result: {
      reading_card: doc.reading_card ?? '',
      relation_analysis: doc.relation_analysis ?? '',
      writing_materials: doc.writing_materials ?? '',
      todo_list: doc.todo_list ?? '',
    },
    tags,
    paper_title: meta?.title ?? doc.file_name,
    authors,
    year: meta?.year ?? null,
    venue: meta?.venue ?? null,
    abstract: meta?.abstract ?? doc.summary ?? '',
    keywords,
    metadata_status: meta?.metadata_status ?? 'missing',
  }
}

function getEmbeddingInfo(storage: StorageService): { provider: string; model: string; dimensions: number; backend: string } {
  let provider = 'openai_compatible'
  let model = 'text-embedding-3-small'
  let dimensions = 1536
  try {
    const raw = storage.getConfig('appConfig')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.embedding) {
        if (parsed.embedding.provider) provider = parsed.embedding.provider
        if (parsed.embedding.model) model = parsed.embedding.model
        if (parsed.embedding.dimensions) dimensions = parsed.embedding.dimensions
      }
    }
  } catch { /* use defaults */ }
  return { provider, model, dimensions, backend: 'chroma' }
}

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
    const kb = storage.getKnowledgeBase(id)
    if (!kb) return c.json({ error: '知识库不存在' }, 404)
    storage.deleteKnowledgeBaseCascade(id)
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

      const embInfo = getEmbeddingInfo(storage)
      const collectionName = buildCollectionName(embInfo.provider, embInfo.model, embInfo.dimensions)
      const indexId = randomUUID()

      storage.upsertDocumentVectorIndex({
        id: indexId,
        documentId: docId,
        knowledgeBaseId: kbId,
        backend: embInfo.backend,
        collectionName,
        embeddingProvider: embInfo.provider,
        embeddingModel: embInfo.model,
        embeddingDimensions: embInfo.dimensions,
        chunkCount: chunks.length,
        indexVersion: 1,
        status: 'indexing',
      })

      const tags = doc.tags ? doc.tags.split(',').map(t => t.trim()).filter(Boolean) : []
      const metaPayload = buildMetadataPayload(storage, doc, chunkTexts, tags)

      python.post('/api/knowledge/documents/gateway', {
        doc_id: docId,
        knowledge_base_id: kbId,
        index_id: indexId,
        collection_name: collectionName,
        embedding_provider: embInfo.provider,
        embedding_model: embInfo.model,
        embedding_dimensions: embInfo.dimensions,
        ...metaPayload,
      }).then(() => {
        storage.updateDocumentLifecycle(docId, 'indexed')
        storage.markVectorIndexStatus(indexId, 'indexed')
      }).catch((err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : String(err)
        storage.updateDocumentLifecycle(docId, 'index_failed')
        storage.markVectorIndexStatus(indexId, 'failed', errorMsg)
      })

      // Generate README suggestions in background (fire-and-forget)
      const kb = storage.getKnowledgeBase(kbId)
      if (kb?.readme) {
        let chatConfig: Record<string, unknown> | undefined
        try {
          const raw = storage.getConfig('appConfig')
          if (raw) chatConfig = JSON.parse(raw).chat || undefined
        } catch { /* ignore */ }

        python.post('/api/readme-advisor/generate', {
          readme: kb.readme,
          document_summary: doc.summary ?? '',
          reading_card: doc.reading_card ?? '',
          chat_config: chatConfig,
        }).then((resp: unknown) => {
          const data = resp as { suggestions?: Array<{ section: string; suggestion: string; reason?: string }> }
          if (Array.isArray(data.suggestions)) {
            for (const sug of data.suggestions) {
              storage.addReadmeSuggestion({
                id: randomUUID(),
                knowledgeBaseId: kbId,
                documentId: docId,
                section: sug.section,
                suggestion: sug.suggestion,
                reason: sug.reason,
              })
            }
          }
        }).catch((err: unknown) => {
          console.error('[readme-advisor] Failed to generate suggestions:', err instanceof Error ? err.message : err)
        })
      }
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

    // Mark old indexes as stale
    storage.markDocumentIndexesStale(docId)

    // Determine next index version
    const existingIndexes = storage.getVectorIndexesForDocument(docId)
    const maxVersion = existingIndexes.reduce((max, idx) => Math.max(max, idx.index_version), 0)
    const newVersion = maxVersion + 1

    const embInfo = getEmbeddingInfo(storage)
    const collectionName = buildCollectionName(embInfo.provider, embInfo.model, embInfo.dimensions)
    const indexId = randomUUID()

    storage.upsertDocumentVectorIndex({
      id: indexId,
      documentId: docId,
      knowledgeBaseId: kbId,
      backend: embInfo.backend,
      collectionName,
      embeddingProvider: embInfo.provider,
      embeddingModel: embInfo.model,
      embeddingDimensions: embInfo.dimensions,
      chunkCount: chunks.length,
      indexVersion: newVersion,
      status: 'indexing',
    })

    storage.updateDocumentLifecycle(docId, 'indexing')
    try {
      const tags = doc.tags ? doc.tags.split(',').map(t => t.trim()).filter(Boolean) : []
      const metaPayload = buildMetadataPayload(storage, doc, chunkTexts, tags)

      await python.post('/api/knowledge/documents/gateway', {
        doc_id: docId,
        knowledge_base_id: kbId,
        index_id: indexId,
        collection_name: collectionName,
        embedding_provider: embInfo.provider,
        embedding_model: embInfo.model,
        embedding_dimensions: embInfo.dimensions,
        ...metaPayload,
      })
      storage.updateDocumentLifecycle(docId, 'indexed')
      storage.markVectorIndexStatus(indexId, 'indexed')
      return c.json({ success: true })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      storage.updateDocumentLifecycle(docId, 'index_failed')
      storage.markVectorIndexStatus(indexId, 'failed', errorMsg)
      return c.json({ error: errorMsg }, 500)
    }
  })

  return app
}
