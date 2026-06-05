import { Hono } from 'hono'
import { randomUUID } from 'crypto'
import { StorageService } from '../services/storage'
import { PythonBackendClient } from '../services/python-backend'

interface PythonQAResponse {
  answer: string
  source_doc_ids: string[]
  source_chunks: string[]
  answer_mode?: string
  evidence_status?: 'none' | 'weak' | 'reliable'
  source_refs?: Array<{
    doc_id: string
    file_name: string
    chunk_id?: string | null
    chunk_index?: number | null
    chunk_type: 'summary' | 'content'
    content: string
    score?: number | null
  }>
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v))))
}

export function qaRoutes(storage: StorageService, python: PythonBackendClient) {
  const app = new Hono()

  // ── Session endpoints ───────────────────────────────────────────────

  app.post('/sessions', async (c) => {
    const body = await c.req.json<{ title: string; scopeType?: string; scopeIds?: string[] }>()
    if (!body.title?.trim()) return c.json({ error: 'Title is required' }, 400)

    const id = randomUUID()
    storage.createQASession({
      id,
      title: body.title.trim(),
      scope_type: body.scopeType || 'knowledge_base',
      scope_ids: JSON.stringify(body.scopeIds || []),
    })

    const session = storage.getQASession(id)
    return c.json(session, 201)
  })

  app.get('/sessions', (c) => {
    const sessions = storage.getQASessions()
    return c.json(sessions)
  })

  app.get('/sessions/:id', (c) => {
    const id = c.req.param('id')
    const session = storage.getQASession(id)
    if (!session) return c.json({ error: 'Session not found' }, 404)

    const messages = storage.getQAMessagesBySessionId(id)
    return c.json({ ...session, messages })
  })

  app.delete('/sessions/:id', (c) => {
    const id = c.req.param('id')
    const session = storage.getQASession(id)
    if (!session) return c.json({ error: 'Session not found' }, 404)

    storage.deleteQASession(id)
    return c.json({ ok: true })
  })

  // ── Session message endpoint (scoped QA) ────────────────────────────

  app.post('/sessions/:id/messages', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json<{ question: string; mentionedDocIds?: string[] }>()
    if (!body.question?.trim()) return c.json({ error: 'Question is required' }, 400)

    const session = storage.getQASession(id)
    if (!session) return c.json({ error: 'Session not found' }, 404)

    // Validate mentioned document IDs
    const mentionedDocIds = Array.from(new Set((body.mentionedDocIds || []).filter(Boolean)))
    if (mentionedDocIds.length > 0) {
      const allDocs = storage.listDocuments()
      const existingIds = new Set(allDocs.map((doc: any) => doc.id))
      const missing = mentionedDocIds.filter(docId => !existingIds.has(docId))
      if (missing.length > 0) {
        return c.json({ error: `Invalid mentioned document ids: ${missing.join(', ')}` }, 400)
      }
    }

    // Save user message
    const userMsgId = randomUUID()
    storage.addQAMessage({ id: userMsgId, session_id: id, role: 'user', content: body.question.trim() })

    // Build Python request based on scope
    const scopeIds: string[] = JSON.parse(session.scope_ids)
    // Extract nickname and chat/embedding config from normalized config
    let nickname = ''
    let chatConfig: Record<string, unknown> | undefined
    let embeddingConfig: Record<string, unknown> | undefined
    try {
      const raw = storage.getConfig('appConfig')
      if (raw) {
        const parsed = JSON.parse(raw)
        nickname = parsed.nickname || ''
        chatConfig = parsed.chat || undefined
        embeddingConfig = parsed.embedding || undefined
      }
    } catch { /* ignore */ }

    const pythonBody: Record<string, unknown> = {
      question: body.question.trim(),
      global_profile: '',
      nickname,
      top_k_docs: 3,
      top_k_chunks: 5,
      chat_config: chatConfig,
      embedding_config: embeddingConfig,
    }

    if (session.scope_type === 'knowledge_base' && scopeIds.length > 0) {
      const kbId = scopeIds[0]
      pythonBody.knowledge_base_id = kbId
      const kb = storage.getKnowledgeBase(kbId)
      if (kb) pythonBody.knowledge_base_readme = kb.readme
      // KB selected: use KB readme as background, skip global profile
    } else {
      // No KB selected: use global profile as background
      pythonBody.global_profile = storage.getConfig('globalProfile') || ''
      if (session.scope_type === 'document' && scopeIds.length > 0) {
        pythonBody.doc_ids = scopeIds
      }
    }

    // Override scope with mentioned doc IDs for this message only
    if (body.mentionedDocIds && body.mentionedDocIds.length > 0) {
      pythonBody.mentioned_doc_ids = body.mentionedDocIds
      pythonBody.doc_ids = body.mentionedDocIds
    }

    // Resolve indexed collection names for knowledge-base scoped sessions
    const kbId = session.scope_type === 'knowledge_base' && scopeIds.length > 0 ? scopeIds[0] : undefined
    if (kbId) {
      const kbCollectionIndexes = storage.getVectorIndexesForKnowledgeBase(kbId, 'indexed')
      const mentionedSet = new Set(mentionedDocIds)
      const relevantIndexes = mentionedDocIds.length > 0
        ? kbCollectionIndexes.filter(idx => mentionedSet.has(idx.document_id))
        : kbCollectionIndexes
      const collectionNames = uniqueStrings(relevantIndexes.map(idx => idx.collection_name))
      if (collectionNames.length > 0) {
        pythonBody.collection_names = collectionNames
      }
    }

    // Build conversation history (last 10 messages)
    const history = storage.getQAMessagesBySessionId(id)
    const recentHistory = history.slice(-10).map(m => ({ role: m.role, content: m.content }))
    pythonBody.conversation_history = recentHistory

    // Call Python
    try {
      const result = await python.post<PythonQAResponse>('/api/knowledge/ask', pythonBody)

      // Save assistant message
      const assistantMsgId = randomUUID()
      const sources = JSON.stringify({
        docIds: result.source_doc_ids,
        chunks: result.source_chunks,
        refs: result.source_refs,
        answerMode: result.answer_mode,
        evidenceStatus: result.evidence_status,
      })
      storage.addQAMessage({ id: assistantMsgId, session_id: id, role: 'assistant', content: result.answer, sources })

      // Update session updated_at
      storage.updateQASession(id, {})

      return c.json({
        userMessage: { id: userMsgId, role: 'user', content: body.question.trim() },
        assistantMessage: {
          id: assistantMsgId,
          role: 'assistant',
          content: result.answer,
          sources: {
            docIds: result.source_doc_ids,
            chunks: result.source_chunks,
            refs: result.source_refs,
            answerMode: result.answer_mode,
            evidenceStatus: result.evidence_status,
          },
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: `Python backend unavailable: ${message}` }, 503)
    }
  })

  // ── Legacy endpoint (backward compatible) ───────────────────────────

  app.post('/', async (c) => {
    const body = await c.req.json<{ question: string; knowledgeBaseId?: string }>()
    if (!body.question?.trim()) return c.json({ error: 'Question is required' }, 400)

    const kb = body.knowledgeBaseId ? storage.getKnowledgeBase(body.knowledgeBaseId) : undefined

    let nickname = ''
    let chatConfig: Record<string, unknown> | undefined
    let embeddingConfig: Record<string, unknown> | undefined
    try {
      const raw = storage.getConfig('appConfig')
      if (raw) {
        const parsed = JSON.parse(raw)
        nickname = parsed.nickname || ''
        chatConfig = parsed.chat || undefined
        embeddingConfig = parsed.embedding || undefined
      }
    } catch { /* ignore */ }

    try {
      const result = await python.post<PythonQAResponse>('/api/knowledge/ask', {
        question: body.question,
        knowledge_base_id: body.knowledgeBaseId,
        knowledge_base_readme: kb?.readme || '',
        // KB selected: use KB readme as background, skip global profile
        global_profile: kb ? '' : (storage.getConfig('globalProfile') || ''),
        nickname,
        top_k_docs: 3,
        top_k_chunks: 5,
        chat_config: chatConfig,
        embedding_config: embeddingConfig,
      })

      return c.json({
        answer: result.answer,
        sources: {
          docIds: result.source_doc_ids,
          chunks: result.source_chunks,
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: `Python backend unavailable: ${message}` }, 503)
    }
  })

  return app
}
