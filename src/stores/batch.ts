import { defineStore } from 'pinia'
import { readDocumentFile } from '@/lib/core/file-reader'
import { runBatchAnalysis, type BatchResult, type BatchStep } from '@/lib/analysis/batch-pipeline'
import { useConfigStore } from './config'

export interface BatchFile {
  path: string
  name: string
}

export const useBatchStore = defineStore('batch', {
  state: () => ({
    files: [] as BatchFile[],
    loading: false,
    error: '',
    currentStep: '' as BatchStep | '',
    currentFileIndex: -1,
    streamText: '',
    result: null as BatchResult | null,
  }),
  actions: {
    addFiles(paths: string[]) {
      const existing = new Set(this.files.map(f => f.path))
      for (const path of paths) {
        if (existing.has(path)) continue
        const name = path.split(/[\\/]/).pop() ?? path
        this.files.push({ path, name })
      }
    },
    removeFile(index: number) {
      this.files.splice(index, 1)
    },
    clear() {
      this.files = []
      this.loading = false
      this.error = ''
      this.currentStep = ''
      this.currentFileIndex = -1
      this.streamText = ''
      this.result = null
    },
    async runBatch() {
      if (this.files.length < 2) {
        this.error = '请至少选择 2 个文件进行对比分析'
        return
      }

      const configStore = useConfigStore()
      if (!configStore.loaded) await configStore.load()

      this.loading = true
      this.error = ''
      this.result = null
      this.streamText = ''

      try {
        const fileData: Array<{ fileName: string; text: string }> = []
        for (const file of this.files) {
          const { content, fileName } = await readDocumentFile(file.path)
          fileData.push({ fileName, text: content })
        }

        this.result = await runBatchAnalysis({
          files: fileData,
          config: configStore.config,
          onProgress: (step, fileIndex) => {
            this.currentStep = step
            this.currentFileIndex = fileIndex ?? -1
          },
          onChunk: (_step, text) => {
            this.streamText += text
          },
        })
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err)
      } finally {
        this.loading = false
      }
    },
  },
})
