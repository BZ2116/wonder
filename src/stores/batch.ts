import { create } from 'zustand'
import { api } from '../services/api'
import { createQueue } from '../lib/batch/queue'

export type BatchItemStatus = 'pending' | 'parsing' | 'analyzing' | 'done' | 'error' | 'cancelled'

export interface BatchItemState {
  id: string
  fileName: string
  fileType: string | null
  status: BatchItemStatus
  documentId: string | null
  historyId: string | null
  error: string | null
}

interface BatchRunSummary {
  id: string
  name: string
  status: string
  created_at: string
}

interface BatchState {
  // Current run
  runId: string | null
  runName: string
  items: BatchItemState[]
  running: boolean
  concurrency: number

  // Run history
  runs: BatchRunSummary[]
  runsLoading: boolean
  runsError: string | null

  // Actions
  createRun: (name: string, files: File[], knowledgeBaseId?: string) => Promise<void>
  startExecution: () => Promise<void>
  cancelItem: (itemId: string) => void
  cancelAll: () => void
  loadRuns: () => Promise<void>
  loadRunDetail: (id: string) => Promise<void>
  reset: () => void
}

// Module-scoped storage for File objects (not serializable for Zustand)
const pendingFiles = new Map<string, File>()
const abortControllers = new Map<string, AbortController>()

export const useBatchStore = create<BatchState>((set, get) => ({
  runId: null,
  runName: '',
  items: [],
  running: false,
  concurrency: 2,
  runs: [],
  runsLoading: false,
  runsError: null,

  createRun: async (name, files, knowledgeBaseId) => {
    const result = await api.post<{ id: string; name: string; items: Array<{ id: string; file_name: string; file_type: string | null }> }>(
      '/api/batch/runs',
      {
        name,
        files: files.map(f => ({ fileName: f.name, fileType: f.name.split('.').pop() || null })),
        knowledgeBaseId,
      },
    )

    // Store File references for later parsing
    result.items.forEach((item, i) => {
      pendingFiles.set(item.id, files[i])
    })

    set({
      runId: result.id,
      runName: result.name,
      items: result.items.map(item => ({
        id: item.id,
        fileName: item.file_name,
        fileType: item.file_type,
        status: 'pending' as BatchItemStatus,
        documentId: null,
        historyId: null,
        error: null,
      })),
      running: false,
    })
  },

  startExecution: async () => {
    const { runId, items, concurrency } = get()
    if (!runId) return

    set({ running: true })

    // Update run status on server
    await api.patch(`/api/batch/runs/${runId}`, { status: 'running' })

    const queue = createQueue(concurrency)
    const pendingItems = items.filter(i => i.status === 'pending')

    const updateItem = (itemId: string, updates: Partial<BatchItemState>) => {
      set(state => ({
        items: state.items.map(i => i.id === itemId ? { ...i, ...updates } : i),
      }))
    }

    const tasks = pendingItems.map(item =>
      queue.run(async () => {
        const ac = new AbortController()
        abortControllers.set(item.id, ac)

        try {
          // Step 1: Parse file
          updateItem(item.id, { status: 'parsing' })
          const file = pendingFiles.get(item.id)
          if (!file) throw new Error('文件引用丢失')

          const { text } = await api.parseFile(file)
          pendingFiles.delete(item.id)

          // Check cancellation
          if (ac.signal.aborted) {
            updateItem(item.id, { status: 'cancelled' })
            return
          }

          // Step 2: Analyze via SSE
          updateItem(item.id, { status: 'analyzing' })

          let documentId: string | null = null
          let historyId: string | null = null

          await api.stream(
            '/api/analysis/single',
            { fileName: item.fileName, fileType: item.fileType, text },
            (event, data) => {
              if (event === 'complete') {
                const result = JSON.parse(data)
                documentId = result.documentId
                historyId = result.historyId
              } else if (event === 'error') {
                const errData = JSON.parse(data)
                throw new Error(errData.error)
              }
            },
            ac.signal,
          )

          // Step 3: Update status
          updateItem(item.id, { status: 'done', documentId, historyId })

          // Sync to server
          await api.patch(`/api/batch/runs/${runId}/items/${item.id}`, {
            status: 'done',
            documentId: documentId || undefined,
            historyId: historyId || undefined,
          }).catch(() => {}) // Best-effort sync
        } catch (err) {
          if (ac.signal.aborted) {
            updateItem(item.id, { status: 'cancelled' })
          } else {
            const errorMsg = err instanceof Error ? err.message : String(err)
            updateItem(item.id, { status: 'error', error: errorMsg })

            // Sync error to server
            await api.patch(`/api/batch/runs/${runId}/items/${item.id}`, {
              status: 'error',
              error: errorMsg,
            }).catch(() => {})
          }
        } finally {
          abortControllers.delete(item.id)
        }
      }),
    )

    await Promise.allSettled(tasks)

    // Update run status
    const finalItems = get().items
    const allDone = finalItems.every(i => i.status === 'done' || i.status === 'cancelled')
    const hasError = finalItems.some(i => i.status === 'error')
    const runStatus = hasError ? 'error' : allDone ? 'done' : 'cancelled'

    await api.patch(`/api/batch/runs/${runId}`, { status: runStatus }).catch(() => {})
    set({ running: false })
  },

  cancelItem: (itemId) => {
    const ac = abortControllers.get(itemId)
    if (ac) ac.abort()
    set(state => ({
      items: state.items.map(i =>
        i.id === itemId && i.status !== 'done' && i.status !== 'error'
          ? { ...i, status: 'cancelled' as BatchItemStatus }
          : i
      ),
    }))
  },

  cancelAll: () => {
    for (const ac of abortControllers.values()) {
      ac.abort()
    }
    set(state => ({
      running: false,
      items: state.items.map(i =>
        i.status === 'pending' || i.status === 'parsing' || i.status === 'analyzing'
          ? { ...i, status: 'cancelled' as BatchItemStatus }
          : i
      ),
    }))
  },

  loadRuns: async () => {
    set({ runsLoading: true, runsError: null })
    try {
      const runs = await api.get<BatchRunSummary[]>('/api/batch/runs')
      set({ runs, runsLoading: false })
    } catch (err) {
      set({ runsLoading: false, runsError: err instanceof Error ? err.message : String(err) })
    }
  },

  loadRunDetail: async (id) => {
    const run = await api.get<{ id: string; name: string; items: Array<{ id: string; file_name: string; file_type: string | null; status: string; document_id: string | null; history_id: string | null; error: string | null }> }>(
      `/api/batch/runs/${id}`,
    )
    set({
      runId: run.id,
      runName: run.name,
      items: run.items.map(item => ({
        id: item.id,
        fileName: item.file_name,
        fileType: item.file_type,
        status: item.status as BatchItemStatus,
        documentId: item.document_id,
        historyId: item.history_id,
        error: item.error,
      })),
    })
  },

  reset: () => {
    abortControllers.clear()
    pendingFiles.clear()
    set({ runId: null, runName: '', items: [], running: false, runsError: null })
  },
}))
