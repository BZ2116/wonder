import { create } from 'zustand'
import { api } from '../services/api'

interface AnalysisStep {
  step: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  label: string
  progress?: number
  progressTotal?: number
  result?: unknown
}

interface AnalysisState {
  steps: AnalysisStep[]
  running: boolean
  documentId: string | null
  knowledgeBaseId: string | null
  result: Record<string, unknown> | null
  apiStatus: 'idle' | 'checking' | 'ok' | 'error'
  apiError: string | null
  abortController: AbortController | null

  checkApi: () => Promise<boolean>
  analyze: (fileName: string, fileType: string, text: string, knowledgeBaseId?: string) => Promise<void>
  cancel: () => void
  reset: () => void
  setResult: (result: Record<string, unknown>) => void
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  steps: [],
  running: false,
  documentId: null,
  knowledgeBaseId: null,
  result: null,
  apiStatus: 'idle',
  apiError: null,
  abortController: null,

  checkApi: async () => {
    set({ apiStatus: 'checking', apiError: null })
    try {
      const status = await api.healthCheck()
      if (!status.ok) {
        const parts: string[] = []
        if (!status.llm) parts.push('LLM API 不可达')
        if (!status.python) parts.push('Python AI Core 未运行')
        set({ apiStatus: 'error', apiError: parts.join('；') || '未知错误' })
        return false
      }
      set({ apiStatus: 'ok', apiError: null })
      return true
    } catch {
      set({ apiStatus: 'error', apiError: '无法连接到服务器' })
      return false
    }
  },

  analyze: async (fileName, fileType, text, knowledgeBaseId) => {
    const ac = new AbortController()
    set({ running: true, steps: [], documentId: null, knowledgeBaseId: knowledgeBaseId || null, abortController: ac })

    try {
      await api.stream(
        '/api/analysis/single',
        { fileName, fileType, text, knowledgeBaseId },
        (event, data) => {
          if (event === 'step') {
            const step = JSON.parse(data) as AnalysisStep
            set((state) => {
              const idx = state.steps.findIndex(s => s.step === step.step)
              if (idx >= 0) {
                const newSteps = [...state.steps]
                newSteps[idx] = step
                return { steps: newSteps }
              }
              return { steps: [...state.steps, step] }
            })
          } else if (event === 'progress') {
            const { step: stepName, chunkCount, total } = JSON.parse(data) as { step: string; chunkCount: number; total: number }
            set((state) => ({
              steps: state.steps.map(s =>
                s.step === stepName ? { ...s, progress: chunkCount, progressTotal: total } : s
              ),
            }))
          } else if (event === 'complete') {
            const { documentId, knowledgeBaseId: kbId, result: analysisResult } = JSON.parse(data)
            set({ running: false, documentId, knowledgeBaseId: kbId || null, result: analysisResult || null, abortController: null })
          } else if (event === 'cancel') {
            set({ running: false, abortController: null })
          } else if (event === 'error') {
            const { error } = JSON.parse(data) as { error: string }
            set({ running: false, abortController: null, apiStatus: 'error', apiError: error })
          }
        },
        ac.signal,
      )
      // Fallback: stream ended without a 'complete' event
      if (get().running) {
        set({ running: false, abortController: null, apiStatus: 'error', apiError: '分析异常中断，请检查 API 配置后重试' })
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        set((state) => ({
          running: false,
          abortController: null,
          steps: state.steps.map(s =>
            s.status === 'running' ? { ...s, status: 'cancelled' as const } : s
          ),
        }))
      } else {
        set({ running: false, abortController: null })
        throw err
      }
    }
  },

  cancel: () => {
    get().abortController?.abort()
  },

  reset: () => set({ steps: [], running: false, documentId: null, knowledgeBaseId: null, result: null, abortController: null }),
  setResult: (result) => set({ result }),
}))
