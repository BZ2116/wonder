<template>
  <AppLayout>
    <div class="page-content qa-page">
      <section class="page-header">
        <h2>追溯问答</h2>
        <p>基于已分析的文献，进行多轮追问与深挖。</p>
      </section>

      <div class="context-bar">
        <el-radio-group v-model="qaMode" size="small" class="mode-switch">
          <el-radio-button value="local">本地模式</el-radio-button>
          <el-radio-button value="rag">知识库模式</el-radio-button>
        </el-radio-group>

        <template v-if="qaMode === 'local'">
          <el-select
            v-model="selectedRecordId"
            placeholder="选择文献上下文"
            clearable
            filterable
            class="record-select"
            @change="onRecordChange"
          >
            <el-option label="新对话（无上下文）" :value="null" />
            <el-option
              v-for="record in historyRecords"
              :key="record.id"
              :label="record.fileName"
              :value="record.id"
            />
          </el-select>
          <el-select
            v-if="qa.sessions.length"
            v-model="qa.currentSessionId"
            placeholder="历史会话"
            clearable
            class="session-select"
            @change="onSessionChange"
          >
            <el-option
              v-for="session in qa.sessions"
              :key="session.id"
              :label="sessionLabel(session)"
              :value="session.id"
            />
          </el-select>
        </template>

        <template v-else>
          <el-select
            v-model="selectedDocIds"
            multiple
            filterable
            placeholder="选择知识库文档（留空则搜索全部）"
            class="record-select"
          >
            <el-option
              v-for="doc in knowledge.documents"
              :key="doc.id"
              :label="doc.file_name"
              :value="doc.id"
            />
          </el-select>
        </template>
      </div>

      <div class="chat-container">
        <div ref="chatArea" class="chat-area">
          <div v-if="!qa.currentMessages.length" class="empty-chat">
            <div class="empty-icon">
              <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 8h24a3 3 0 013 3v14a3 3 0 01-3 3H14l-6 5V11a3 3 0 013-3z"/><path d="M14 16h12M14 21h6"/></svg>
            </div>
            <span>发送消息开始对话</span>
          </div>
          <ChatMessage
            v-for="(msg, idx) in qa.currentMessages"
            :key="idx"
            :role="msg.role"
            :content="msg.content"
          />
        </div>

        <div class="input-bar">
          <el-input
            v-model="inputText"
            placeholder="输入问题，按 Enter 发送"
            :disabled="qa.loading"
            @keydown.enter.prevent="send"
          />
          <el-button type="primary" :loading="qa.loading" :disabled="!inputText.trim()" @click="send">
            发送
          </el-button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, ref, nextTick, watch } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import ChatMessage from '@/components/ChatMessage.vue'
import { useQAStore } from '@/stores/qa'
import { useAnalysisStore } from '@/stores/analysis'
import { useKnowledgeStore } from '@/stores/knowledge'
import { askQuestion } from '@/lib/api/knowledge'
import { QAHistoryManager } from '@/lib/core/qa-history'
import { TauriStorageAdapter } from '@/lib/core/storage'
import type { HistoryRecord } from '@/lib/core/history'
import type { QASession } from '@/lib/core/qa-history'

const qaHistory = new QAHistoryManager(new TauriStorageAdapter())
const qa = useQAStore()
const analysis = useAnalysisStore()
const knowledge = useKnowledgeStore()

const inputText = ref('')
const qaMode = ref<'local' | 'rag'>('local')
const selectedDocIds = ref<string[]>([])
const selectedRecordId = ref<string | null>(null)
const historyRecords = ref<HistoryRecord[]>([])
const chatArea = ref<HTMLElement | null>(null)

function sessionLabel(session: QASession): string {
  const firstUser = session.messages.find(m => m.role === 'user')
  const label = firstUser?.content.slice(0, 30) || session.documentName || '新对话'
  return label.length >= 30 ? label + '...' : label
}

async function onRecordChange(recordId: string | null) {
  if (recordId) {
    const record = historyRecords.value.find(r => r.id === recordId)
    await qa.createSession(recordId, record?.fileName ?? '')
  }
}

async function onSessionChange(sessionId: string) {
  if (sessionId) {
    await qa.switchSession(sessionId)
    const session = qa.sessions.find(s => s.id === sessionId)
    selectedRecordId.value = session?.recordId ?? null
  }
}

async function send() {
  const text = inputText.value.trim()
  if (!text || qa.loading) return
  inputText.value = ''

  if (qaMode.value === 'rag') {
    await sendRAG(text)
  } else {
    await qa.sendMessage(text)
  }

  await nextTick()
  scrollToBottom()
}

async function sendRAG(question: string) {
  // Create a session if none active
  if (!qa.currentSessionId) {
    await qa.createSession(null, '知识库问答')
  }

  const sessionId = qa.currentSessionId
  const session = qa.sessions.find(s => s.id === sessionId)

  // Add user message
  const userMsg = { role: 'user' as const, content: question, timestamp: new Date().toISOString() }
  await qaHistory.addMessage(sessionId, userMsg)
  if (session) session.messages.push(userMsg)

  // Add assistant placeholder
  const assistantMsg = { role: 'assistant' as const, content: '', timestamp: new Date().toISOString() }
  await qaHistory.addMessage(sessionId, assistantMsg)
  if (session) session.messages.push(assistantMsg)

  qa.loading = true
  try {
    const docIds = selectedDocIds.value.length ? selectedDocIds.value : undefined
    const result = await askQuestion(question, docIds)

    // Build answer with sources
    let answer = result.answer
    if (result.source_chunks && result.source_chunks.length > 0) {
      answer += '\n\n---\n**参考来源：**\n'
      result.source_chunks.forEach((chunk, i) => {
        answer += `\n${i + 1}. ${chunk.slice(0, 200)}${chunk.length > 200 ? '...' : ''}`
      })
    }

    assistantMsg.content = answer
    await qaHistory.updateLastMessage(sessionId, answer)
  } catch (error) {
    assistantMsg.content = `Error: ${error instanceof Error ? error.message : String(error)}`
    await qaHistory.updateLastMessage(sessionId, assistantMsg.content)
  } finally {
    qa.loading = false
  }
}

function scrollToBottom() {
  if (chatArea.value) chatArea.value.scrollTop = chatArea.value.scrollHeight
}

watch(() => qa.currentMessages.length, () => nextTick(scrollToBottom))
watch(() => qa.streamText, () => nextTick(scrollToBottom))

onMounted(async () => {
  await qa.loadSessions()
  historyRecords.value = await analysis.loadHistoryRecords()
  await knowledge.loadDocuments()
})
</script>

<style scoped>
.qa-page {
  height: calc(100vh - 64px);
}

.context-bar {
  display: flex;
  gap: 12px;
  margin-bottom: var(--space-md);
  animation: wonder-fade-up 0.2s var(--ease-out) both;
  animation-delay: 0.05s;
}

.mode-switch {
  flex-shrink: 0;
}

.record-select {
  flex: 1;
}

.session-select {
  width: 220px;
}

.chat-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  animation: wonder-fade-up 0.2s var(--ease-out) both;
  animation-delay: 0.1s;
}

.chat-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--ink-faint);
  font-size: 14px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  color: var(--border);
}

.empty-icon svg {
  width: 100%;
  height: 100%;
}

.input-bar {
  display: flex;
  gap: 10px;
  padding: 14px 16px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-card);
}
</style>
