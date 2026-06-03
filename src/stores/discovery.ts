import { create } from 'zustand'
import { api } from '../services/api'
import type { DiscoveryContext, DiscoveryCandidate } from '../types/discovery'
import type { S2Paper, S2SearchResult } from '../lib/discovery/types'

interface DiscoveryState {
  // Context
  discoveryContext: DiscoveryContext | null
  setDiscoveryContext: (context: DiscoveryContext) => void
  clearDiscoveryContext: () => void

  // Search
  searchResults: S2Paper[]
  searchLoading: boolean
  hasSearched: boolean
  searchError: string | null
  searchPapers: (query: string, limit?: number) => Promise<void>

  // Candidates (API-backed)
  candidateQueue: DiscoveryCandidate[]
  candidatesLoading: boolean
  candidatesError: string | null
  loadCandidates: (knowledgeBaseId?: string) => Promise<void>
  saveCandidate: (candidate: Omit<DiscoveryCandidate, 'id'>) => Promise<void>
  updateCandidateState: (id: string, state: DiscoveryCandidate['state']) => Promise<void>
  removeCandidate: (id: string) => Promise<void>
  isInQueue: (paperId: string) => boolean
  getCandidate: (paperId: string) => DiscoveryCandidate | undefined
}

interface ServerCandidate {
  id: string
  paper_id: string
  title: string
  abstract: string | null
  year: number | null
  citation_count: number
  influential_citation_count: number
  venue: string | null
  authors: string | null
  url: string | null
  source_query: string | null
  discovery_priority_score: number
  discovery_reason: string | null
  state: string
  knowledge_base_id: string | null
  created_at: string
  updated_at: string
}

function fromServer(row: ServerCandidate): DiscoveryCandidate {
  return {
    id: row.id,
    paperId: row.paper_id,
    title: row.title,
    abstract: row.abstract,
    year: row.year,
    citationCount: row.citation_count,
    influentialCitationCount: row.influential_citation_count,
    venue: row.venue ?? undefined,
    authors: row.authors ? JSON.parse(row.authors) : [],
    url: row.url ?? undefined,
    sourceQuery: row.source_query ?? '',
    discoveryPriorityScore: row.discovery_priority_score,
    discoveryReason: row.discovery_reason ?? '',
    state: row.state as DiscoveryCandidate['state'],
    knowledgeBaseId: row.knowledge_base_id,
  }
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  discoveryContext: null,

  setDiscoveryContext: (context) => set({ discoveryContext: context }),
  clearDiscoveryContext: () => set({ discoveryContext: null }),

  // Search via Node proxy
  searchResults: [],
  searchLoading: false,
  hasSearched: false,
  searchError: null,
  searchPapers: async (query, limit = 20) => {
    set({ searchLoading: true, searchError: null })
    try {
      const result = await api.get<S2SearchResult>(`/api/discovery/search?q=${encodeURIComponent(query)}&limit=${limit}`)
      set({ searchResults: result.papers, searchLoading: false, hasSearched: true })
    } catch (err) {
      set({ searchResults: [], searchLoading: false, hasSearched: true, searchError: err instanceof Error ? err.message : String(err) })
    }
  },

  // Candidates
  candidateQueue: [],
  candidatesLoading: false,
  candidatesError: null,

  loadCandidates: async (knowledgeBaseId) => {
    set({ candidatesLoading: true, candidatesError: null })
    try {
      const params = knowledgeBaseId ? `?knowledgeBaseId=${knowledgeBaseId}` : ''
      const rows = await api.get<ServerCandidate[]>(`/api/discovery/candidates${params}`)
      set({ candidateQueue: rows.map(fromServer), candidatesLoading: false })
    } catch (err) {
      set({ candidatesLoading: false, candidatesError: err instanceof Error ? err.message : String(err) })
    }
  },

  saveCandidate: async (candidate) => {
    const body = {
      paperId: candidate.paperId,
      title: candidate.title,
      abstract: candidate.abstract,
      year: candidate.year,
      citationCount: candidate.citationCount,
      influentialCitationCount: candidate.influentialCitationCount,
      venue: candidate.venue,
      authors: candidate.authors,
      url: candidate.url,
      sourceQuery: candidate.sourceQuery,
      discoveryPriorityScore: candidate.discoveryPriorityScore,
      discoveryReason: candidate.discoveryReason,
      state: candidate.state,
      knowledgeBaseId: candidate.knowledgeBaseId,
    }
    await api.post('/api/discovery/candidates', body)
    // Reload to get server-assigned id
    await get().loadCandidates(candidate.knowledgeBaseId ?? undefined)
  },

  updateCandidateState: async (id, state) => {
    await api.patch(`/api/discovery/candidates/${id}`, { state })
    set(s => ({
      candidateQueue: s.candidateQueue.map(c => c.id === id ? { ...c, state } : c),
    }))
  },

  removeCandidate: async (id) => {
    await api.delete(`/api/discovery/candidates/${id}`)
    set(s => ({
      candidateQueue: s.candidateQueue.filter(c => c.id !== id),
    }))
  },

  isInQueue: (paperId) => get().candidateQueue.some(c => c.paperId === paperId),
  getCandidate: (paperId) => get().candidateQueue.find(c => c.paperId === paperId),
}))
