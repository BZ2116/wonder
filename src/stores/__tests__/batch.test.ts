import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useBatchStore } from '../batch'
import { api } from '../../services/api'

const mockApi = vi.mocked(api)

describe('useBatchStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBatchStore.setState({
      runId: null,
      runName: '',
      items: [],
      running: false,
      matrixRows: [],
      matrixLoading: false,
      runs: [],
      runsLoading: false,
      runsError: null,
    })
  })

  it('sets runsError when loadRuns fails', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('service unavailable'))

    await useBatchStore.getState().loadRuns()

    expect(useBatchStore.getState().runsLoading).toBe(false)
    expect(useBatchStore.getState().runsError).toBe('service unavailable')
  })

  it('clears runsError on successful loadRuns', async () => {
    useBatchStore.setState({ runsError: 'old error' })
    mockApi.get.mockResolvedValueOnce([])

    await useBatchStore.getState().loadRuns()

    expect(useBatchStore.getState().runsError).toBeNull()
  })

  it('keeps generated matrix rows in store until reset', () => {
    const rows = [{
      documentId: 'doc-1',
      fileName: 'paper.pdf',
      research_question: 'question',
      method: 'method',
      dataset: 'dataset',
      metrics: 'metrics',
      innovation: 'innovation',
      limitation: 'limitation',
      reusable_idea: 'idea',
    }]

    useBatchStore.getState().setMatrixRows(rows)

    expect(useBatchStore.getState().matrixRows).toEqual(rows)
  })

  it('clears matrix state when the user starts a new batch', () => {
    useBatchStore.setState({
      runId: 'run-1',
      runName: 'old batch',
      matrixRows: [{
        documentId: 'doc-1',
        fileName: 'paper.pdf',
        research_question: 'question',
        method: 'method',
        dataset: 'dataset',
        metrics: 'metrics',
        innovation: 'innovation',
        limitation: 'limitation',
        reusable_idea: 'idea',
      }],
      matrixLoading: true,
    })

    useBatchStore.getState().reset()

    expect(useBatchStore.getState().runId).toBeNull()
    expect(useBatchStore.getState().matrixRows).toEqual([])
    expect(useBatchStore.getState().matrixLoading).toBe(false)
  })
})
