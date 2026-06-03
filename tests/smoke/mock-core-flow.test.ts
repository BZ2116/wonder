import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { configRoutes } from '../../server/routes/config'
import { analysisRoutes } from '../../server/routes/analysis'
import { knowledgeBaseRoutes } from '../../server/routes/knowledge-bases'
import { qaRoutes } from '../../server/routes/qa'
import { historyRoutes } from '../../server/routes/history'

// Mock fs so configRoutes.syncConfigToPython doesn't touch disk
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, default: { ...actual, writeFileSync: vi.fn() } }
})

function createSmokeApp() {
  const docs = new Map<string, Record<string, unknown>>()
  const chunks = new Map<string, Array<Record<string, unknown>>>()
  const kbs = new Map<string, Record<string, unknown>>()
  const history: Array<Record<string, unknown>> = []
  const kbDocs = new Map<string, string[]>() // kbId -> docIds

  const storage = {
    // Config
    getAllConfig: vi.fn(() => ({})),
    setConfig: vi.fn(),
    getConfig: vi.fn((key: string) => {
      if (key === 'globalProfile') return 'RAG researcher'
      if (key === 'appConfig') return JSON.stringify({ chat: { provider: 'test' } })
      return undefined
    }),

    // Documents
    upsertDocument: vi.fn((doc: Record<string, unknown>) => { docs.set(doc.id as string, doc) }),
    getDocument: vi.fn((id: string) => docs.get(id)),
    listDocuments: vi.fn(() => [...docs.values()]),
    deleteDocument: vi.fn(),

    // Chunks
    insertChunk: vi.fn((ch: Record<string, unknown>) => {
      const docId = ch.documentId as string
      if (!chunks.has(docId)) chunks.set(docId, [])
      chunks.get(docId)!.push(ch)
    }),
    getChunksByDocument: vi.fn((docId: string) => chunks.get(docId) || []),

    // Knowledge Bases
    listKnowledgeBases: vi.fn(() => [...kbs.values()]),
    getKnowledgeBase: vi.fn((id: string) => kbs.get(id)),
    createKnowledgeBase: vi.fn((kb: Record<string, unknown>) => { kbs.set(kb.id as string, kb) }),
    updateKnowledgeBase: vi.fn((id: string, patch: Record<string, unknown>) => {
      const existing = kbs.get(id)
      if (existing) Object.assign(existing, patch)
    }),
    deleteKnowledgeBase: vi.fn(),
    deleteKnowledgeBaseCascade: vi.fn((id: string) => { kbs.delete(id) }),
    getDocumentKBCount: vi.fn(() => 0),
    getKBTags: vi.fn(() => []),
    getPendingSuggestionCount: vi.fn(() => 0),

    // Document-KB links
    addDocumentToKB: vi.fn((link: Record<string, unknown>) => {
      const kbId = link.knowledgeBaseId as string
      const docId = link.documentId as string
      if (!kbDocs.has(kbId)) kbDocs.set(kbId, [])
      kbDocs.get(kbId)!.push(docId)
    }),
    removeDocumentFromKB: vi.fn(),
    getDocumentsByKB: vi.fn((kbId: string) => {
      const ids = kbDocs.get(kbId) || []
      return ids.map(id => docs.get(id)).filter(Boolean)
    }),

    // README suggestions
    addReadmeSuggestion: vi.fn(),
    getReadmeSuggestions: vi.fn(() => []),
    getReadmeSuggestionById: vi.fn(() => undefined),
    updateReadmeSuggestionStatus: vi.fn(),

    // QA
    createQASession: vi.fn(),
    getQASession: vi.fn(() => undefined),
    getQASessions: vi.fn(() => []),
    updateQASession: vi.fn(),
    deleteQASession: vi.fn(),
    addQAMessage: vi.fn(),
    getQAMessagesBySessionId: vi.fn(() => []),

    // History
    addHistory: vi.fn((entry: Record<string, unknown>) => { history.push(entry) }),
    listHistory: vi.fn((limit: number) => history.slice(0, limit)),
    getHistory: vi.fn((id: string) => history.find(h => h.id === id)),
    deleteHistory: vi.fn(),

    // Lifecycle
    updateDocumentLifecycle: vi.fn(),
    updateDocumentIndexStatus: vi.fn(),
  }

  const python = {
    post: vi.fn(async (path: string, body: unknown) => {
      if (path === '/api/knowledge/documents/gateway') {
        return { doc_id: (body as Record<string, unknown>).doc_id, message: 'indexed' }
      }
      if (path === '/api/knowledge/ask') {
        return {
          answer: 'RAG combines retrieval with generation.',
          source_doc_ids: ['doc-1'],
          source_chunks: ['Retrieval-Augmented Generation (RAG) is a technique...'],
        }
      }
      if (path === '/api/readme-advisor/generate') {
        return { suggestions: [] }
      }
      return {}
    }),
    postSSE: vi.fn(async function* () {
      yield { event: 'agent_done', data: JSON.stringify({ step: 'literature' }) }
      yield { event: 'agent_done', data: JSON.stringify({ step: 'relation' }) }
      yield { event: 'agent_done', data: JSON.stringify({ step: 'writing' }) }
      yield { event: 'agent_done', data: JSON.stringify({ step: 'todo' }) }
      yield {
        event: 'complete',
        data: JSON.stringify({
          doc_id: 'doc-1',
          file_name: 'paper.pdf',
          status: 'ok',
          failed_agents: [],
          reading_card: '## 1. Topic Summary\nRAG combines retrieval with generation.',
          relation_analysis: 'Supplements existing KB work.',
          writing_materials: 'Usable claims about RAG.',
          todo_list: '- Reproduce RAG experiments',
          summary: 'RAG combines retrieval with generation.',
          tags: ['rag', 'nlp'],
          fit_score: 90,
          fit_reason: 'Highly relevant to KB.',
          relation_type: 'supplement',
          recommended_action: 'add',
          suggested_placement: { sub_direction: 'RAG', tags: ['rag'] },
          novelty_for_kb: 'Introduces retrieval-augmented approach.',
          readme_suggestions: [],
          source_chunks: ['Retrieval-Augmented Generation (RAG) is a technique...'],
        }),
      }
    }),
  }

  const app = new Hono()
  app.route('/api/config', configRoutes(storage as any))
  app.route('/api/analysis', analysisRoutes(storage as any, python as any))
  app.route('/api/knowledge-bases', knowledgeBaseRoutes(storage as any, python as any))
  app.route('/api/qa', qaRoutes(storage as any, python as any))
  app.route('/api/history', historyRoutes(storage as any))

  return { app, storage, python, docs, kbs, history }
}

describe('Mock Core Flow Smoke', () => {
  it('end-to-end: config → analyze → add to KB → ask QA → view history', async () => {
    const { app, storage, python } = createSmokeApp()

    // ── Step 1: Save config ───────────────────────────────────────────
    const configRes = await app.request('/api/config', {
      method: 'PUT',
      body: JSON.stringify({
        normalizedConfig: {
          chat: { provider: 'anthropic', apiKey: 'sk-test', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
          embedding: { provider: 'openai_compatible', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small', dimensions: 1536 },
          knowledge: { enabled: true },
          research: { globalProfile: 'RAG researcher' },
        },
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(configRes.status).toBe(200)
    expect((await configRes.json()).success).toBe(true)
    expect(storage.setConfig).toHaveBeenCalled()

    // ── Step 2: Analyze document (SSE) ────────────────────────────────
    const analysisRes = await app.request('/api/analysis/single', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'paper.pdf',
        fileType: 'pdf',
        text: 'Retrieval-Augmented Generation (RAG) is a technique...',
        knowledgeBaseId: 'kb-1',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(analysisRes.status).toBe(200)
    const sseBody = await analysisRes.text()
    expect(sseBody).toContain('event: step')
    expect(sseBody).toContain('event: complete')
    expect(sseBody).toContain('documentId')
    expect(storage.upsertDocument).toHaveBeenCalled()
    expect(storage.addHistory).toHaveBeenCalled()
    expect(python.postSSE).toHaveBeenCalledWith(
      '/api/analysis/gateway',
      expect.objectContaining({ file_name: 'paper.pdf', knowledge_base_id: 'kb-1' }),
      expect.any(AbortSignal),
    )

    // Extract the documentId from the analysis SSE complete event
    const completeMatch = sseBody.match(/event: complete\ndata: (.+)/)
    const completeData = JSON.parse(completeMatch![1])
    const docId = completeData.documentId

    // ── Step 3: Create knowledge base and add document ────────────────
    const createKbRes = await app.request('/api/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify({ name: 'RAG Research' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(createKbRes.status).toBe(201)
    const kb = await createKbRes.json()
    expect(kb.name).toBe('RAG Research')

    const addDocRes = await app.request(`/api/knowledge-bases/${kb.id}/documents`, {
      method: 'POST',
      body: JSON.stringify({ documentId: docId }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(addDocRes.status).toBe(200)
    expect(storage.addDocumentToKB).toHaveBeenCalled()
    expect(python.post).toHaveBeenCalledWith(
      '/api/knowledge/documents/gateway',
      expect.objectContaining({ doc_id: docId, knowledge_base_id: kb.id }),
    )

    // ── Step 4: Ask RAG question ──────────────────────────────────────
    const qaRes = await app.request('/api/qa', {
      method: 'POST',
      body: JSON.stringify({ question: 'What is RAG?', knowledgeBaseId: 'kb-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(qaRes.status).toBe(200)
    const qaBody = await qaRes.json()
    expect(qaBody.answer).toContain('RAG')
    expect(qaBody.sources.docIds).toContain('doc-1')
    expect(python.post).toHaveBeenCalledWith(
      '/api/knowledge/ask',
      expect.objectContaining({ question: 'What is RAG?', knowledge_base_id: 'kb-1' }),
    )

    // ── Step 5: View history ──────────────────────────────────────────
    const historyRes = await app.request('/api/history')
    expect(historyRes.status).toBe(200)
    const historyList = await historyRes.json()
    expect(historyList.length).toBeGreaterThanOrEqual(1)
    expect(storage.listHistory).toHaveBeenCalled()
  })

  it('config GET returns stored values', async () => {
    const { app, storage } = createSmokeApp()
    storage.getAllConfig = vi.fn(() => ({
      appConfig: JSON.stringify({ chat: { provider: 'anthropic' } }),
    }))

    const res = await app.request('/api/config')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.normalizedConfig).toBeDefined()
  })

  it('analysis returns 400 on empty text', async () => {
    const { app } = createSmokeApp()

    const res = await app.request('/api/analysis/single', {
      method: 'POST',
      body: JSON.stringify({ fileName: 'empty.pdf', fileType: 'pdf', text: '' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  it('knowledge base CRUD works end-to-end', async () => {
    const { app, storage } = createSmokeApp()

    // Create
    const createRes = await app.request('/api/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test KB', description: 'A test KB' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(createRes.status).toBe(201)
    const kb = await createRes.json()

    // List
    const listRes = await app.request('/api/knowledge-bases')
    expect(listRes.status).toBe(200)

    // Get
    const getRes = await app.request(`/api/knowledge-bases/${kb.id}`)
    expect(getRes.status).toBe(200)

    // Delete
    const delRes = await app.request(`/api/knowledge-bases/${kb.id}`, { method: 'DELETE' })
    expect(delRes.status).toBe(200)
    expect(storage.deleteKnowledgeBaseCascade).toHaveBeenCalledWith(kb.id)
  })

  it('QA handles Python backend failure gracefully', async () => {
    const { app, python } = createSmokeApp()
    python.post.mockRejectedValueOnce(new Error('Connection refused'))

    const res = await app.request('/api/qa', {
      method: 'POST',
      body: JSON.stringify({ question: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('history deletion works', async () => {
    const { app, storage } = createSmokeApp()
    storage.deleteHistory = vi.fn(() => true)

    const res = await app.request('/api/history/some-id', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(storage.deleteHistory).toHaveBeenCalledWith('some-id')
  })
})
