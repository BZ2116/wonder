import { create } from 'zustand'
import { api } from '../services/api'

interface QASources {
  docIds: string[]
  chunks: string[]
}

interface QAMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: QASources
  created_at?: string
}

interface QASessionSummary {
  id: string
  title: string
  scope_type: string
  scope_ids: string
  updated_at: string
}

interface QAState {
  // Session list
  sessions: QASessionSummary[]
  sessionsLoading: boolean
  sessionsError: string | null

  // Current session
  sessionId: string | null
  sessionScope: { type: string; ids: string[] }
  messages: QAMessage[]
  loading: boolean
  saving: boolean

  // Actions
  loadSessions: () => Promise<void>
  createSession: (title: string, scopeType: string, scopeIds: string[]) => Promise<string>
  openSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  sendMessage: (question: string) => Promise<void>
  clear: () => void
}

export const useQAStore = create<QAState>((set, get) => ({
  sessions: [],
  sessionsLoading: false,
  sessionsError: null,
  sessionId: null,
  sessionScope: { type: 'all', ids: [] },
  messages: [],
  loading: false,
  saving: false,

  loadSessions: async () => {
    set({ sessionsLoading: true, sessionsError: null })
    try {
      const sessions = await api.get<QASessionSummary[]>('/api/qa/sessions')
      set({ sessions, sessionsLoading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ sessionsLoading: false, sessionsError: msg })
    }
  },

  createSession: async (title, scopeType, scopeIds) => {
    try {
      const session = await api.post<QASessionSummary & { id: string }>('/api/qa/sessions', {
        title,
        scopeType,
        scopeIds,
      })
      set(state => ({
        sessions: [session, ...state.sessions],
        sessionId: session.id,
        sessionScope: { type: scopeType, ids: scopeIds },
        messages: [],
      }))
      return session.id
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ sessionsError: msg })
      throw err
    }
  },

  openSession: async (id) => {
    try {
      const data = await api.get<QASessionSummary & { messages: QAMessage[] }>(`/api/qa/sessions/${id}`)
      set({
        sessionId: data.id,
        sessionScope: { type: data.scope_type, ids: JSON.parse(data.scope_ids) },
        messages: data.messages.map(m => ({
          ...m,
          sources: m.sources ? (typeof m.sources === 'string' ? JSON.parse(m.sources) : m.sources) : undefined,
        })),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ sessionsError: msg })
      throw err
    }
  },

  deleteSession: async (id) => {
    try {
      await api.delete(`/api/qa/sessions/${id}`)
      set(state => {
        const sessions = state.sessions.filter(s => s.id !== id)
        const isCurrent = state.sessionId === id
        return {
          sessions,
          ...(isCurrent ? { sessionId: null, messages: [], sessionScope: { type: 'all', ids: [] } } : {}),
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ sessionsError: msg })
      throw err
    }
  },

  sendMessage: async (question) => {
    const { sessionId } = get()
    if (!sessionId) return
    if (get().loading) return

    set(state => ({
      messages: [...state.messages, { id: `tmp-${Date.now()}`, role: 'user', content: question }],
      loading: true,
    }))

    try {
      const signal = AbortSignal.timeout(60000)
      const res = await api.post<{
        userMessage: QAMessage
        assistantMessage: QAMessage
      }>(`/api/qa/sessions/${sessionId}/messages`, { question }, signal)

      set(state => {
        const msgs = state.messages.slice(0, -1)
        return {
          messages: [...msgs, res.userMessage, res.assistantMessage],
          loading: false,
        }
      })
    } catch (err) {
      const errorMsg = err instanceof Error
        ? (err.name === 'AbortError' ? '请求超时，请稍后重试' : err.message)
        : '请求失败'
      set(state => ({
        loading: false,
        messages: state.messages.filter(m => !m.id.startsWith('tmp-')),
      }))
      throw new Error(errorMsg)
    }
  },

  clear: () => set({ sessionId: null, sessionScope: { type: 'all', ids: [] }, messages: [] }),
}))
