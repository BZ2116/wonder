import { defineStore } from 'pinia'
import { searchPapers } from '@/lib/discovery/semantic-scholar'
import type { S2Paper } from '@/lib/discovery/types'

export const useDiscoveryStore = defineStore('discovery', {
  state: () => ({
    query: '',
    results: [] as S2Paper[],
    selectedPaper: null as S2Paper | null,
    loading: false,
    error: '',
    total: 0,
  }),
  actions: {
    async search() {
      if (!this.query.trim()) return
      this.loading = true
      this.error = ''
      this.selectedPaper = null
      try {
        const result = await searchPapers(this.query.trim())
        this.results = result.papers
        this.total = result.total
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
        this.results = []
        this.total = 0
      } finally {
        this.loading = false
      }
    },
    selectPaper(paper: S2Paper) {
      this.selectedPaper = paper
    },
    clearSelection() {
      this.selectedPaper = null
    },
  },
})
