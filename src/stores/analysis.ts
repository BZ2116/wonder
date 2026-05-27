import { defineStore } from 'pinia'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { readDocumentFile } from '@/lib/core/file-reader'
import { HistoryManager } from '@/lib/core/history'
import { TauriStorageAdapter } from '@/lib/core/storage'
import { runSingleAnalysis, type AnalysisResult, type AnalysisStep } from '@/lib/analysis/pipeline'
import { useConfigStore } from './config'

const history = new HistoryManager(new TauriStorageAdapter())

export const useAnalysisStore = defineStore('analysis', {
  state: () => ({
    loading: false,
    error: '',
    currentStep: '' as AnalysisStep | '',
    streamText: '',
    result: null as AnalysisResult | null,
    selectedPath: '',
    selectedName: '',
  }),
  actions: {
    async selectFilePath(path: string) {
      this.selectedPath = path
      this.selectedName = path.split(/[\\/]/).pop() ?? path
    },
    async analyzeSelectedFile() {
      if (!this.selectedPath) return
      const configStore = useConfigStore()
      if (!configStore.loaded) await configStore.load()

      this.loading = true
      this.error = ''
      this.result = null
      this.streamText = ''

      try {
        const file = await readDocumentFile(this.selectedPath)
        const { result } = await runSingleAnalysis({
          fileName: file.fileName,
          documentText: file.content,
          config: configStore.config,
          history,
          onProgress: step => {
            this.currentStep = step
          },
          onChunk: (_step, text) => {
            this.streamText += text
          },
        })
        this.result = result
        await notifyDone(file.fileName)
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
      } finally {
        this.loading = false
      }
    },
    async loadHistoryRecords() {
      return history.listRecords()
    },
    async loadHistoryRecord(id: string) {
      return history.getRecord(id)
    },
    async deleteHistoryRecord(id: string) {
      await history.deleteRecord(id)
    },
  },
})

async function notifyDone(fileName: string): Promise<void> {
  let permissionGranted = await isPermissionGranted()
  if (!permissionGranted) {
    const permission = await requestPermission()
    permissionGranted = permission === 'granted'
  }
  if (permissionGranted) {
    sendNotification({ title: 'Note Forge', body: `${fileName} 分析完成` })
  }
}
