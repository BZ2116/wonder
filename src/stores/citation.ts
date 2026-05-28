import { defineStore } from 'pinia'
import { buildCitationGraph } from '@/lib/discovery/citation-graph'
import type { CitationGraph, GraphNode } from '@/lib/discovery/citation-graph'

export const useCitationStore = defineStore('citation', {
  state: () => ({
    seedPaperId: '',
    graph: null as CitationGraph | null,
    selectedNode: null as GraphNode | null,
    loading: false,
    error: '',
    depth: 1,
    limit: 10,
  }),
  actions: {
    async buildGraph() {
      const id = this.seedPaperId.trim()
      if (!id) return
      this.loading = true
      this.error = ''
      this.selectedNode = null
      this.graph = null
      try {
        this.graph = await buildCitationGraph(id, this.depth, this.limit)
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
      } finally {
        this.loading = false
      }
    },
    selectNode(node: GraphNode | null) {
      this.selectedNode = node
    },
    clear() {
      this.graph = null
      this.selectedNode = null
      this.error = ''
    },
  },
})
