<template>
  <AppLayout>
    <section class="page-header">
      <h2>单篇分析</h2>
      <p>选择论文或技术文档，生成阅读卡片、关联分析、写作素材和后续任务。</p>
    </section>

    <FileUpload :file-name="analysis.selectedName" @selected="analysis.selectFilePath" />

    <div class="actions">
      <el-button type="primary" size="large" :loading="analysis.loading" :disabled="!analysis.selectedPath" @click="analysis.analyzeSelectedFile">
        开始分析
      </el-button>
    </div>

    <WorkflowStatus v-if="analysis.loading" :current-step="analysis.currentStep" />

    <el-alert v-if="analysis.error" :title="analysis.error" type="error" show-icon class="alert" />

    <el-input
      v-if="analysis.loading && analysis.streamText"
      :model-value="analysis.streamText"
      type="textarea"
      :rows="8"
      readonly
      class="stream-box"
    />

    <AnalysisResult :result="analysis.result" />
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import AnalysisResult from '@/components/AnalysisResult.vue'
import FileUpload from '@/components/FileUpload.vue'
import WorkflowStatus from '@/components/WorkflowStatus.vue'
import { useAnalysisStore } from '@/stores/analysis'
import { useConfigStore } from '@/stores/config'

const analysis = useAnalysisStore()
const config = useConfigStore()

onMounted(() => {
  if (!config.loaded) void config.load()
})
</script>

<style scoped>
.page-header {
  margin-bottom: 22px;
}

.page-header h2 {
  margin: 0 0 8px;
}

.page-header p {
  margin: 0;
  color: #666;
}

.actions {
  margin-top: 16px;
}

.actions .el-button {
  width: 100%;
  background: #1a1a2e;
  border-color: #1a1a2e;
}

.alert,
.stream-box {
  margin-top: 16px;
}
</style>
