import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDiscoveryStore } from '../discovery'
import type { DiscoveryContext, DiscoveryCandidate } from '../../types/discovery'

// Mock the api module
vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '../../services/api'
const mockApi = vi.mocked(api)

const mockCandidate: DiscoveryCandidate = {
  id: 'c1',
  paperId: 'test-123',
  title: 'Test Paper',
  abstract: 'Test abstract',
  year: 2024,
  citationCount: 100,
  authors: [{ authorId: 'a1', name: 'Author 1' }],
  sourceQuery: 'test query',
  discoveryPriorityScore: 75,
  discoveryReason: '标题匹配: test',
  state: 'saved',
  knowledgeBaseId: null,
}

const mockContext: DiscoveryContext = {
  mode: 'manual',
  name: 'Test Topic',
  keywords: ['test', 'topic'],
}

const serverCandidate = {
  id: 'c1',
  paper_id: 'test-123',
  title: 'Test Paper',
  abstract: 'Test abstract',
  year: 2024,
  citation_count: 100,
  influential_citation_count: 0,
  venue: null,
  authors: JSON.stringify([{ authorId: 'a1', name: 'Author 1' }]),
  url: null,
  source_query: 'test query',
  discovery_priority_score: 75,
  discovery_reason: '标题匹配: test',
  state: 'saved',
  knowledge_base_id: null,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
}

describe('useDiscoveryStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDiscoveryStore.setState({
      discoveryContext: null,
      searchResults: [],
      searchLoading: false,
      hasSearched: false,
      searchError: null,
      candidateQueue: [],
      candidatesLoading: false,
      candidatesError: null,
    })
  })

  it('should set and clear discovery context', () => {
    const { setDiscoveryContext, clearDiscoveryContext } = useDiscoveryStore.getState()

    setDiscoveryContext(mockContext)
    expect(useDiscoveryStore.getState().discoveryContext).toEqual(mockContext)

    clearDiscoveryContext()
    expect(useDiscoveryStore.getState().discoveryContext).toBeNull()
  })

  it('should load candidates from API', async () => {
    mockApi.get.mockResolvedValueOnce([serverCandidate])

    await useDiscoveryStore.getState().loadCandidates()

    expect(mockApi.get).toHaveBeenCalledWith('/api/discovery/candidates')
    const { candidateQueue } = useDiscoveryStore.getState()
    expect(candidateQueue).toHaveLength(1)
    expect(candidateQueue[0].paperId).toBe('test-123')
    expect(candidateQueue[0].state).toBe('saved')
  })

  it('should load candidates filtered by knowledgeBaseId', async () => {
    mockApi.get.mockResolvedValueOnce([])

    await useDiscoveryStore.getState().loadCandidates('kb-1')

    expect(mockApi.get).toHaveBeenCalledWith('/api/discovery/candidates?knowledgeBaseId=kb-1')
  })

  it('should save candidate via API and reload', async () => {
    mockApi.post.mockResolvedValueOnce({})
    mockApi.get.mockResolvedValueOnce([serverCandidate])

    await useDiscoveryStore.getState().saveCandidate(mockCandidate)

    expect(mockApi.post).toHaveBeenCalledWith('/api/discovery/candidates', expect.objectContaining({
      paperId: 'test-123',
      title: 'Test Paper',
      state: 'saved',
    }))
  })

  it('should update candidate state via API', async () => {
    useDiscoveryStore.setState({ candidateQueue: [mockCandidate] })
    mockApi.patch.mockResolvedValueOnce({})

    await useDiscoveryStore.getState().updateCandidateState('c1', 'ignored')

    expect(mockApi.patch).toHaveBeenCalledWith('/api/discovery/candidates/c1', { state: 'ignored' })
    expect(useDiscoveryStore.getState().candidateQueue[0].state).toBe('ignored')
  })

  it('should remove candidate via API', async () => {
    useDiscoveryStore.setState({ candidateQueue: [mockCandidate] })
    mockApi.delete.mockResolvedValueOnce({})

    await useDiscoveryStore.getState().removeCandidate('c1')

    expect(mockApi.delete).toHaveBeenCalledWith('/api/discovery/candidates/c1')
    expect(useDiscoveryStore.getState().candidateQueue).toHaveLength(0)
  })

  it('should check if candidate is in queue', () => {
    useDiscoveryStore.setState({ candidateQueue: [mockCandidate] })

    expect(useDiscoveryStore.getState().isInQueue('test-123')).toBe(true)
    expect(useDiscoveryStore.getState().isInQueue('non-existent')).toBe(false)
  })

  it('should get candidate by paperId', () => {
    useDiscoveryStore.setState({ candidateQueue: [mockCandidate] })

    const candidate = useDiscoveryStore.getState().getCandidate('test-123')
    expect(candidate?.paperId).toBe('test-123')

    const nonExistent = useDiscoveryStore.getState().getCandidate('non-existent')
    expect(nonExistent).toBeUndefined()
  })

  it('should search papers via API', async () => {
    mockApi.get.mockResolvedValueOnce({
      total: 1,
      papers: [{ paperId: 'p1', title: 'Result' }],
    })

    await useDiscoveryStore.getState().searchPapers('RAG')

    expect(mockApi.get).toHaveBeenCalledWith('/api/discovery/search?q=RAG&limit=20')
    expect(useDiscoveryStore.getState().searchResults).toHaveLength(1)
  })

  it('sets searchError when searchPapers fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('rate limited'))

    await useDiscoveryStore.getState().searchPapers('test')

    expect(useDiscoveryStore.getState().searchLoading).toBe(false)
    expect(useDiscoveryStore.getState().hasSearched).toBe(true)
    expect(useDiscoveryStore.getState().searchError).toBe('rate limited')
    expect(useDiscoveryStore.getState().searchResults).toEqual([])
  })

  it('sets candidatesError when loadCandidates fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('unauthorized'))

    await useDiscoveryStore.getState().loadCandidates()

    expect(useDiscoveryStore.getState().candidatesLoading).toBe(false)
    expect(useDiscoveryStore.getState().candidatesError).toBe('unauthorized')
  })
})
