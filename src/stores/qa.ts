import { create } from 'zustand'
import { api } from '../services/api'
import type { ResearchCardDraft } from '../types/research-card'

export type AnswerMode = 'general' | 'rag_enhanced' | 'mentioned_docs' | 'compare_docs'

export type EvidenceStatus = 'none' | 'weak' | 'reliable'

export interface SourceRef {
  doc_id: string
  file_name: string
  chunk_id?: string | null
  chunk_index?: number | null
  chunk_type: 'profile' | 'summary' | 'content' | 'card'
  content: string
  score?: number | null
  paperTitle?: string
  sectionTitle?: string
  sectionType?: string
  pageStart?: number | null
  pageEnd?: number | null
  labels?: string[]
  parser?: string | null
  zh_semantic_summary?: string
  zhSemanticSummary?: string
  terms_en?: string
  termsEn?: string
  terms_zh?: string
  termsZh?: string
  confidence_flags?: string
  confidenceFlags?: string
}

export interface QASources {
  docIds: string[]
  chunks: string[]
  refs?: SourceRef[]
  answerMode?: AnswerMode
  evidenceStatus?: EvidenceStatus
}

interface QAMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: QASources
  created_at?: string
}

export interface MentionedDoc {
  id: string
  fileName: string
  title?: string | null
  authors?: string[] | string | null
  year?: number | string | null
  venue?: string | null
  knowledgeBaseId?: string | null
  indexedStatus?: string | null
  metadataStatus?: string | null
}

interface MentionSearchContext {
  knowledgeBaseId?: string | null
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

  // @ mentions
  mentionedDocs: MentionedDoc[]
  mentionSearchResults: MentionedDoc[]
  mentionSearchLoading: boolean
  searchMentions: (query: string, context?: MentionSearchContext) => Promise<void>
  addMention: (doc: MentionedDoc) => void
  removeMention: (docId: string) => void
  clearMentions: () => void

  // Actions
  loadSessions: () => Promise<void>
  createSession: (title: string, scopeType: string, scopeIds: string[]) => Promise<string>
  openSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  sendMessage: (question: string, mentionedDocIds?: string[]) => Promise<void>
  draftResearchCard: (messageId: string, knowledgeBaseId?: string | null) => Promise<ResearchCardDraft>
  saveResearchCard: (draft: ResearchCardDraft & { knowledgeBaseId: string }) => Promise<void>
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
  mentionedDocs: [],
  mentionSearchResults: [],
  mentionSearchLoading: false,

  searchMentions: async (query, context = {}) => {
    set({ mentionSearchLoading: true })
    try {
      const q = encodeURIComponent(query.trim())
      let url = `/api/knowledge/documents/search?q=${q}`
      if (context.knowledgeBaseId) url += `&knowledgeBaseId=${encodeURIComponent(context.knowledgeBaseId)}`
      url += '&limit=20'
      const docs = await api.get<MentionedDoc[]>(url)
      set({ mentionSearchResults: docs, mentionSearchLoading: false })
    } catch {
      set({ mentionSearchResults: [], mentionSearchLoading: false })
    }
  },

  addMention: (doc) => {
    set(state => {
      if (state.mentionedDocs.some(d => d.id === doc.id)) return state
      return { mentionedDocs: [...state.mentionedDocs, doc] }
    })
  },

  removeMention: (docId) => {
    set(state => ({
      mentionedDocs: state.mentionedDocs.filter(d => d.id !== docId),
    }))
  },

  clearMentions: () => set({ mentionedDocs: [], mentionSearchResults: [] }),

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

  sendMessage: async (question, mentionedDocIds?) => {
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
      }>(`/api/qa/sessions/${sessionId}/messages`, { question, mentionedDocIds }, signal)

      set(state => {
        const msgs = state.messages.slice(0, -1)

        // Normalize assistant message sources from snake_case API format
        const rawSources = (res.assistantMessage as any).sources
        const normalizedSources: QASources | undefined = rawSources ? {
          docIds: rawSources.source_doc_ids ?? rawSources.docIds ?? [],
          chunks: rawSources.source_chunks ?? rawSources.chunks ?? [],
          refs: Array.isArray(rawSources.source_refs) ? rawSources.source_refs.map((ref: any) => ({
            doc_id: ref.doc_id,
            file_name: ref.file_name,
            chunk_id: ref.chunk_id ?? null,
            chunk_index: ref.chunk_index ?? null,
            chunk_type: ref.chunk_type,
            content: ref.content,
            score: ref.score ?? null,
            paperTitle: ref.paper_title,
            sectionTitle: ref.section_title,
            sectionType: ref.section_type,
            pageStart: ref.page_start,
            pageEnd: ref.page_end,
            labels: Array.isArray(ref.labels) ? ref.labels : [],
            parser: ref.parser ?? null,
            zh_semantic_summary: ref.zh_semantic_summary ?? ref.zhSemanticSummary ?? '',
            terms_en: ref.terms_en ?? ref.termsEn ?? '',
            terms_zh: ref.terms_zh ?? ref.termsZh ?? '',
            confidence_flags: ref.confidence_flags ?? ref.confidenceFlags ?? '',
          })) : rawSources.refs,
          answerMode: rawSources.answer_mode ?? rawSources.answerMode,
          evidenceStatus: rawSources.evidence_status ?? rawSources.evidenceStatus,
        } : undefined

        const assistantMsg: QAMessage = {
          ...res.assistantMessage,
          content: res.assistantMessage.content ?? (res.assistantMessage as any).answer ?? '',
          sources: normalizedSources,
        }

        return {
          messages: [...msgs, res.userMessage, assistantMsg],
          loading: false,
        }
      })
      // Clear mentions after successful send
      get().clearMentions()
    } catch (err) {
      const errorMsg = err instanceof Error
        ? (err.name === 'AbortError' ? '请求超时，请稍后重试' : err.message)
        : '请求失败'
      set(state => ({
        loading: false,
        messages: state.messages.filter(m => !m.id.startsWith('tmp-')),
      }))
      // Keep mentions on failure (don't clear)
      throw new Error(errorMsg)
    }
  },

  draftResearchCard: async (messageId, knowledgeBaseId) => {
    const { sessionId } = get()
    if (!sessionId) throw new Error('No QA session selected')
    const body = knowledgeBaseId ? { sessionId, messageId, knowledgeBaseId } : { sessionId, messageId }
    const raw = await api.post<any>('/api/research-cards/draft-from-qa', body)
    return {
      question: raw.question,
      coreClaims: raw.coreClaims ?? raw.core_claims ?? [],
      knowledgeType: raw.knowledgeType ?? raw.knowledge_type ?? 'other',
      tags: raw.tags ?? [],
      subDirection: raw.subDirection ?? raw.sub_direction ?? null,
      validationNotes: raw.validationNotes ?? raw.validation_notes ?? '',
      useCases: raw.useCases ?? raw.use_cases ?? [],
      linkedDocIds: raw.linkedDocIds ?? raw.linked_doc_ids ?? [],
      answerMode: raw.answerMode ?? raw.answer_mode ?? null,
      sourceMessageId: messageId,
      noPaperEvidence: Boolean(raw.noPaperEvidence ?? raw.no_paper_evidence),
      evidenceRefs: raw.evidenceRefs ?? raw.evidence_refs ?? [],
    }
  },

  saveResearchCard: async (draft) => {
    await api.post('/api/research-cards', draft)
  },

  clear: () => set({ sessionId: null, sessionScope: { type: 'all', ids: [] }, messages: [], mentionedDocs: [] }),
}))
