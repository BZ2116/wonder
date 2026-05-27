<template>
  <AppLayout>
    <section class="page-header">
      <h2>历史记录</h2>
    </section>
    <el-table :data="records" stripe>
      <el-table-column prop="fileName" label="文件" />
      <el-table-column prop="model" label="模型" width="180" />
      <el-table-column prop="createdAt" label="时间" width="220" />
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button text type="primary" @click="$router.push(`/history/${row.id}`)">查看</el-button>
          <el-button text type="danger" @click="remove(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
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
