import { create } from 'zustand'
import { api } from '../services/api'

interface HistoryState {
  items: unknown[]
  loading: boolean
  loadHistory: () => Promise<void>
  deleteHistory: (id: string) => Promise<void>
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  items: [],
  loading: false,
  loadHistory: async () => {
    set({ loading: true })
    const items = await api.get('/api/history')
    set({ items: items as unknown[], loading: false })
  },
  deleteHistory: async (id: string) => {
    await api.delete(`/api/history/${id}`)
    set({ items: get().items.filter((item: any) => item.id !== id) })
  },
}))
