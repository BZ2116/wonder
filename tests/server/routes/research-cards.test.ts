import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { researchCardRoutes } from '../../../server/routes/research-cards'

function createMockStorage(overrides: Record<string, unknown> = {}) {
  return {
    getKnowledgeBase: vi.fn(() => undefined),
    getQASession: vi.fn(() => undefined),
    getQAMessage: vi.fn(() => undefined),
    getPreviousUserMessage: vi.fn(() => undefined),
    createResearchCard: vi.fn(),
    createResearchCardWithRefs: vi.fn(),
    replaceResearchCardEvidenceRefs: vi.fn(),
    getResearchCard: vi.fn(() => undefined),
    getResearchCardEvidenceRefs: vi.fn(() => []),
    listResearchCards: vi.fn(() => []),
    updateResearchCard: vi.fn(),
    archiveResearchCard: vi.fn(),
    upsertResearchCardVectorIndex: vi.fn(),
    markResearchCardVectorIndexStatus: vi.fn(),
    getResearchCardVectorIndexes: vi.fn(() => []),
    ...overrides,
  }
}

function createMockPython(overrides: Record<string, unknown> = {}) {
  return {
    post: vi.fn(async (path: string) => {
      if (path === '/api/research-cards/draft') {
        return {
          question: 'What is RAG?',
          core_claims: ['RAG combines retrieval and generation'],
          knowledge_type: 'method',
          tags: ['rag', 'llm'],
          sub_direction: 'retrieval augmented generation',
          validation_notes: 'verified by literature',
          use_cases: ['question answering'],
          linked_doc_ids: ['doc1'],
          no_paper_evidence: false,
          evidence_refs: [
            { doc_id: 'doc1', file_name: 'paper.pdf', chunk_type: 'content', content: 'evidence text', score: 0.9 },
          ],
        }
      }
      return { ok: true }
    }),
    ...overrides,
  }
}

describe('researchCardRoutes', () => {
  // ── POST /draft-from-qa ────────────────────────────────────────────

  it('draft-from-qa creates fallback draft when Python fails', async () => {
    const storage = createMockStorage({
      getQAMessage: vi.fn(() => ({
        id: 'm2', session_id: 's1', role: 'assistant',
        content: 'RAG is a technique that combines retrieval with generation.',
        sources: JSON.stringify({
          docIds: ['doc1'], chunks: [], refs: [
            { doc_id: 'doc1', file_name: 'paper.pdf', chunk_type: 'content', content: 'some evidence', score: 0.85 },
          ],
          answerMode: 'rag_enhanced',
        }),
        created_at: '2024-01-02',
      })),
      getPreviousUserMessage: vi.fn(() => ({
        id: 'm1', session_id: 's1', role: 'user', content: 'What is RAG?',
        sources: null, created_at: '2024-01-01',
      })),
      getQASession: vi.fn(() => ({
        id: 's1', title: 'Test', scope_type: 'knowledge_base',
        scope_ids: '["kb1"]', created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
    })
    const python = createMockPython({
      post: vi.fn(async () => { throw new Error('Python unavailable') }),
    })
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    const res = await app.request('/api/research-cards/draft-from-qa', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 's1', messageId: 'm2' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.question).toBe('What is RAG?')
    expect(body.coreClaims).toEqual(['RAG is a technique that combines retrieval with generation.'])
    expect(body.noPaperEvidence).toBe(false)
    expect(body.evidenceRefs).toHaveLength(1)
    expect(body.evidenceRefs[0].documentId).toBe('doc1')
    expect(body.answerMode).toBe('rag_enhanced')
    expect(body.sourceMessageId).toBe('m2')
  })

  it('draft-from-qa returns 400 when sessionId or messageId missing', async () => {
    const storage = createMockStorage()
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    const res = await app.request('/api/research-cards/draft-from-qa', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  it('draft-from-qa returns 404 when message not found', async () => {
    const storage = createMockStorage()
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    const res = await app.request('/api/research-cards/draft-from-qa', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 's1', messageId: 'm1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(404)
  })

  it('draft-from-qa returns 400 when message role is not assistant', async () => {
    const storage = createMockStorage({
      getQAMessage: vi.fn(() => ({
        id: 'm1', session_id: 's1', role: 'user', content: 'question',
        sources: null, created_at: '2024-01-01',
      })),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    const res = await app.request('/api/research-cards/draft-from-qa', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 's1', messageId: 'm1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  it('draft-from-qa returns 400 when message belongs to different session', async () => {
    const storage = createMockStorage({
      getQAMessage: vi.fn(() => ({
        id: 'm1', session_id: 'other-session', role: 'assistant', content: 'answer',
        sources: null, created_at: '2024-01-01',
      })),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    const res = await app.request('/api/research-cards/draft-from-qa', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 's1', messageId: 'm1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  // ── POST / ─────────────────────────────────────────────────────────

  it('POST / saves card and evidence refs', async () => {
    const storage = createMockStorage({
      getResearchCard: vi.fn(() => ({
        id: 'card-uuid', knowledge_base_id: 'kb1', question: 'What is RAG?',
        core_claims: '["claim1"]', knowledge_type: 'method', tags: '["rag"]',
        sub_direction: null, validation_notes: 'verified', use_cases: '["review"]',
        linked_doc_ids: '[]', answer_mode: null, source_message_id: null,
        status: 'saved', no_paper_evidence: 0,
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
      getResearchCardEvidenceRefs: vi.fn(() => [
        {
          id: 'ref1', card_id: 'card-uuid', document_id: 'doc1', file_name: 'paper.pdf',
          chunk_id: null, chunk_index: null, chunk_type: 'content',
          snippet: 'evidence text', score: 0.9, created_at: '2024-01-01',
        },
      ]),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    const res = await app.request('/api/research-cards', {
      method: 'POST',
      body: JSON.stringify({
        knowledgeBaseId: 'kb1',
        question: 'What is RAG?',
        coreClaims: ['claim1'],
        knowledgeType: 'method',
        tags: ['rag'],
        validationNotes: 'verified',
        useCases: ['review'],
        evidenceRefs: [
          { documentId: 'doc1', fileName: 'paper.pdf', snippet: 'evidence text', score: 0.9 },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.question).toBe('What is RAG?')
    expect(body.coreClaims).toEqual(['claim1'])
    expect(body.knowledgeType).toBe('method')
    expect(body.evidenceRefs).toHaveLength(1)
    expect(body.evidenceRefs[0].documentId).toBe('doc1')

    // Verify storage calls — card+refs created in a single transaction
    expect(storage.createResearchCardWithRefs).toHaveBeenCalledTimes(1)
    expect(storage.upsertResearchCardVectorIndex).toHaveBeenCalledTimes(1)
  })

  it('POST / returns 400 when required fields missing', async () => {
    const storage = createMockStorage()
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    const res = await app.request('/api/research-cards', {
      method: 'POST',
      body: JSON.stringify({ question: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  // ── GET /knowledge-base/:kbId ──────────────────────────────────────

  it('GET /knowledge-base/:kbId lists saved cards with filters', async () => {
    const storage = createMockStorage({
      listResearchCards: vi.fn(() => [
        {
          id: 'card1', knowledge_base_id: 'kb1', question: 'What is RAG?',
          core_claims: '["claim1"]', knowledge_type: 'method', tags: '["rag"]',
          sub_direction: null, validation_notes: '', use_cases: '[]',
          linked_doc_ids: '[]', answer_mode: null, source_message_id: null,
          status: 'saved', no_paper_evidence: 0,
          created_at: '2024-01-01', updated_at: '2024-01-01',
        },
      ]),
      getResearchCardEvidenceRefs: vi.fn(() => []),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    const res = await app.request('/api/research-cards/knowledge-base/kb1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].question).toBe('What is RAG?')
    expect(body[0].coreClaims).toEqual(['claim1'])
    expect(body[0].knowledgeType).toBe('method')

    // Verify filter was passed
    expect(storage.listResearchCards).toHaveBeenCalledWith({
      knowledgeBaseId: 'kb1',
      status: undefined,
      knowledgeType: undefined,
      tag: undefined,
      documentId: undefined,
    })
  })

  it('GET /knowledge-base/:kbId passes query filters', async () => {
    const storage = createMockStorage({
      listResearchCards: vi.fn(() => []),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    await app.request('/api/research-cards/knowledge-base/kb1?status=draft&knowledgeType=method&tag=rag')

    expect(storage.listResearchCards).toHaveBeenCalledWith({
      knowledgeBaseId: 'kb1',
      status: 'draft',
      knowledgeType: 'method',
      tag: 'rag',
      documentId: undefined,
    })
  })

  // ── PATCH /:id ─────────────────────────────────────────────────────

  it('PATCH /:id updates card and replaces refs', async () => {
    let callCount = 0
    const storage = createMockStorage({
      getResearchCard: vi.fn(() => {
        callCount++
        if (callCount === 1) {
          // First call: card exists check
          return {
            id: 'card1', knowledge_base_id: 'kb1', question: 'q',
            core_claims: '["old claim"]', knowledge_type: 'method', tags: '["rag"]',
            sub_direction: null, validation_notes: '', use_cases: '[]',
            linked_doc_ids: '[]', answer_mode: null, source_message_id: null,
            status: 'saved', no_paper_evidence: 0,
            created_at: '2024-01-01', updated_at: '2024-01-01',
          }
        }
        // Second call: return updated card
        return {
          id: 'card1', knowledge_base_id: 'kb1', question: 'q',
          core_claims: '["updated claim"]', knowledge_type: 'finding', tags: '["rag"]',
          sub_direction: null, validation_notes: '', use_cases: '[]',
          linked_doc_ids: '[]', answer_mode: null, source_message_id: null,
          status: 'saved', no_paper_evidence: 0,
          created_at: '2024-01-01', updated_at: '2024-01-02',
        }
      }),
      getResearchCardEvidenceRefs: vi.fn(() => [
        {
          id: 'ref2', card_id: 'card1', document_id: 'doc2', file_name: 'new.pdf',
          chunk_id: null, chunk_index: null, chunk_type: 'content',
          snippet: 'new evidence', score: 0.8, created_at: '2024-01-02',
        },
      ]),
      getResearchCardVectorIndexes: vi.fn(() => []),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    const res = await app.request('/api/research-cards/card1', {
      method: 'PATCH',
      body: JSON.stringify({
        coreClaims: ['updated claim'],
        knowledgeType: 'finding',
        evidenceRefs: [
          { documentId: 'doc2', fileName: 'new.pdf', snippet: 'new evidence', score: 0.8 },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.coreClaims).toEqual(['updated claim'])

    // Verify storage calls
    expect(storage.updateResearchCard).toHaveBeenCalledWith('card1', expect.objectContaining({
      knowledgeType: 'finding',
    }))
    expect(storage.replaceResearchCardEvidenceRefs).toHaveBeenCalledWith('card1', expect.any(Array))
  })

  it('PATCH /:id returns 404 for nonexistent card', async () => {
    const storage = createMockStorage()
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    const res = await app.request('/api/research-cards/nonexistent', {
      method: 'PATCH',
      body: JSON.stringify({ knowledgeType: 'finding' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(404)
  })

  // ── DELETE /:id ────────────────────────────────────────────────────

  it('DELETE /:id archives card', async () => {
    const storage = createMockStorage({
      getResearchCard: vi.fn(() => ({
        id: 'card1', knowledge_base_id: 'kb1', question: 'q',
        core_claims: '[]', knowledge_type: 'method', tags: '[]',
        sub_direction: null, validation_notes: '', use_cases: '[]',
        linked_doc_ids: '[]', answer_mode: null, source_message_id: null,
        status: 'saved', no_paper_evidence: 0,
        created_at: '2024-01-01', updated_at: '2024-01-01',
      })),
    })
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    const res = await app.request('/api/research-cards/card1', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(storage.archiveResearchCard).toHaveBeenCalledWith('card1')
  })

  it('DELETE /:id returns 404 for nonexistent card', async () => {
    const storage = createMockStorage()
    const python = createMockPython()
    const app = new Hono()
    app.route('/api/research-cards', researchCardRoutes(storage as any, python as any))

    const res = await app.request('/api/research-cards/nonexistent', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
