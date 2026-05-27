<template>
  <AppLayout>
    <section class="page-header">
      <h2>设置</h2>
    </section>
    <el-form label-position="top" :model="draft" class="settings-form">
      <el-form-item label="服务商">
        <el-select v-model="draft.model.provider">
          <el-option label="MiniMax" value="MiniMax" />
          <el-option label="GPT/OpenAI" value="GPT/OpenAI" />
          <el-option label="Claude/Anthropic" value="Claude/Anthropic" />
          <el-option label="DeepSeek" value="DeepSeek" />
          <el-option label="MiMo/Xiaomi" value="MiMo/Xiaomi" />
          <el-option label="自定义" value="自定义" />
        </el-select>
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="draft.model.apiKey" type="password" show-password />
      </el-form-item>
      <el-form-item label="Base URL">
        <el-input v-model="draft.model.baseUrl" />
      </el-form-item>
      <el-form-item label="模型名称">
        <el-input v-model="draft.model.modelName" />
      </el-form-item>
      <el-form-item label="研究背景">
        <el-input v-model="draft.research.background" type="textarea" :rows="5" />
      </el-form-item>
      <el-form-item label="写作风格">
        <el-input v-model="draft.research.writingStyle" type="textarea" :rows="3" />
      </el-form-item>
      <el-button type="primary" :loading="config.saving" @click="save">保存设置</el-button>
    </el-form>
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import { DEFAULT_CONFIG } from '@/lib/core/config'
import type { AppConfig } from '@/lib/llm/types'
import { useConfigStore } from '@/stores/config'

const config = useConfigStore()
const draft = reactive<AppConfig>(structuredClone(DEFAULT_CONFIG))

onMounted(async () => {
  await config.load()
  Object.assign(draft, structuredClone(config.config))
})

async function save() {
  await config.save(structuredClone(draft))
}
</script>

<style scoped>
.settings-form {
  max-width: 760px;
}
</style>
