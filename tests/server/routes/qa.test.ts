import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { qaRoutes } from '../../../server/routes/qa'

function createMockStorage(overrides: Record<string, unknown> = {}) {
  return {
    getKnowledgeBase: vi.fn(() => undefined),
    getConfig: vi.fn(() => undefined),
    createQASession: vi.fn(),
    getQASession: vi.fn(() => undefined),
    getQASessions: vi.fn(() => []),
    updateQASession: vi.fn(),
    deleteQASession: vi.fn(),
    addQAMessage: vi.fn(),
    getQAMessagesBySessionId: vi.fn(() => []),
    listDocuments: vi.fn(() => []),
    getVectorIndexesForKnowledgeBase: vi.fn(() => []),
    ...overrides,
  }
}

function createMockPython(overrides: Record<string, unknown> = {}) {
  return {
    post: vi.fn(async () => ({
      answer: 'answer',
      source_doc_ids: ['doc-1'],
      source_chunks: ['chunk'],
    })),
    ...overrides,
  }
}

describe('qaRoutes', () => {
  // ── Legacy endpoint tests ─────────────────────────────────────────

  it('forwards question and knowledge-base context to Python', async () => {
    const storage = createMockStorage({
      getKnowledgeBase: vi.fn(() => ({ id: 'kb-1', readme: '# KB README' })),
      getConfig: vi.fn((key: string) => key === 'globalProfile' ? 'profile' : undefined),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa', {
      method: 'POST',
      body: JSON.stringify({ question: 'What is RAG?', knowledgeBaseId: 'kb-1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      answer: 'answer',
      sources: {
        docIds: ['doc-1'],
        chunks: ['chunk'],
      },
    })
    expect(python.post).toHaveBeenCalledWith('/api/knowledge/ask', {
      question: 'What is RAG?',
      knowledge_base_id: 'kb-1',
      knowledge_base_readme: '# KB README',
      global_profile: '',
      nickname: '',
      top_k_docs: 3,
      top_k_chunks: 5,
    })
  })

  it('returns empty sources when Python returns no matches', async () => {
    const storage = createMockStorage()
    const python = createMockPython({
      post: vi.fn(async () => ({
        answer: 'No relevant documents found.',
        source_doc_ids: [],
        source_chunks: [],
      })),
    })
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa', {
      method: 'POST',
      body: JSON.stringify({ question: 'unrelated query' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sources).toEqual({ docIds: [], chunks: [] })
  })

  // ── Session CRUD tests ────────────────────────────────────────────

  it('POST /sessions creates a session', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 'test-uuid', title: 'My Session', scope_type: 'all',
        scope_ids: '[]', created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'My Session', scopeType: 'all' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.title).toBe('My Session')
    expect(storage.createQASession).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Session', scope_type: 'all' }),
    )
  })

  it('POST /sessions returns 400 when title is empty', async () => {
    const storage = createMockStorage()
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(400)
  })

  it('GET /sessions returns session list', async () => {
    const storage = createMockStorage({
      getQASessions: vi.fn(() => [
        { id: 's1', title: 'Session 1', scope_type: 'all', scope_ids: '[]', created_at: '2024-01-01', updated_at: '2024-01-02' },
        { id: 's2', title: 'Session 2', scope_type: 'knowledge_base', scope_ids: '["kb1"]', created_at: '2024-01-01', updated_at: '2024-01-01' },
      ]),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
  })

  it('GET /sessions/:id returns session with messages', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getQAMessagesBySessionId: vi.fn(() => [
        { id: 'm1', session_id: 's1', role: 'user', content: 'hello', sources: null, created_at: '2024-01-01' },
      ]),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions/s1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.title).toBe('Test')
    expect(body.messages).toHaveLength(1)
  })

  it('GET /sessions/:id returns 404 when not found', async () => {
    const storage = createMockStorage()
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions/nonexistent')
    expect(res.status).toBe(404)
  })

  it('DELETE /sessions/:id deletes session', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions/s1', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(storage.deleteQASession).toHaveBeenCalledWith('s1')
  })

  it('DELETE /sessions/:id returns 404 when not found', async () => {
    const storage = createMockStorage()
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions/nonexistent', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  // ── Session message + scope tests ─────────────────────────────────

  it('POST /sessions/:id/messages saves user+assistant messages and returns result', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getQAMessagesBySessionId: vi.fn(() => []),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'What is RAG?' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.userMessage.role).toBe('user')
    expect(body.assistantMessage.role).toBe('assistant')
    expect(storage.addQAMessage).toHaveBeenCalledTimes(2)
  })

  it('POST /sessions/:id/messages returns 404 for missing session', async () => {
    const storage = createMockStorage()
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions/nonexistent/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'hello' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(404)
  })

  it('passes knowledge_base_id when scope_type is knowledge_base', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'knowledge_base', scope_ids: '["kb-1"]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getKnowledgeBase: vi.fn(() => ({ id: 'kb-1', readme: '# KB' })),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(python.post).toHaveBeenCalledWith('/api/knowledge/ask',
      expect.objectContaining({
        knowledge_base_id: 'kb-1',
        knowledge_base_readme: '# KB',
      }),
    )
  })

  it('passes doc_ids when scope_type is document', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'document', scope_ids: '["doc1","doc2"]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(python.post).toHaveBeenCalledWith('/api/knowledge/ask',
      expect.objectContaining({
        doc_ids: ['doc1', 'doc2'],
      }),
    )
  })

  it('skips global_profile when scope_type is knowledge_base', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'knowledge_base', scope_ids: '["kb-1"]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getKnowledgeBase: vi.fn(() => ({ id: 'kb-1', readme: '# KB' })),
      getConfig: vi.fn((key: string) => key === 'globalProfile' ? 'profile' : undefined),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const callArg = (python.post as any).mock.calls[0][1]
    expect(callArg.global_profile).toBe('')
    expect(callArg.knowledge_base_readme).toBe('# KB')
  })

  it('sends global_profile when scope_type is not knowledge_base', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getConfig: vi.fn((key: string) => key === 'globalProfile' ? 'my profile' : undefined),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const callArg = (python.post as any).mock.calls[0][1]
    expect(callArg.global_profile).toBe('my profile')
  })

  it('passes no filter params when scope_type is all', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const callArg = (python.post as any).mock.calls[0][1]
    expect(callArg.knowledge_base_id).toBeUndefined()
    expect(callArg.doc_ids).toBeUndefined()
  })

  it('includes conversation_history in Python request', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getQAMessagesBySessionId: vi.fn(() => [
        { id: 'm1', session_id: 's1', role: 'user', content: 'previous q', sources: null, created_at: '2024-01-01' },
        { id: 'm2', session_id: 's1', role: 'assistant', content: 'previous a', sources: '{}', created_at: '2024-01-01' },
      ]),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'follow up' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const callArg = (python.post as any).mock.calls[0][1]
    expect(callArg.conversation_history).toEqual([
      { role: 'user', content: 'previous q' },
      { role: 'assistant', content: 'previous a' },
    ])
  })

  // ── mentionedDocIds tests ────────────────────────────────────────

  it('returns 400 when a mentioned document does not exist', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'knowledge_base', scope_ids: '["kb1"]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      listDocuments: vi.fn(() => []),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'q', mentionedDocIds: ['missing-doc'] }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('mentioned document')
  })

  it('mentionedDocIds overrides session scope for the current message', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'document', scope_ids: '["doc1"]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getQAMessagesBySessionId: vi.fn(() => []),
      listDocuments: vi.fn(() => [{ id: 'doc-mentioned' }]),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'test', mentionedDocIds: ['doc-mentioned'] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const callArg = (python.post as any).mock.calls[0][1]
    expect(callArg.mentioned_doc_ids).toEqual(['doc-mentioned'])
    expect(callArg.doc_ids).toEqual(['doc-mentioned'])
    // Session scope_ids must NOT be mutated
    expect(storage.updateQASession).not.toHaveBeenCalledWith('s1', expect.objectContaining({ scope_ids: expect.any(String) }))
  })

  it('one mentioned paper sends strict single-doc scope', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getQAMessagesBySessionId: vi.fn(() => []),
      listDocuments: vi.fn(() => [{ id: 'doc-1' }]),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'test', mentionedDocIds: ['doc-1'] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const callArg = (python.post as any).mock.calls[0][1]
    expect(callArg.mentioned_doc_ids).toEqual(['doc-1'])
    expect(callArg.doc_ids).toEqual(['doc-1'])
  })

  it('multiple mentioned papers sends strict compare scope', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getQAMessagesBySessionId: vi.fn(() => []),
      listDocuments: vi.fn(() => [{ id: 'doc-1' }, { id: 'doc-2' }]),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'test', mentionedDocIds: ['doc-1', 'doc-2'] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const callArg = (python.post as any).mock.calls[0][1]
    expect(callArg.mentioned_doc_ids).toEqual(['doc-1', 'doc-2'])
    expect(callArg.doc_ids).toEqual(['doc-1', 'doc-2'])
  })

  it('no mentions preserves existing session scope behavior', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getQAMessagesBySessionId: vi.fn(() => []),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const callArg = (python.post as any).mock.calls[0][1]
    expect(callArg.mentioned_doc_ids).toBeUndefined()
  })

  it('passes indexed collection names for mentioned documents', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'knowledge_base', scope_ids: '["kb1"]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getKnowledgeBase: vi.fn(() => ({ id: 'kb1', readme: '# KB' })),
      getQAMessagesBySessionId: vi.fn(() => []),
      listDocuments: vi.fn(() => [{ id: 'doc-1' }]),
      getVectorIndexesForKnowledgeBase: vi.fn(() => [
        { document_id: 'doc-1', collection_name: 'documents__configured', status: 'indexed' },
        { document_id: 'doc-2', collection_name: 'documents__other', status: 'indexed' },
      ]),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: '这篇论文主要改进是什么？', mentionedDocIds: ['doc-1'] }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect((python.post as any).mock.calls[0][1].collection_names).toEqual(['documents__configured'])
  })

  it('sources persist with both existing and new response fields', async () => {
    const mockRefs = [
      { doc_id: 'doc-1', file_name: 'paper.pdf', chunk_id: 'c1', chunk_index: 0, chunk_type: 'text', content: 'some text', score: 0.95 },
    ]
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getQAMessagesBySessionId: vi.fn(() => []),
    })
    const python = createMockPython({
      post: vi.fn(async () => ({
        answer: 'detailed answer',
        source_doc_ids: ['doc-1'],
        source_chunks: ['chunk-1'],
        answer_mode: 'cite',
        source_refs: mockRefs,
      })),
    })
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })

    // Verify stored sources JSON includes new fields
    const addMsgCalls = (storage.addQAMessage as any).mock.calls
    const assistantCall = addMsgCalls.find((c: any) => c[0].role === 'assistant')
    const storedSources = JSON.parse(assistantCall[0].sources)
    expect(storedSources.docIds).toEqual(['doc-1'])
    expect(storedSources.chunks).toEqual(['chunk-1'])
    expect(storedSources.refs).toEqual(mockRefs)
    expect(storedSources.answerMode).toBe('cite')

    // Verify response includes new fields
    const body = await res.json()
    expect(body.assistantMessage.sources.refs).toEqual(mockRefs)
    expect(body.assistantMessage.sources.answerMode).toBe('cite')
  })

  it('persists and returns evidenceStatus from Python response', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getQAMessagesBySessionId: vi.fn(() => []),
    })
    const python = createMockPython({
      post: vi.fn(async () => ({
        answer: 'a',
        source_doc_ids: [],
        source_chunks: [],
        answer_mode: 'general',
        evidence_status: 'none',
        source_refs: [],
      })),
    })
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'q' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const body = await res.json()
    expect(body.assistantMessage.sources.evidenceStatus).toBe('none')
    const savedAssistant = storage.addQAMessage.mock.calls.find((call: any[]) => call[0].role === 'assistant')?.[0]
    expect(JSON.parse(savedAssistant.sources).evidenceStatus).toBe('none')
  })

  it('persists and returns evidenceStatus "reliable"', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getQAMessagesBySessionId: vi.fn(() => []),
    })
    const python = createMockPython({
      post: vi.fn(async () => ({
        answer: 'detailed answer',
        source_doc_ids: ['doc-1'],
        source_chunks: ['chunk-1'],
        answer_mode: 'cite',
        evidence_status: 'reliable',
        source_refs: [],
      })),
    })
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'q' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const body = await res.json()
    expect(body.assistantMessage.sources.evidenceStatus).toBe('reliable')
    const savedAssistant = storage.addQAMessage.mock.calls.find((call: any[]) => call[0].role === 'assistant')?.[0]
    expect(JSON.parse(savedAssistant.sources).evidenceStatus).toBe('reliable')
  })

  // ── Legacy Python response compatibility ────────────────────────────

  it('handles legacy Python response without answer_mode and source_refs', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getQAMessagesBySessionId: vi.fn(() => []),
    })
    const python = createMockPython({
      post: vi.fn(async () => ({
        answer: 'answer',
        source_doc_ids: ['doc-1'],
        source_chunks: ['chunk'],
        // No answer_mode or source_refs — legacy Python response
      })),
    })
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.assistantMessage.sources.docIds).toEqual(['doc-1'])
    expect(body.assistantMessage.sources.chunks).toEqual(['chunk'])
    expect(body.assistantMessage.sources.answerMode).toBeUndefined()
    expect(body.assistantMessage.sources.refs).toBeUndefined()
    expect(body.assistantMessage.sources.evidenceStatus).toBeUndefined()
  })

  // ── Python failure handling tests ─────────────────────────────────

  it('POST /sessions/:id/messages returns 503 when Python backend fails', async () => {
    const storage = createMockStorage({
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'all', scope_ids: '[]',
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getQAMessagesBySessionId: vi.fn(() => []),
    })
    const python = createMockPython({
      post: vi.fn(async () => { throw new Error('Connection refused') }),
    })
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa/sessions/s1/messages', {
      method: 'POST',
      body: JSON.stringify({ question: 'What is RAG?' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toContain('Python')
    expect(storage.addQAMessage).toHaveBeenCalledTimes(1) // Only user message saved
  })

  it('POST / (legacy) returns 503 when Python backend fails', async () => {
    const storage = createMockStorage()
    const python = createMockPython({
      post: vi.fn(async () => { throw new Error('Python unavailable') }),
    })
    const app = new Hono()
    app.route('/api/qa', qaRoutes(storage as any, python as any))

    const res = await app.request('/api/qa', {
      method: 'POST',
      body: JSON.stringify({ question: 'What is RAG?' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toContain('Python')
  })
})
