<template>
  <div class="settings-view">
    <h2>设置</h2>

    <el-form label-position="top" v-loading="configStore.loading">
      <el-card shadow="never" class="section-card">
        <template #header>
          <span class="section-title">模型配置</span>
        </template>

        <el-form-item label="模型提供商">
          <el-select
            v-model="configStore.config.model.provider"
            placeholder="选择模型提供商"
            @change="onProviderChange"
            style="width: 100%"
          >
            <el-option
              v-for="p in providers"
              :key="p.value"
              :label="p.label"
              :value="p.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="API Key">
          <el-input
            v-model="configStore.config.model.api_key"
            type="password"
            show-password
            placeholder="请输入 API Key"
          />
        </el-form-item>

        <el-form-item label="Base URL">
          <el-input
            v-model="configStore.config.model.base_url"
            placeholder="请输入 Base URL"
          />
        </el-form-item>

        <el-form-item label="模型名称">
          <el-input
            v-model="configStore.config.model.model_name"
            placeholder="请输入模型名称"
          />
        </el-form-item>
      </el-card>

      <el-card shadow="never" class="section-card">
        <template #header>
          <span class="section-title">研究背景</span>
        </template>

        <el-form-item label="研究背景">
          <el-input
            v-model="configStore.config.research.background"
            type="textarea"
            :rows="4"
            placeholder="请描述您的研究背景"
          />
        </el-form-item>

        <el-form-item label="写作风格">
          <el-select
            v-model="configStore.config.research.writing_style"
            placeholder="选择写作风格"
            style="width: 100%"
          >
            <el-option
              v-for="s in writingStyles"
              :key="s"
              :label="s"
              :value="s"
            />
          </el-select>
        </el-form-item>
      </el-card>

      <div class="save-bar">
        <el-button type="primary" @click="handleSave" :loading="configStore.loading">
          保存配置
        </el-button>
      </div>
    </el-form>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useConfigStore } from '../stores/config'

const configStore = useConfigStore()

const providers = [
  { label: 'MiniMax', value: 'MiniMax' },
  { label: 'GPT/OpenAI', value: 'GPT/OpenAI' },
  { label: 'Claude/Anthropic', value: 'Claude/Anthropic' },
  { label: 'DeepSeek', value: 'DeepSeek' },
  { label: 'MiMo/Xiaomi', value: 'MiMo/Xiaomi' },
  { label: '自定义', value: '自定义' },
]

const providerPresets = {
  'MiniMax': { base_url: 'https://api.minimaxi.com/v1', model_name: 'MiniMax-M2.7' },
  'GPT/OpenAI': { base_url: 'https://api.openai.com/v1', model_name: 'gpt-4o-mini' },
  'Claude/Anthropic': { base_url: 'https://api.anthropic.com/v1', model_name: 'claude-sonnet-4-6' },
  'DeepSeek': { base_url: 'https://api.deepseek.com', model_name: 'deepseek-chat' },
  'MiMo/Xiaomi': { base_url: 'https://api.xiaomimimo.com/v1', model_name: 'xiaomi/mimo-v2-flash' },
}

const writingStyles = [
  '本科毕业论文风格，表达清晰，避免过度复杂',
  '研究生论文风格，逻辑严密，论证充分',
  '项目报告风格，结构清晰，重点突出',
  '答辩汇报风格，简明扼要，层次分明',
]

function onProviderChange(provider) {
  const preset = providerPresets[provider]
  if (preset) {
    configStore.config.model.base_url = preset.base_url
    configStore.config.model.model_name = preset.model_name
  }
}

async function handleSave() {
  try {
    await configStore.saveConfig()
    ElMessage.success('配置保存成功')
  } catch (e) {
    ElMessage.error('配置保存失败：' + (e.message || '未知错误'))
  }
}

onMounted(() => {
  configStore.fetchConfig()
})
</script>

<style scoped>
.settings-view {
  max-width: 700px;
  margin: 0 auto;
}

.section-card {
  margin-bottom: 20px;
}

.section-title {
  font-weight: 600;
  font-size: 16px;
}

.save-bar {
  text-align: right;
}
</style>
