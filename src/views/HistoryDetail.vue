<template>
  <AppLayout>
    <section class="page-header">
      <h2>{{ record?.fileName || '历史详情' }}</h2>
    </section>
    <AnalysisResult v-if="record" :result="record" />
    <el-empty v-else description="记录不存在" />
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import AnalysisResult from '@/components/AnalysisResult.vue'
import type { HistoryRecord } from '@/lib/core/history'
import { useAnalysisStore } from '@/stores/analysis'

const props = defineProps<{ id: string }>()
const analysis = useAnalysisStore()
const record = ref<HistoryRecord | null>(null)

onMounted(async () => {
  record.value = await analysis.loadHistoryRecord(props.id)
})
</script>
