<template>
  <div class="workflow">
    <div
      v-for="(item, idx) in steps"
      :key="item.key"
      class="step"
      :class="{ active: item.key === currentStep, done: isDone(item.key) }"
    >
      <span class="step-dot">
        <svg v-if="isDone(item.key)" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3.5 8.5l3 3 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span v-else class="step-num">{{ idx + 1 }}</span>
      </span>
      <span class="step-label">{{ item.label }}</span>
      <div v-if="idx < steps.length - 1" class="step-connector" :class="{ filled: isDone(item.key) }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AnalysisStep } from '@/lib/analysis/pipeline'

const props = defineProps<{ currentStep: AnalysisStep | '' }>()

const steps: Array<{ key: AnalysisStep; label: string }> = [
  { key: 'reading', label: '文献解析' },
  { key: 'relation', label: '关联分析' },
  { key: 'writing', label: '写作素材' },
  { key: 'todo', label: '任务清单' },
  { key: 'saving', label: '保存记录' },
]

function isDone(key: AnalysisStep) {
  const current = steps.findIndex(step => step.key === props.currentStep)
  const target = steps.findIndex(step => step.key === key)
  return current > target || props.currentStep === 'done'
}
</script>

<style scoped>
.workflow {
  display: flex;
  align-items: center;
  gap: 0;
  margin: var(--space-md) 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 16px 20px;
  box-shadow: var(--shadow-sm);
}

.step {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  flex: 1;
}

.step-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    background var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
  color: var(--ink-faint);
  font-size: 11px;
}

.step-dot svg {
  width: 14px;
  height: 14px;
}

.step-num {
  font-weight: 600;
  font-size: 11px;
}

.step-label {
  font-size: 12px;
  color: var(--ink-faint);
  font-weight: 500;
  white-space: nowrap;
  transition: color var(--duration-fast) var(--ease-standard);
}

.step-connector {
  flex: 1;
  height: 1.5px;
  background: var(--border);
  margin: 0 8px;
  transition: background var(--duration-fast) var(--ease-standard);
}

.step-connector.filled {
  background: var(--accent);
}

.step.active .step-dot {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  animation: wonder-pulse 2s ease-in-out infinite;
}

.step.active .step-label {
  color: var(--accent);
  font-weight: 600;
}

.step.done .step-dot {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}

.step.done .step-label {
  color: var(--ink-caption);
}
</style>
