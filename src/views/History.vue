<template>
  <AppLayout>
    <div class="page-content">
      <section class="page-header">
        <h2>历史记录</h2>
        <p>查看和管理已分析的文献记录。</p>
      </section>

      <div v-if="records.length" class="history-list">
        <div
          v-for="(record, idx) in records"
          :key="record.id"
          class="history-card"
          :style="{ '--i': Math.min(idx, 5) }"
        >
          <div class="history-card-body" @click="$router.push(`/history/${record.id}`)">
            <div class="history-card-title">{{ record.fileName }}</div>
            <div class="history-card-meta">
              <span class="model-tag">{{ record.model }}</span>
              <span class="time-cell">{{ record.createdAt }}</span>
            </div>
          </div>
          <div class="history-card-actions">
            <el-button text type="danger" size="small" @click.stop="remove(record.id)">删除</el-button>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="20" cy="20" r="14"/><path d="M20 12v8l5 3"/></svg>
        </div>
        <span>暂无分析记录</span>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import type { HistoryRecord } from '@/lib/core/history'
import { useAnalysisStore } from '@/stores/analysis'

const analysis = useAnalysisStore()
const records = ref<HistoryRecord[]>([])

async function refresh() {
  records.value = await analysis.loadHistoryRecords()
}

async function remove(id: string) {
  await analysis.deleteHistoryRecord(id)
  await refresh()
}

onMounted(refresh)
</script>

<style scoped>
.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: var(--shadow-sm);
  transition:
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out);
  animation: wonder-fade-up 0.2s var(--ease-out) both;
  animation-delay: calc(var(--i) * 0.05s);
}

.history-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.history-card-body {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.history-card-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-secondary);
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-card-meta {
  display: flex;
  gap: 12px;
  align-items: center;
}

.model-tag {
  font-size: 11px;
  color: var(--ink-faint);
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 4px;
}

.time-cell {
  font-size: 12px;
  color: var(--ink-ghost);
}

.history-card-actions {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-standard);
}

.history-card:hover .history-card-actions {
  opacity: 1;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 0;
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
</style>
