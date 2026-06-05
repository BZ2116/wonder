import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { useQAStore } from '../qa'
import { api } from '../../services/api'

const mockApi = vi.mocked(api)

describe('useQAStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useQAStore.setState({
      sessions: [],
      sessionsLoading: false,
      sessionsError: null,
      sessionId: null,
      sessionScope: { type: 'all', ids: [] },
      messages: [],
      loading: false,
      saving: false,
    })
  })

  it('sets sessionsError when loadSessions fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('network down'))

    await useQAStore.getState().loadSessions()

    expect(useQAStore.getState().sessionsLoading).toBe(false)
    expect(useQAStore.getState().sessionsError).toBe('network down')
  })

  it('sendMessage is a no-op when loading is true', async () => {
    useQAStore.setState({ sessionId: 's1', loading: true })

    await useQAStore.getState().sendMessage('hello')

    expect(mockApi.post).not.toHaveBeenCalled()
  })

  it('sendMessage passes AbortSignal.timeout to api.post', async () => {
    useQAStore.setState({
      sessionId: 's1',
      messages: [],
      loading: false,
    })
    mockApi.post.mockResolvedValueOnce({
      userMessage: { id: 'u1', role: 'user', content: 'hello' },
      assistantMessage: { id: 'a1', role: 'assistant', content: 'hi' },
    })

    await useQAStore.getState().sendMessage('hello')

    expect(mockApi.post).toHaveBeenCalledWith(
      '/api/qa/sessions/s1/messages',
      { question: 'hello' },
      expect.any(AbortSignal),
    )
  })

  it('sendMessage posts mentionedDocIds when provided', async () => {
    useQAStore.setState({
      sessionId: 's1',
      messages: [],
      loading: false,
    })
    mockApi.post.mockResolvedValueOnce({
      userMessage: { id: 'u1', role: 'user', content: 'q' },
      assistantMessage: { id: 'a1', role: 'assistant', content: 'a' },
    })

    await useQAStore.getState().sendMessage('q', ['doc-1'])

    expect(mockApi.post).toHaveBeenCalledWith(
      '/api/qa/sessions/s1/messages',
      { question: 'q', mentionedDocIds: ['doc-1'] },
      expect.any(AbortSignal),
    )
  })

  it('sendMessage posts legacy payload without mentionedDocIds', async () => {
    useQAStore.setState({
      sessionId: 's1',
      messages: [],
      loading: false,
    })
    mockApi.post.mockResolvedValueOnce({
      userMessage: { id: 'u1', role: 'user', content: 'q' },
      assistantMessage: { id: 'a1', role: 'assistant', content: 'a' },
    })

    await useQAStore.getState().sendMessage('q')

    expect(mockApi.post).toHaveBeenCalledWith(
      '/api/qa/sessions/s1/messages',
      { question: 'q' },
      expect.any(AbortSignal),
    )
  })

  it('sendMessage handles timeout error', async () => {
    useQAStore.setState({
      sessionId: 's1',
      messages: [],
      loading: false,
    })
    const abortErr = new Error('The operation was aborted')
    abortErr.name = 'AbortError'
    mockApi.post.mockRejectedValueOnce(abortErr)

    await expect(useQAStore.getState().sendMessage('hello')).rejects.toThrow('请求超时，请稍后重试')
    expect(useQAStore.getState().loading).toBe(false)
  })

  it('createSession sets error and rethrows on failure', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('duplicate'))

    await expect(useQAStore.getState().createSession('dup', 'all', [])).rejects.toThrow('duplicate')

    expect(useQAStore.getState().sessionsError).toBe('duplicate')
  })

  it('deleteSession sets error and rethrows on failure', async () => {
    mockApi.delete.mockRejectedValueOnce(new Error('not found'))

    await expect(useQAStore.getState().deleteSession('bad-id')).rejects.toThrow('not found')

    expect(useQAStore.getState().sessionsError).toBe('not found')
  })

  it('openSession parses legacy sources without refs', async () => {
    mockApi.get.mockResolvedValueOnce({
      id: 's1',
      title: 'Test',
      scope_type: 'all',
      scope_ids: '[]',
      updated_at: '2024-01-01',
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          content: 'answer',
          sources: '{"docIds":["doc-1"],"chunks":["chunk"]}',
        },
      ],
    })

    await useQAStore.getState().openSession('s1')

    const messages = useQAStore.getState().messages
    expect(messages).toHaveLength(1)
    expect(messages[0].sources?.docIds).toEqual(['doc-1'])
    expect(messages[0].sources?.chunks).toEqual(['chunk'])
    expect(messages[0].sources?.refs).toBeUndefined()
    expect(messages[0].sources?.answerMode).toBeUndefined()
  })

  it('openSession sets error and rethrows on failure', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('not found'))

    await expect(useQAStore.getState().openSession('bad-id')).rejects.toThrow('not found')

    expect(useQAStore.getState().sessionsError).toBe('not found')
  })

  it('opens legacy qa session sources while research card fields exist', async () => {
    mockApi.get.mockResolvedValueOnce({
      id: 's1',
      title: 'Test',
      scope_type: 'knowledge_base',
      scope_ids: '["kb1"]',
      updated_at: '2024-01-01',
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          content: 'answer',
          sources: JSON.stringify({
            docIds: ['doc-1'],
            chunks: ['chunk'],
            refs: [
              { doc_id: 'doc-1', file_name: 'paper.pdf', chunk_type: 'content', content: 'text', score: 0.9 },
            ],
            answerMode: 'rag_enhanced',
          }),
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'second answer',
          sources: JSON.stringify({
            docIds: [],
            chunks: [],
            refs: [
              { item_type: 'research_card', card_id: 'card-1', doc_id: '', file_name: 'Research card', chunk_type: 'card', content: 'card content', score: 0.95 },
            ],
            answerMode: 'rag_enhanced',
          }),
        },
      ],
    })

    await useQAStore.getState().openSession('s1')

    const messages = useQAStore.getState().messages
    expect(messages).toHaveLength(2)
    // First message: paper ref only
    expect(messages[0].sources?.docIds).toEqual(['doc-1'])
    expect(messages[0].sources?.refs).toHaveLength(1)
    expect(messages[0].sources?.refs?.[0].chunk_type).toBe('content')
    expect(messages[0].sources?.answerMode).toBe('rag_enhanced')
    // Second message: card ref (research card field exists in sources)
    expect(messages[1].sources?.refs).toHaveLength(1)
    expect(messages[1].sources?.refs?.[0].chunk_type).toBe('card')
  })

  it('draftResearchCard posts session and message id', async () => {
    useQAStore.setState({ sessionId: 's1' } as any)
    mockApi.post.mockResolvedValueOnce({
      question: 'q',
      coreClaims: ['claim'],
      knowledgeType: 'method',
      tags: ['rag'],
    })

    await useQAStore.getState().draftResearchCard('m1', 'kb1')

    expect(mockApi.post).toHaveBeenCalledWith('/api/research-cards/draft-from-qa', {
      sessionId: 's1',
      messageId: 'm1',
      knowledgeBaseId: 'kb1',
    })
  })

  it('draftResearchCard normalizes snake_case response', async () => {
    useQAStore.setState({ sessionId: 's1' } as any)
    mockApi.post.mockResolvedValueOnce({
      question: 'q',
      core_claims: ['c1'],
      knowledge_type: 'theory',
      tags: [],
      sub_direction: 'sub',
      validation_notes: 'note',
      use_cases: ['uc'],
      linked_doc_ids: ['d1'],
      answer_mode: 'rag_enhanced',
      no_paper_evidence: true,
      evidence_refs: [{ documentId: 'd1', fileName: 'f.pdf', chunkId: null, chunkIndex: null, chunkType: 'content', snippet: 's', score: 0.9 }],
    })

    const draft = await useQAStore.getState().draftResearchCard('m1')

    expect(draft.coreClaims).toEqual(['c1'])
    expect(draft.knowledgeType).toBe('theory')
    expect(draft.noPaperEvidence).toBe(true)
    expect(draft.evidenceRefs).toHaveLength(1)
  })

  it('draftResearchCard throws when no session', async () => {
    useQAStore.setState({ sessionId: null } as any)

    await expect(useQAStore.getState().draftResearchCard('m1')).rejects.toThrow('No QA session selected')
  })

  it('searchMentions requests documents when query is empty', async () => {
    mockApi.get.mockResolvedValueOnce([
      { id: 'doc-1', fileName: 'paper.pdf', title: 'Paper Title', authors: 'A', year: 2024, knowledgeBaseId: 'kb1', indexedStatus: 'indexed', metadataStatus: 'complete' },
    ])

    await useQAStore.getState().searchMentions('', { knowledgeBaseId: 'kb1' })

    expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge/documents/search?q=&knowledgeBaseId=kb1&limit=20')
    expect(useQAStore.getState().mentionSearchResults).toEqual([
      expect.objectContaining({ id: 'doc-1', fileName: 'paper.pdf', title: 'Paper Title' }),
    ])
  })

  it('searchMentions requests KB-scoped documents for bare @', async () => {
    mockApi.get.mockResolvedValueOnce([
      { id: 'doc-1', fileName: 'paper.pdf', title: 'Paper Title', authors: ['A'], year: 2024, knowledgeBaseId: 'kb1', indexedStatus: 'indexed', metadataStatus: 'complete' },
    ])

    await useQAStore.getState().searchMentions('', { knowledgeBaseId: 'kb1' })

    expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge/documents/search?q=&knowledgeBaseId=kb1&limit=20')
    expect(useQAStore.getState().mentionSearchResults[0].title).toBe('Paper Title')
  })

  it('searchMentions encodes non-empty query', async () => {
    mockApi.get.mockResolvedValueOnce([])

    await useQAStore.getState().searchMentions('attention model', { knowledgeBaseId: 'kb1' })

    expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge/documents/search?q=attention%20model&knowledgeBaseId=kb1&limit=20')
  })

  it('sendMessage clears mentions on success', async () => {
    useQAStore.setState({
      sessionId: 's1',
      messages: [],
      loading: false,
      mentionedDocs: [{ id: 'doc-1', fileName: 'paper.pdf', title: 'Paper Title' }],
    })
    mockApi.post.mockResolvedValueOnce({
      userMessage: { id: 'u1', role: 'user', content: 'q' },
      assistantMessage: { id: 'a1', role: 'assistant', content: 'a' },
    })

    await useQAStore.getState().sendMessage('q', ['doc-1'])

    expect(useQAStore.getState().mentionedDocs).toEqual([])
  })

  it('sendMessage preserves mentions on failure', async () => {
    useQAStore.setState({
      sessionId: 's1',
      messages: [],
      loading: false,
      mentionedDocs: [{ id: 'doc-1', fileName: 'paper.pdf', title: 'Paper Title' }],
    })
    mockApi.post.mockRejectedValueOnce(new Error('network error'))

    await expect(useQAStore.getState().sendMessage('q', ['doc-1'])).rejects.toThrow()

    expect(useQAStore.getState().mentionedDocs).toEqual([
      expect.objectContaining({ id: 'doc-1' }),
    ])
  })

  it('saveResearchCard posts reviewed draft', async () => {
    const draft = {
      knowledgeBaseId: 'kb1',
      question: 'q',
      coreClaims: ['claim'],
      knowledgeType: 'method' as const,
      tags: ['rag'],
      subDirection: null,
      validationNotes: 'verify',
      useCases: ['review'],
      linkedDocIds: ['doc1'],
      noPaperEvidence: false,
      evidenceRefs: [],
    }

    await useQAStore.getState().saveResearchCard(draft)

    expect(mockApi.post).toHaveBeenCalledWith('/api/research-cards', draft)
  })
})
