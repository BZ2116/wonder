import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useKnowledgeStore } from '../knowledge'
import { api } from '../../services/api'

const mockApi = vi.mocked(api)

describe('useKnowledgeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useKnowledgeStore.setState({
      documents: [],
      loading: false,
      kbDocuments: [],
      kbDocsLoading: false,
      error: null,
      kbLoaded: false,
      saving: false,
      knowledgeBases: [],
    })
  })

  it('resets legacy document loading when loadDocuments fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('network down'))

    await expect(useKnowledgeStore.getState().loadDocuments()).resolves.toBeUndefined()

    expect(useKnowledgeStore.getState().loading).toBe(false)
    expect(useKnowledgeStore.getState().documents).toEqual([])
  })

  it('resets kb document loading and sets error when loadKBDocuments fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('network down'))

    await expect(useKnowledgeStore.getState().loadKBDocuments('kb-1')).resolves.toBeUndefined()

    expect(useKnowledgeStore.getState().kbDocsLoading).toBe(false)
    expect(useKnowledgeStore.getState().kbDocuments).toEqual([])
    expect(useKnowledgeStore.getState().error).toBe('network down')
  })

  it('sets error when loadKnowledgeBases fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('server down'))

    await useKnowledgeStore.getState().loadKnowledgeBases()

    expect(useKnowledgeStore.getState().kbLoading).toBe(false)
    expect(useKnowledgeStore.getState().error).toBe('server down')
  })

  it('sets error and rethrows when createKnowledgeBase fails', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('duplicate name'))

    await expect(useKnowledgeStore.getState().createKnowledgeBase('dup')).rejects.toThrow('duplicate name')

    expect(useKnowledgeStore.getState().error).toBe('duplicate name')
  })

  it('sets error and rethrows when updateKnowledgeBase fails', async () => {
    mockApi.patch.mockRejectedValueOnce(new Error('not found'))

    await expect(useKnowledgeStore.getState().updateKnowledgeBase('bad-id', { name: 'x' })).rejects.toThrow('not found')

    expect(useKnowledgeStore.getState().error).toBe('not found')
  })

  it('sets error when loadReadmeSuggestions fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('timeout'))

    await useKnowledgeStore.getState().loadReadmeSuggestions('kb-1')

    expect(useKnowledgeStore.getState().error).toBe('timeout')
  })

  it('sets error and rethrows when deleteKnowledgeBase fails', async () => {
    mockApi.delete.mockRejectedValueOnce(new Error('not found'))

    await expect(useKnowledgeStore.getState().deleteKnowledgeBase('bad-id')).rejects.toThrow('not found')

    expect(useKnowledgeStore.getState().error).toBe('not found')
    expect(useKnowledgeStore.getState().saving).toBe(false)
  })

  it('sets error when loadDocuments fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('server down'))

    await useKnowledgeStore.getState().loadDocuments()

    expect(useKnowledgeStore.getState().loading).toBe(false)
    expect(useKnowledgeStore.getState().documents).toEqual([])
    expect(useKnowledgeStore.getState().error).toBe('server down')
  })

  it('reindexDocument waits for the refreshed KB document list', async () => {
    let resolveDocs: (value: unknown[]) => void = () => {}
    mockApi.post.mockResolvedValueOnce({ success: true })
    mockApi.get.mockReturnValueOnce(new Promise(resolve => { resolveDocs = resolve }))

    let completed = false
    const reindexPromise = useKnowledgeStore.getState().reindexDocument('kb-1', 'doc-1')
      .then(() => { completed = true })

    await Promise.resolve()
    await Promise.resolve()

    expect(completed).toBe(false)

    resolveDocs([
      { id: 'doc-1', index_status: 'indexed', collection_name: 'documents__test', chunk_count: 2 },
    ])
    await reindexPromise

    expect(mockApi.post).toHaveBeenCalledWith('/api/knowledge-bases/kb-1/documents/doc-1/reindex')
    expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge-bases/kb-1/documents')
    expect(useKnowledgeStore.getState().kbDocuments).toEqual([
      { id: 'doc-1', index_status: 'indexed', collection_name: 'documents__test', chunk_count: 2 },
    ])
  })

  describe('kbLoaded caching', () => {
    it('skips API call when kbLoaded is true and list is non-empty', async () => {
      useKnowledgeStore.setState({
        kbLoaded: true,
        knowledgeBases: [{ id: 'kb-1', name: 'Test', documentCount: 5 }] as any,
      })

      await useKnowledgeStore.getState().loadKnowledgeBases()

      expect(mockApi.get).not.toHaveBeenCalled()
    })

    it('calls API when kbLoaded is false', async () => {
      mockApi.get.mockResolvedValueOnce([{ id: 'kb-1', name: 'Test', documentCount: 5 }])

      await useKnowledgeStore.getState().loadKnowledgeBases()

      expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge-bases')
      expect(useKnowledgeStore.getState().kbLoaded).toBe(true)
    })

    it('calls API when kbLoaded is true but list is empty', async () => {
      useKnowledgeStore.setState({ kbLoaded: true, knowledgeBases: [] })
      mockApi.get.mockResolvedValueOnce([{ id: 'kb-1', name: 'Test', documentCount: 5 }])

      await useKnowledgeStore.getState().loadKnowledgeBases()

      expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge-bases')
    })
  })

  describe('research cards', () => {
    beforeEach(() => {
      useKnowledgeStore.setState({
        researchCards: [],
        researchCardsLoading: false,
        researchCardFilters: {},
      })
    })

    it('loadResearchCards loads cards for selected knowledge base', async () => {
      const cards = [{ id: 'card1', knowledgeBaseId: 'kb1', knowledgeType: 'method' }]
      mockApi.get.mockResolvedValueOnce(cards)

      await useKnowledgeStore.getState().loadResearchCards('kb1', { knowledgeType: 'method' })

      expect(mockApi.get).toHaveBeenCalledWith('/api/research-cards/knowledge-base/kb1?knowledgeType=method')
      expect(useKnowledgeStore.getState().researchCards).toEqual(cards)
      expect(useKnowledgeStore.getState().researchCardsLoading).toBe(false)
      expect(useKnowledgeStore.getState().researchCardFilters).toEqual({ knowledgeType: 'method' })
    })

    it('loadResearchCards loads cards without filters', async () => {
      mockApi.get.mockResolvedValueOnce([])

      await useKnowledgeStore.getState().loadResearchCards('kb1')

      expect(mockApi.get).toHaveBeenCalledWith('/api/research-cards/knowledge-base/kb1')
      expect(useKnowledgeStore.getState().researchCards).toEqual([])
    })

    it('loadResearchCards handles multiple filters', async () => {
      mockApi.get.mockResolvedValueOnce([])

      await useKnowledgeStore.getState().loadResearchCards('kb1', { knowledgeType: 'finding', tag: 'ai' })

      expect(mockApi.get).toHaveBeenCalledWith('/api/research-cards/knowledge-base/kb1?knowledgeType=finding&tag=ai')
    })

    it('loadResearchCards sets error on failure', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('network error'))

      await useKnowledgeStore.getState().loadResearchCards('kb1')

      expect(useKnowledgeStore.getState().researchCardsLoading).toBe(false)
      expect(useKnowledgeStore.getState().error).toBe('network error')
    })

    it('updateResearchCard patches card and updates local state', async () => {
      useKnowledgeStore.setState({
        researchCards: [{ id: 'card1', coreClaims: ['old claim'], tags: [] }] as any,
      })
      mockApi.patch.mockResolvedValueOnce({})

      await useKnowledgeStore.getState().updateResearchCard('card1', { coreClaims: ['new claim'] })

      expect(mockApi.patch).toHaveBeenCalledWith('/api/research-cards/card1', { coreClaims: ['new claim'] })
      expect(useKnowledgeStore.getState().researchCards[0].coreClaims).toEqual(['new claim'])
    })

    it('updateResearchCard throws on failure', async () => {
      mockApi.patch.mockRejectedValueOnce(new Error('not found'))

      await expect(useKnowledgeStore.getState().updateResearchCard('bad-id', {})).rejects.toThrow('not found')

      expect(useKnowledgeStore.getState().error).toBe('not found')
    })

    it('archiveResearchCard removes card from local list', async () => {
      useKnowledgeStore.setState({ researchCards: [{ id: 'card1' }] as any })
      mockApi.delete.mockResolvedValueOnce({})

      await useKnowledgeStore.getState().archiveResearchCard('card1')

      expect(mockApi.delete).toHaveBeenCalledWith('/api/research-cards/card1')
      expect(useKnowledgeStore.getState().researchCards).toHaveLength(0)
    })

    it('archiveResearchCard throws on failure', async () => {
      useKnowledgeStore.setState({ researchCards: [{ id: 'card1' }] as any })
      mockApi.delete.mockRejectedValueOnce(new Error('server error'))

      await expect(useKnowledgeStore.getState().archiveResearchCard('card1')).rejects.toThrow('server error')

      expect(useKnowledgeStore.getState().error).toBe('server error')
      expect(useKnowledgeStore.getState().researchCards).toHaveLength(1)
    })

    it('selectKB clears research cards', () => {
      useKnowledgeStore.setState({
        researchCards: [{ id: 'card1' }] as any,
        researchCardFilters: { knowledgeType: 'method' },
      })

      useKnowledgeStore.getState().selectKB('new-kb')

      expect(useKnowledgeStore.getState().researchCards).toEqual([])
      expect(useKnowledgeStore.getState().researchCardFilters).toEqual({})
    })
  })
})
