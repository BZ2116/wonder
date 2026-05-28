# Phase 2: Frontend Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modern Vue 3 frontend with Vite that connects to the FastAPI backend, providing single analysis, history browsing, and configuration management.

**Architecture:** Vue 3 + Vite + Pinia state management + Vue Router + Element Plus UI library.

**Tech Stack:** Vue 3, Vite, Pinia, Vue Router, Element Plus, Axios

---

## File Structure

```
frontend/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js
│   ├── App.vue
│   ├── router/
│   │   └── index.js
│   ├── stores/
│   │   ├── config.js
│   │   └── analysis.js
│   ├── api/
│   │   └── index.js
│   ├── views/
│   │   ├── Home.vue
│   │   ├── History.vue
│   │   ├── HistoryDetail.vue
│   │   └── Settings.vue
│   ├── components/
│   │   ├── AppLayout.vue
│   │   ├── FileUpload.vue
│   │   ├── AnalysisResult.vue
│   │   └── WorkflowStatus.vue
│   └── styles/
│       └── main.css
```

---

### Task 1: Project Setup

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.js`
- Create: `frontend/src/App.vue`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "note-forge-frontend",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.3.0",
    "pinia": "^2.1.0",
    "element-plus": "^2.7.0",
    "axios": "^1.7.0",
    "@element-plus/icons-vue": "^2.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create vite.config.js**

```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 3: Create index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Note Forge</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create main.js**

```javascript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import './styles/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')
```

- [ ] **Step 5: Create App.vue**

```vue
<template>
  <router-view />
</template>

<script setup>
</script>
```

- [ ] **Step 6: Install dependencies and test**

Run: `cd "E:\.code\My\note-forge\frontend" && npm install && npm run dev`
Expected: Dev server starts on http://localhost:3000

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: initialize Vue 3 frontend with Vite"
```

---

### Task 2: Router and Layout

**Files:**
- Create: `frontend/src/router/index.js`
- Create: `frontend/src/components/AppLayout.vue`
- Create: `frontend/src/styles/main.css`

- [ ] **Step 1: Create router/index.js**

```javascript
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('../components/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'Home',
        component: () => import('../views/Home.vue'),
      },
      {
        path: '/history',
        name: 'History',
        component: () => import('../views/History.vue'),
      },
      {
        path: '/history/:id',
        name: 'HistoryDetail',
        component: () => import('../views/HistoryDetail.vue'),
      },
      {
        path: '/settings',
        name: 'Settings',
        component: () => import('../views/Settings.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
```

- [ ] **Step 2: Create components/AppLayout.vue**

```vue
<template>
  <el-container class="app-layout">
    <el-aside width="220px" class="sidebar">
      <div class="logo">
        <h1>Note Forge</h1>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="sidebar-menu"
      >
        <el-menu-item index="/">
          <el-icon><Document /></el-icon>
          <span>单篇分析</span>
        </el-menu-item>
        <el-menu-item index="/history">
          <el-icon><Clock /></el-icon>
          <span>历史记录</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <span>设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-main class="main-content">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Document, Clock, Setting } from '@element-plus/icons-vue'

const route = useRoute()
const activeMenu = computed(() => route.path)
</script>

<style scoped>
.app-layout {
  height: 100vh;
}

.sidebar {
  background: #1a1a2e;
  color: #fff;
}

.logo {
  padding: 20px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo h1 {
  color: #f0c040;
  font-size: 24px;
  margin: 0;
}

.sidebar-menu {
  border-right: none;
  background: transparent;
}

.sidebar-menu .el-menu-item {
  color: rgba(255, 255, 255, 0.8);
}

.sidebar-menu .el-menu-item:hover,
.sidebar-menu .el-menu-item.is-active {
  background: rgba(240, 192, 64, 0.2);
  color: #f0c040;
}

.main-content {
  background: #faf8f5;
  padding: 24px;
}
</style>
```

- [ ] **Step 3: Create styles/main.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Source Han Sans SC', 'Noto Sans SC', sans-serif;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Source Han Serif SC', 'Noto Serif SC', serif;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: add router and layout components"
```

---

### Task 3: API Client

**Files:**
- Create: `frontend/src/api/index.js`

- [ ] **Step 1: Create api/index.js**

```javascript
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5 min for long analysis
})

// Config
export const getConfig = () => api.get('/config')
export const updateConfig = (config) => api.put('/config', config)

// History
export const getHistory = () => api.get('/history')
export const getHistoryItem = (id) => api.get(`/history/${id}`)
export const deleteHistoryItem = (id) => api.delete(`/history/${id}`)

// Analysis
export const analyzeFile = (file, maxChars = 7000, overlap = 500) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('max_chars', maxChars)
  formData.append('overlap', overlap)
  return api.post('/analysis/single', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// Health
export const healthCheck = () => api.get('/health')

export default api
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/
git commit -m "feat: add API client"
```

---

### Task 4: Stores

**Files:**
- Create: `frontend/src/stores/config.js`
- Create: `frontend/src/stores/analysis.js`

- [ ] **Step 1: Create stores/config.js**

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getConfig, updateConfig } from '../api'

export const useConfigStore = defineStore('config', () => {
  const config = ref({
    model: {
      provider: 'MiniMax',
      api_key: '',
      base_url: 'https://api.minimaxi.com/v1',
      model_name: 'MiniMax-M2.7',
    },
    research: {
      background: '',
      writing_style: '本科毕业论文风格，表达清晰，避免过度复杂',
    },
    watch: {
      enabled: false,
      folder: 'data/watch',
      auto_delete_after_process: false,
    },
    analysis: {
      max_chars: 7000,
      overlap: 500,
    },
  })
  const loading = ref(false)

  async function fetchConfig() {
    loading.value = true
    try {
      const { data } = await getConfig()
      config.value = data
    } finally {
      loading.value = false
    }
  }

  async function saveConfig() {
    loading.value = true
    try {
      await updateConfig(config.value)
    } finally {
      loading.value = false
    }
  }

  return { config, loading, fetchConfig, saveConfig }
})
```

- [ ] **Step 2: Create stores/analysis.js**

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { analyzeFile } from '../api'

export const useAnalysisStore = defineStore('analysis', () => {
  const result = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function analyze(file, maxChars, overlap) {
    loading.value = true
    error.value = null
    result.value = null
    try {
      const { data } = await analyzeFile(file, maxChars, overlap)
      result.value = data
      return data
    } catch (e) {
      error.value = e.response?.data?.detail || e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  function clear() {
    result.value = null
    error.value = null
  }

  return { result, loading, error, analyze, clear }
})
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/
git commit -m "feat: add Pinia stores"
```

---

### Task 5: Home View (Single Analysis)

**Files:**
- Create: `frontend/src/views/Home.vue`
- Create: `frontend/src/components/FileUpload.vue`
- Create: `frontend/src/components/AnalysisResult.vue`
- Create: `frontend/src/components/WorkflowStatus.vue`

- [ ] **Step 1: Create components/FileUpload.vue**

```vue
<template>
  <el-upload
    ref="uploadRef"
    class="file-upload"
    drag
    :auto-upload="false"
    :limit="1"
    :on-change="handleChange"
    :on-exceed="handleExceed"
    accept=".pdf,.txt,.md,.docx"
  >
    <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
    <div class="el-upload__text">
      拖拽文件到此处，或 <em>点击上传</em>
    </div>
    <template #tip>
      <div class="el-upload__tip">
        支持 PDF、TXT、Markdown、DOCX 格式
      </div>
    </template>
  </el-upload>
</template>

<script setup>
import { ref } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['file-selected'])
const uploadRef = ref(null)

function handleChange(file) {
  emit('file-selected', file.raw)
}

function handleExceed() {
  ElMessage.warning('只能上传一个文件，请先移除已选文件')
}

function clear() {
  uploadRef.value?.clearFiles()
}

defineExpose({ clear })
</script>

<style scoped>
.file-upload {
  width: 100%;
}

.file-upload :deep(.el-upload-dragger) {
  border-color: #f0c040;
  border-radius: 12px;
  padding: 40px;
}

.file-upload :deep(.el-upload-dragger:hover) {
  border-color: #d4a830;
}
</style>
```

- [ ] **Step 2: Create components/WorkflowStatus.vue**

```vue
<template>
  <div class="workflow-status">
    <div
      v-for="step in steps"
      :key="step.id"
      class="step"
      :class="step.status"
    >
      <div class="step-icon">{{ step.id }}</div>
      <div class="step-name">{{ step.name }}</div>
      <div class="step-status">{{ step.label }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentStep: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
})

const stepDefs = [
  { id: 1, name: '文献解析' },
  { id: 2, name: '项目关联' },
  { id: 3, name: '写作辅助' },
  { id: 4, name: '任务规划' },
]

const steps = computed(() =>
  stepDefs.map((s) => ({
    ...s,
    status: props.loading
      ? s.id === props.currentStep
        ? 'active'
        : s.id < props.currentStep
        ? 'done'
        : 'pending'
      : 'done',
    label: props.loading
      ? s.id === props.currentStep
        ? '处理中...'
        : s.id < props.currentStep
        ? '已完成'
        : '等待中'
      : '已完成',
  }))
)
</script>

<style scoped>
.workflow-status {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.step {
  flex: 1;
  text-align: center;
  padding: 16px;
  border-radius: 8px;
  background: #f5f5f5;
}

.step.active {
  background: #fff8e1;
  border: 2px solid #f0c040;
}

.step.done {
  background: #e8f5e9;
}

.step-icon {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 8px;
}

.step-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.step-status {
  font-size: 12px;
  color: #666;
}
</style>
```

- [ ] **Step 3: Create components/AnalysisResult.vue**

```vue
<template>
  <div class="analysis-result" v-if="result">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="阅读卡片" name="reading_card">
        <div class="markdown-body" v-html="renderMarkdown(result.reading_card)" />
      </el-tab-pane>
      <el-tab-pane label="项目关联" name="relation">
        <div class="markdown-body" v-html="renderMarkdown(result.relation_analysis)" />
      </el-tab-pane>
      <el-tab-pane label="写作素材" name="writing">
        <div class="markdown-body" v-html="renderMarkdown(result.writing_materials)" />
      </el-tab-pane>
      <el-tab-pane label="待办清单" name="todo">
        <div class="markdown-body" v-html="renderMarkdown(result.todo_list)" />
      </el-tab-pane>
      <el-tab-pane label="完整报告" name="full">
        <el-button @click="downloadReport" type="primary" style="margin-bottom: 16px">
          下载 Markdown 报告
        </el-button>
        <div class="markdown-body" v-html="renderMarkdown(result.full_report)" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  result: { type: Object, default: null },
})

const activeTab = ref('reading_card')

function renderMarkdown(text) {
  if (!text) return ''
  // Simple markdown rendering (headers, bold, lists)
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
}

function downloadReport() {
  if (!props.result?.full_report) return
  const blob = new Blob([props.result.full_report], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.result.file_name}_analysis.md`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.markdown-body {
  line-height: 1.8;
  padding: 16px;
}

.markdown-body :deep(h1) {
  font-size: 24px;
  margin: 16px 0 8px;
  color: #1a1a2e;
}

.markdown-body :deep(h2) {
  font-size: 20px;
  margin: 14px 0 6px;
  color: #2d2d4e;
}

.markdown-body :deep(h3) {
  font-size: 16px;
  margin: 12px 0 4px;
}

.markdown-body :deep(ul) {
  padding-left: 20px;
}

.markdown-body :deep(li) {
  margin: 4px 0;
}
</style>
```

- [ ] **Step 4: Create views/Home.vue**

```vue
<template>
  <div class="home-view">
    <h2>单篇分析</h2>
    <p class="subtitle">上传论文或技术文档，AI 自动生成结构化阅读卡片</p>

    <el-card class="upload-card">
      <FileUpload ref="uploadRef" @file-selected="onFileSelected" />

      <div v-if="selectedFile" class="file-info">
        <el-tag>{{ selectedFile.name }}</el-tag>
        <el-tag type="info">{{ formatSize(selectedFile.size) }}</el-tag>
      </div>

      <el-button
        type="primary"
        size="large"
        :loading="analysisStore.loading"
        :disabled="!selectedFile"
        @click="startAnalysis"
        class="analyze-btn"
      >
        开始分析
      </el-button>
    </el-card>

    <WorkflowStatus
      v-if="analysisStore.loading"
      :current-step="currentStep"
      :loading="true"
    />

    <el-alert
      v-if="analysisStore.error"
      :title="analysisStore.error"
      type="error"
      show-icon
      closable
      style="margin: 16px 0"
    />

    <AnalysisResult :result="analysisStore.result" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAnalysisStore } from '../stores/analysis'
import FileUpload from '../components/FileUpload.vue'
import WorkflowStatus from '../components/WorkflowStatus.vue'
import AnalysisResult from '../components/AnalysisResult.vue'

const analysisStore = useAnalysisStore()
const selectedFile = ref(null)
const uploadRef = ref(null)
const currentStep = ref(1)

function onFileSelected(file) {
  selectedFile.value = file
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

async function startAnalysis() {
  if (!selectedFile.value) return

  // Simulate step progress
  currentStep.value = 1
  const stepInterval = setInterval(() => {
    if (currentStep.value < 4) currentStep.value++
  }, 10000)

  try {
    await analysisStore.analyze(selectedFile.value)
  } finally {
    clearInterval(stepInterval)
    currentStep.value = 0
  }
}
</script>

<style scoped>
.home-view {
  max-width: 900px;
  margin: 0 auto;
}

.subtitle {
  color: #666;
  margin-bottom: 24px;
}

.upload-card {
  margin-bottom: 24px;
}

.file-info {
  margin: 16px 0;
  display: flex;
  gap: 8px;
}

.analyze-btn {
  width: 100%;
  margin-top: 16px;
  background: #1a1a2e;
  border-color: #1a1a2e;
}

.analyze-btn:hover {
  background: #2d2d4e;
}
</style>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: add Home view with file upload and analysis"
```

---

### Task 6: History View

**Files:**
- Create: `frontend/src/views/History.vue`
- Create: `frontend/src/views/HistoryDetail.vue`

- [ ] **Step 1: Create views/History.vue**

```vue
<template>
  <div class="history-view">
    <h2>历史记录</h2>
    <p class="subtitle">查看和管理历史分析记录</p>

    <el-input
      v-model="search"
      placeholder="搜索文件名..."
      prefix-icon="Search"
      clearable
      class="search-input"
    />

    <el-table :data="filteredItems" v-loading="loading" stripe>
      <el-table-column prop="file_name" label="文件名" />
      <el-table-column prop="model" label="模型" width="150" />
      <el-table-column prop="summary" label="摘要" show-overflow-tooltip />
      <el-table-column prop="created_at" label="时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row.id)">查看</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getHistory, deleteHistoryItem } from '../api'

const router = useRouter()
const items = ref([])
const loading = ref(false)
const search = ref('')

const filteredItems = computed(() => {
  if (!search.value) return items.value
  return items.value.filter((item) =>
    item.file_name.toLowerCase().includes(search.value.toLowerCase())
  )
})

function formatDate(iso) {
  return new Date(iso).toLocaleString('zh-CN')
}

function viewDetail(id) {
  router.push(`/history/${id}`)
}

async function handleDelete(id) {
  try {
    await ElMessageBox.confirm('确定删除这条记录？', '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await deleteHistoryItem(id)
    items.value = items.value.filter((item) => item.id !== id)
    ElMessage.success('已删除')
  } catch {
    // cancelled
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await getHistory()
    items.value = data.items
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.history-view {
  max-width: 1100px;
  margin: 0 auto;
}

.subtitle {
  color: #666;
  margin-bottom: 24px;
}

.search-input {
  margin-bottom: 16px;
}
</style>
```

- [ ] **Step 2: Create views/HistoryDetail.vue**

```vue
<template>
  <div class="history-detail" v-loading="loading">
    <el-page-header @back="$router.push('/history')" :title="'返回历史记录'" />

    <h2 v-if="item">{{ item.file_name }}</h2>

    <AnalysisResult v-if="item" :result="item" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getHistoryItem } from '../api'
import AnalysisResult from '../components/AnalysisResult.vue'

const route = useRoute()
const item = ref(null)
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await getHistoryItem(route.params.id)
    item.value = data
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.history-detail {
  max-width: 900px;
  margin: 0 auto;
}

h2 {
  margin: 16px 0 24px;
}
</style>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/
git commit -m "feat: add History views"
```

---

### Task 7: Settings View

**Files:**
- Create: `frontend/src/views/Settings.vue`

- [ ] **Step 1: Create views/Settings.vue**

```vue
<template>
  <div class="settings-view">
    <h2>设置</h2>
    <p class="subtitle">配置模型和研究背景</p>

    <el-form label-width="120px" v-loading="configStore.loading">
      <el-card class="section">
        <template #header>模型配置</template>

        <el-form-item label="服务商">
          <el-select v-model="configStore.config.model.provider" @change="onProviderChange">
            <el-option label="MiniMax" value="MiniMax" />
            <el-option label="OpenAI" value="GPT / OpenAI" />
            <el-option label="Anthropic" value="Claude / Anthropic" />
            <el-option label="DeepSeek" value="DeepSeek" />
            <el-option label="MiMo" value="MiMo / Xiaomi" />
            <el-option label="自定义" value="自定义" />
          </el-select>
        </el-form-item>

        <el-form-item label="API Key">
          <el-input v-model="configStore.config.model.api_key" type="password" show-password />
        </el-form-item>

        <el-form-item label="Base URL">
          <el-input v-model="configStore.config.model.base_url" />
        </el-form-item>

        <el-form-item label="模型名称">
          <el-input v-model="configStore.config.model.model_name" />
        </el-form-item>
      </el-card>

      <el-card class="section">
        <template #header>研究背景</template>

        <el-form-item label="研究方向">
          <el-input
            v-model="configStore.config.research.background"
            type="textarea"
            :rows="4"
            placeholder="描述你的研究方向和当前项目..."
          />
        </el-form-item>

        <el-form-item label="写作风格">
          <el-select v-model="configStore.config.research.writing_style">
            <el-option label="本科毕业论文风格" value="本科毕业论文风格，表达清晰，避免过度复杂" />
            <el-option label="研究生论文风格" value="研究生论文风格，偏正式、强调研究逻辑" />
            <el-option label="项目报告风格" value="项目报告风格，强调工程流程和落地价值" />
            <el-option label="答辩汇报风格" value="答辩汇报风格，强调问题、方法、结果和贡献" />
          </el-select>
        </el-form-item>
      </el-card>

      <el-button type="primary" @click="save" :loading="saving" class="save-btn">
        保存配置
      </el-button>
    </el-form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useConfigStore } from '../stores/config'

const configStore = useConfigStore()
const saving = ref(false)

const providerMap = {
  'MiniMax': { base_url: 'https://api.minimaxi.com/v1', model_name: 'MiniMax-M2.7' },
  'GPT / OpenAI': { base_url: 'https://api.openai.com/v1', model_name: 'gpt-4o-mini' },
  'Claude / Anthropic': { base_url: 'https://api.anthropic.com/v1', model_name: 'claude-sonnet-4-6' },
  'DeepSeek': { base_url: 'https://api.deepseek.com', model_name: 'deepseek-chat' },
  'MiMo / Xiaomi': { base_url: 'https://api.xiaomimimo.com/v1', model_name: 'xiaomi/mimo-v2-flash' },
}

function onProviderChange(provider) {
  const preset = providerMap[provider]
  if (preset) {
    configStore.config.model.base_url = preset.base_url
    configStore.config.model.model_name = preset.model_name
  }
}

async function save() {
  saving.value = true
  try {
    await configStore.saveConfig()
    ElMessage.success('配置已保存')
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.message || '未知错误'))
  } finally {
    saving.value = false
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

.subtitle {
  color: #666;
  margin-bottom: 24px;
}

.section {
  margin-bottom: 24px;
}

.save-btn {
  width: 100%;
  background: #1a1a2e;
  border-color: #1a1a2e;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/Settings.vue
git commit -m "feat: add Settings view"
```

---

### Task 8: Final Integration

- [ ] **Step 1: Verify all imports and routes**

Run: `cd "E:\.code\My\note-forge\frontend" && npm run dev`
Expected: Dev server starts, all pages load without errors

- [ ] **Step 2: Test full flow**

1. Open http://localhost:3000
2. Go to Settings, configure API key
3. Go to Home, upload a file, click "开始分析"
4. Wait for analysis to complete
5. Go to History, verify record appears
6. Click record, verify detail view

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "feat: complete frontend (Phase 2)"
```
