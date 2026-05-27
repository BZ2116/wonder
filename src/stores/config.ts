import { defineStore } from 'pinia'
import { ConfigManager, DEFAULT_CONFIG } from '@/lib/core/config'
import { TauriStorageAdapter } from '@/lib/core/storage'
import type { AppConfig } from '@/lib/llm/types'

const manager = new ConfigManager(new TauriStorageAdapter())

export const useConfigStore = defineStore('config', {
  state: () => ({
    config: structuredClone(DEFAULT_CONFIG) as AppConfig,
    loaded: false,
    saving: false,
  }),
  actions: {
    async load() {
      this.config = await manager.load()
      this.loaded = true
    },
    async save(config: AppConfig) {
      this.saving = true
      try {
        await manager.save(config)
        this.config = structuredClone(config)
      } finally {
        this.saving = false
      }
    },
  },
})
