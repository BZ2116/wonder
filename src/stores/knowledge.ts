import { create } from 'zustand'
import { api } from '../services/api'
import type { KnowledgeBase } from '../types/analysis'
import type { ResearchCardDraft, KnowledgeType } from '../types/research-card'

export interface ResearchCard extends ResearchCardDraft {
  id: string
  knowledgeBaseId: string
  status: 'draft' | 'saved' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface ResearchCardFilters {
  knowledgeType?: KnowledgeType
  tag?: string
  documentId?: string
  status?: string
}

interface KnowledgeState {
  // KB list
  knowledgeBases: KnowledgeBase[]
  kbLoading: boolean
  kbLoaded: boolean
  error: string | null
  saving: boolean
  loadKnowledgeBases: () => Promise<void>
  createKnowledgeBase: (name: string, description?: string, readme?: string) => Promise<KnowledgeBase>
  updateKnowledgeBase: (id: string, updates: { name?: string; description?: string; readme?: string }) => Promise<void>
  deleteKnowledgeBase: (id: string) => Promise<void>

  // Selected KB
  selectedKBId: string | null
  selectKB: (id: string | null) => void

  // Documents in selected KB
  kbDocuments: unknown[]
  kbDocsLoading: boolean
  loadKBDocuments: (kbId: string) => Promise<void>
  addDocumentToKB: (kbId: string, documentId: string, opts?: { subDirection?: string; tags?: string; fitScore?: number; recommendedAction?: string }) => Promise<void>
  removeDocumentFromKB: (kbId: string, documentId: string) => Promise<void>
  reindexDocument: (kbId: string, documentId: string) => Promise<void>

  // README suggestions
  readmeSuggestions: unknown[]
  loadReadmeSuggestions: (kbId: string) => Promise<void>
  acceptSuggestion: (suggestionId: string) => Promise<void>
  rejectSuggestion: (suggestionId: string) => Promise<void>

  // Research cards
  researchCards: ResearchCard[]
  researchCardsLoading: boolean
  researchCardFilters: ResearchCardFilters
  loadResearchCards: (kbId: string, filters?: ResearchCardFilters) => Promise<void>
  updateResearchCard: (id: string, updates: Partial<ResearchCardDraft>) => Promise<void>
  archiveResearchCard: (id: string) => Promise<void>

  // Legacy flat document list
  documents: unknown[]
  loading: boolean
  loadDocuments: () => Promise<void>
  deleteDocument: (id: string) => Promise<void>
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  // KB list
  knowledgeBases: [],
  kbLoading: false,
  kbLoaded: false,
  error: null,
  saving: false,
  loadKnowledgeBases: async () => {
    if (get().kbLoaded && get().knowledgeBases.length > 0) return
    set({ kbLoading: true })
    try {
      const kbs = await api.get<KnowledgeBase[]>('/api/knowledge-bases')
      set({ knowledgeBases: kbs, kbLoading: false, error: null, kbLoaded: true })
    } catch (err) {
      set({ kbLoading: false, kbLoaded: false, error: err instanceof Error ? err.message : String(err) })
    }
  },
  createKnowledgeBase: async (name, description, readme) => {
    if (get().saving) throw new Error('操作进行中')
    set({ saving: true })
    try {
      const kb = await api.post<KnowledgeBase>('/api/knowledge-bases', { name, description, readme })
      set(state => ({ knowledgeBases: [kb, ...state.knowledgeBases], error: null, saving: false }))
      return kb
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg, saving: false })
      throw err
    }
  },
  updateKnowledgeBase: async (id, updates) => {
    if (get().saving) throw new Error('操作进行中')
    set({ saving: true })
    try {
      await api.patch(`/api/knowledge-bases/${id}`, updates)
      set(state => ({
        knowledgeBases: state.knowledgeBases.map(kb =>
          kb.id === id ? { ...kb, ...updates } : kb
        ),
        error: null,
        saving: false,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg, saving: false })
      throw err
    }
  },
  deleteKnowledgeBase: async (id) => {
    if (get().saving) return
    set({ saving: true })
    try {
      await api.delete(`/api/knowledge-bases/${id}`)
      set(state => ({
        saving: false,
        knowledgeBases: state.knowledgeBases.filter(kb => kb.id !== id),
        selectedKBId: state.selectedKBId === id ? null : state.selectedKBId,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ saving: false, error: msg })
      throw err
    }
  },

  // Selected KB
  selectedKBId: null,
  selectKB: (id) => set({ selectedKBId: id, kbDocuments: [], readmeSuggestions: [], researchCards: [], researchCardFilters: {} }),

  // Documents in selected KB
  kbDocuments: [],
  kbDocsLoading: false,
  loadKBDocuments: async (kbId) => {
    set({ kbDocsLoading: true })
    try {
      const docs = await api.get(`/api/knowledge-bases/${kbId}/documents`)
      set({ kbDocuments: docs as unknown[], kbDocsLoading: false })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ kbDocsLoading: false, error: msg })
    }
  },
  addDocumentToKB: async (kbId, documentId, opts) => {
    try {
      await api.post(`/api/knowledge-bases/${kbId}/documents`, { documentId, ...opts })
      get().loadKBDocuments(kbId)
      set(state => ({
        knowledgeBases: state.knowledgeBases.map(kb =>
          kb.id === kbId ? { ...kb, documentCount: (kb.documentCount ?? 0) + 1 } : kb
        ),
      }))
      // Refresh KB list after a delay to pick up asynchronously generated README suggestions
      setTimeout(() => {
        set({ kbLoaded: false })
        get().loadKnowledgeBases()
      }, 3000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
      throw err
    }
  },
  removeDocumentFromKB: async (kbId, documentId) => {
    try {
      await api.delete(`/api/knowledge-bases/${kbId}/documents/${documentId}`)
      set(state => ({
        kbDocuments: (state.kbDocuments as { id: string }[]).filter(d => d.id !== documentId),
        knowledgeBases: state.knowledgeBases.map(kb =>
          kb.id === kbId ? { ...kb, documentCount: Math.max(0, (kb.documentCount ?? 1) - 1) } : kb
        ),
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
      throw err
    }
  },
  reindexDocument: async (kbId, documentId) => {
    try {
      await api.post(`/api/knowledge-bases/${kbId}/documents/${documentId}/reindex`)
      await get().loadKBDocuments(kbId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
      throw err
    }
  },

  // README suggestions
  readmeSuggestions: [],
  loadReadmeSuggestions: async (kbId) => {
    try {
      const suggestions = await api.get(`/api/knowledge-bases/${kbId}/readme-suggestions?status=pending`)
      set({ readmeSuggestions: suggestions as unknown[], error: null })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
    }
  },
  acceptSuggestion: async (suggestionId) => {
    try {
      await api.post(`/api/knowledge-bases/readme-suggestions/${suggestionId}/accept`)
      set(state => ({
        readmeSuggestions: (state.readmeSuggestions as { id: string }[]).filter(s => s.id !== suggestionId),
      }))
      const kbId = get().selectedKBId
      if (kbId) {
        const kb = await api.get<KnowledgeBase>(`/api/knowledge-bases/${kbId}`)
        set(state => ({
          knowledgeBases: state.knowledgeBases.map(k => k.id === kbId ? { ...k, ...kb } : k),
        }))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
      throw err
    }
  },
  rejectSuggestion: async (suggestionId) => {
    try {
      await api.post(`/api/knowledge-bases/readme-suggestions/${suggestionId}/reject`)
      set(state => ({
        readmeSuggestions: (state.readmeSuggestions as { id: string }[]).filter(s => s.id !== suggestionId),
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
      throw err
    }
  },

  // Research cards
  researchCards: [],
  researchCardsLoading: false,
  researchCardFilters: {},
  loadResearchCards: async (kbId, filters = {}) => {
    set({ researchCardsLoading: true, researchCardFilters: filters })
    const qs = new URLSearchParams()
    if (filters.knowledgeType) qs.set('knowledgeType', filters.knowledgeType)
    if (filters.tag) qs.set('tag', filters.tag)
    if (filters.documentId) qs.set('documentId', filters.documentId)
    if (filters.status) qs.set('status', filters.status)
    try {
      const cards = await api.get(`/api/research-cards/knowledge-base/${kbId}${qs.toString() ? `?${qs}` : ''}`)
      set({ researchCards: cards as ResearchCard[], researchCardsLoading: false, error: null })
    } catch (err) {
      set({ researchCardsLoading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },
  updateResearchCard: async (id, updates) => {
    try {
      await api.patch(`/api/research-cards/${id}`, updates)
      set(state => ({
        researchCards: state.researchCards.map(c =>
          c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
        ),
        error: null,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
      throw err
    }
  },
  archiveResearchCard: async (id) => {
    try {
      await api.delete(`/api/research-cards/${id}`)
      set(state => ({
        researchCards: state.researchCards.filter(c => c.id !== id),
        error: null,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
      throw err
    }
  },

  // Legacy
  documents: [],
  loading: false,
  loadDocuments: async () => {
    set({ loading: true })
    try {
      const docs = await api.get('/api/knowledge')
      set({ documents: docs as unknown[] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ documents: [], error: msg })
    } finally {
      set({ loading: false })
    }
  },
  deleteDocument: async (id) => {
    try {
      await api.delete(`/api/knowledge/${id}`)
      set(state => ({ documents: (state.documents as { id: string }[]).filter(d => d.id !== id) }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
      throw err
    }
  },
}))
