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

  it('openSession sets error and rethrows on failure', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('not found'))

    await expect(useQAStore.getState().openSession('bad-id')).rejects.toThrow('not found')

    expect(useQAStore.getState().sessionsError).toBe('not found')
  })
})
