import { defineStore } from 'pinia'
import { QAHistoryManager, type QAMessage, type QASession } from '@/lib/core/qa-history'
import { HistoryManager } from '@/lib/core/history'
import { TauriStorageAdapter } from '@/lib/core/storage'
import { QAAgent } from '@/lib/agents/qa'
import { useConfigStore } from './config'

const qaHistory = new QAHistoryManager(new TauriStorageAdapter())
const historyManager = new HistoryManager(new TauriStorageAdapter())

export const useQAStore = defineStore('qa', {
  state: () => ({
    sessions: [] as QASession[],
    currentSessionId: '',
    loading: false,
    streamText: '',
  }),

  getters: {
    currentSession(): QASession | undefined {
      return this.sessions.find(s => s.id === this.currentSessionId)
    },
    currentMessages(): QAMessage[] {
      return this.currentSession?.messages ?? []
    },
  },

  actions: {
    async loadSessions() {
      this.sessions = await qaHistory.listSessions()
    },

    async createSession(recordId: string | null, documentName: string) {
      const id = await qaHistory.createSession(recordId, documentName)
      await this.loadSessions()
      this.currentSessionId = id
      return id
    },

    async switchSession(id: string) {
      this.currentSessionId = id
    },

    async deleteSession(id: string) {
      await qaHistory.deleteSession(id)
      if (this.currentSessionId === id) this.currentSessionId = ''
      await this.loadSessions()
    },

    async sendMessage(question: string) {
      const configStore = useConfigStore()
      if (!configStore.loaded) await configStore.load()

      // Create session if none active
      if (!this.currentSessionId) {
        await this.createSession(null, '')
      }

      const sessionId = this.currentSessionId

      // Add user message
      const userMsg: QAMessage = { role: 'user', content: question, timestamp: new Date().toISOString() }
      await qaHistory.addMessage(sessionId, userMsg)

      // Reflect in local state
      const session = this.sessions.find(s => s.id === sessionId)
      if (session) session.messages.push(userMsg)

      // Prepare assistant placeholder
      const assistantMsg: QAMessage = { role: 'assistant', content: '', timestamp: new Date().toISOString() }
      await qaHistory.addMessage(sessionId, assistantMsg)
      if (session) session.messages.push(assistantMsg)

      this.loading = true
      this.streamText = ''

      try {
        // Load document context from linked history record
        let documentContext = ''
        let analysisReport = ''
        const sessionData = await qaHistory.getSession(sessionId)
        if (sessionData?.recordId) {
          const record = await historyManager.getRecord(sessionData.recordId)
          if (record) {
            documentContext = record.fullReport
            analysisReport = record.fullReport
          }
        }

        // Build conversation history from current session messages (exclude the empty assistant placeholder)
        const conversationHistory = (session?.messages ?? [])
          .filter(m => m.content && !(m.role === 'assistant' && m === assistantMsg))
          .map(m => ({ role: m.role, content: m.content }))

        const agent = new QAAgent(configStore.config.model)

        const { answer } = await agent.run(
          { documentContext, analysisReport, question, conversationHistory },
          (text) => {
            assistantMsg.content += text
            this.streamText += text
            // Persist streaming state
            void qaHistory.updateLastMessage(sessionId, assistantMsg.content)
          },
        )

        // Ensure final content is saved
        assistantMsg.content = answer
        await qaHistory.updateLastMessage(sessionId, answer)
      } catch (error) {
        assistantMsg.content = `Error: ${error instanceof Error ? error.message : String(error)}`
        await qaHistory.updateLastMessage(sessionId, assistantMsg.content)
      } finally {
        this.loading = false
        this.streamText = ''
      }
    },
  },
})
