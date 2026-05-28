# Note-Forge Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Note-Forge from the current FastAPI + Vue web app into a Tauri 2 desktop app that keeps single-document analysis, settings, and history without requiring Python at runtime.

**Architecture:** Build a new root-level Tauri 2 + Vue 3 + TypeScript app while keeping the existing `backend/` and `frontend/` folders as migration references until parity is verified. Core analysis logic moves into `src/lib/`, UI into `src/views` and `src/components`, and persistence uses Tauri app data JSON files through a small storage adapter. LLM calls run from TypeScript with OpenAI-compatible and Anthropic streaming support.

**Tech Stack:** Tauri 2, Vue 3, Vite 5, TypeScript 5, Element Plus, Pinia, Vue Router, Vitest, pdfjs-dist, mammoth, markdown-it, @tauri-apps/api 2.x, @tauri-apps/plugin-fs, @tauri-apps/plugin-dialog, @tauri-apps/plugin-notification.

---

## File Structure

```
note-forge/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── icons/
│   └── src/
│       ├── main.rs
│       └── lib.rs
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── router/index.ts
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
│   ├── stores/
│   │   ├── analysis.ts
│   │   └── config.ts
│   ├── lib/
│   │   ├── agents/
│   │   │   ├── base.ts
│   │   │   ├── literature.ts
│   │   │   ├── relation.ts
│   │   │   ├── writing.ts
│   │   │   ├── todo.ts
│   │   │   └── qa.ts
│   │   ├── analysis/
│   │   │   └── pipeline.ts
│   │   ├── core/
│   │   │   ├── chunker.ts
│   │   │   ├── config.ts
│   │   │   ├── file-reader.ts
│   │   │   ├── history.ts
│   │   │   └── storage.ts
│   │   ├── llm/
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   └── utils/
│   │       └── markdown.ts
│   ├── styles/main.css
│   └── test/
│       ├── setup.ts
│       └── fixtures.ts
├── tests/
│   ├── chunker.test.ts
│   ├── config.test.ts
│   ├── history.test.ts
│   ├── llm-client.test.ts
│   ├── agents.test.ts
│   └── pipeline.test.ts
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tsconfig.node.json
```

Existing migration references:

- `backend/core/file_reader.py`, `backend/core/chunker.py`, `backend/core/config.py`, `backend/core/history.py`
- `backend/core/llm_client.py`
- `backend/agents/*.py`
- `backend/api/analysis.py`
- `frontend/src/views/*.vue`, `frontend/src/components/*.vue`, `frontend/src/stores/*.js`, `frontend/src/styles/main.css`

---

### Task 1: Scaffold Root Desktop App

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/App.vue`
- Create: `src/styles/main.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "note-forge-desktop",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "@element-plus/icons-vue": "^2.3.0",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-dialog": "^2.0.0",
    "@tauri-apps/plugin-fs": "^2.0.0",
    "@tauri-apps/plugin-notification": "^2.0.0",
    "element-plus": "^2.7.0",
    "mammoth": "^1.8.0",
    "markdown-it": "^14.1.0",
    "pdfjs-dist": "^4.10.38",
    "pinia": "^2.1.0",
    "vue": "^3.4.0",
    "vue-router": "^4.3.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/markdown-it": "^14.1.2",
    "@vitejs/plugin-vue": "^5.0.0",
    "@vue/test-utils": "^2.4.6",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "vue-tsc": "^2.1.6"
  }
}
```

- [ ] **Step 2: Create Vite and TypeScript config**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "tests/**/*.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

```json
// tsconfig.node.json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Create minimal Vue entry**

```html
<!-- index.html -->
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
```

```ts
// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './styles/main.css'
import App from './App.vue'
import router from './router'

createApp(App).use(createPinia()).use(router).use(ElementPlus).mount('#app')
```

```vue
<!-- src/App.vue -->
<template>
  <RouterView />
</template>
```

```css
/* src/styles/main.css */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 960px;
  background: #faf8f5;
  color: #222;
  font-family: Inter, "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
}

#app {
  min-height: 100vh;
}
```

- [ ] **Step 4: Create minimal Tauri 2 shell**

```toml
# src-tauri/Cargo.toml
[package]
name = "note-forge"
version = "2.0.0"
description = "Note-Forge desktop research assistant"
authors = ["Note-Forge"]
edition = "2021"

[lib]
name = "note_forge_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-notification = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

```json
// src-tauri/tauri.conf.json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Note Forge",
  "version": "2.0.0",
  "identifier": "com.noteforge.desktop",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Note Forge",
        "width": 1200,
        "height": 820,
        "minWidth": 960,
        "minHeight": 680
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": []
  }
}
```

```rust
// src-tauri/src/main.rs
fn main() {
    note_forge_lib::run()
}
```

```rust
// src-tauri/src/lib.rs
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running Note Forge");
}
```

```json
// src-tauri/capabilities/default.json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default desktop permissions",
  "windows": ["main"],
  "permissions": [
    "dialog:default",
    "fs:default",
    "fs:allow-app-read",
    "fs:allow-app-write",
    "fs:allow-read-file",
    "notification:default"
  ]
}
```

- [ ] **Step 5: Install and verify**

Run: `cd "E:\.code\My\note-forge" && npm install`

Expected: `package-lock.json` is created and dependencies install without errors.

Run: `cd "E:\.code\My\note-forge" && npm run build`

Expected: TypeScript and Vite build pass and create `dist/`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.node.json index.html src src-tauri
git commit -m "feat: scaffold Tauri Vue desktop app"
```

---

### Task 2: Router and Layout Shell

**Files:**
- Create: `src/router/index.ts`
- Create: `src/components/AppLayout.vue`
- Create: `src/views/Home.vue`
- Create: `src/views/History.vue`
- Create: `src/views/HistoryDetail.vue`
- Create: `src/views/Settings.vue`

- [ ] **Step 1: Add router**

```ts
// src/router/index.ts
import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '@/views/Home.vue'
import History from '@/views/History.vue'
import HistoryDetail from '@/views/HistoryDetail.vue'
import Settings from '@/views/Settings.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/history', name: 'history', component: History },
    { path: '/history/:id', name: 'history-detail', component: HistoryDetail, props: true },
    { path: '/settings', name: 'settings', component: Settings },
  ],
})

export default router
```

- [ ] **Step 2: Add desktop layout**

```vue
<!-- src/components/AppLayout.vue -->
<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">NF</div>
        <div>
          <h1>Note Forge</h1>
          <p>Research Desk</p>
        </div>
      </div>
      <nav>
        <RouterLink to="/">单篇分析</RouterLink>
        <RouterLink to="/history">历史记录</RouterLink>
        <RouterLink to="/settings">设置</RouterLink>
      </nav>
    </aside>
    <main class="content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
}

.sidebar {
  background: #1a1a2e;
  color: #fff;
  padding: 24px 18px;
}

.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 32px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid #f0c040;
  color: #f0c040;
  font-weight: 700;
}

.brand h1 {
  margin: 0;
  font-size: 19px;
}

.brand p {
  margin: 4px 0 0;
  color: #c8c8d8;
  font-size: 12px;
}

nav {
  display: grid;
  gap: 8px;
}

nav a {
  color: #d8d8e8;
  text-decoration: none;
  padding: 10px 12px;
  border-radius: 6px;
}

nav a.router-link-active {
  background: #f0c040;
  color: #1a1a2e;
  font-weight: 700;
}

.content {
  min-width: 0;
  padding: 28px;
  background: #faf8f5;
}
</style>
```

- [ ] **Step 3: Add placeholder views wired through layout**

```vue
<!-- src/views/Home.vue -->
<template>
  <AppLayout>
    <h2>单篇分析</h2>
  </AppLayout>
</template>

<script setup lang="ts">
import AppLayout from '@/components/AppLayout.vue'
</script>
```

```vue
<!-- src/views/History.vue -->
<template>
  <AppLayout>
    <h2>历史记录</h2>
  </AppLayout>
</template>

<script setup lang="ts">
import AppLayout from '@/components/AppLayout.vue'
</script>
```

```vue
<!-- src/views/HistoryDetail.vue -->
<template>
  <AppLayout>
    <h2>历史详情</h2>
  </AppLayout>
</template>

<script setup lang="ts">
import AppLayout from '@/components/AppLayout.vue'
</script>
```

```vue
<!-- src/views/Settings.vue -->
<template>
  <AppLayout>
    <h2>设置</h2>
  </AppLayout>
</template>

<script setup lang="ts">
import AppLayout from '@/components/AppLayout.vue'
</script>
```

- [ ] **Step 4: Build**

Run: `cd "E:\.code\My\note-forge" && npm run build`

Expected: Build passes and all routes compile.

- [ ] **Step 5: Commit**

```bash
git add src/router src/components/AppLayout.vue src/views
git commit -m "feat: add desktop layout and routes"
```

---

### Task 3: Core Types, Storage Adapter, and Defaults

**Files:**
- Create: `src/lib/llm/types.ts`
- Create: `src/lib/core/storage.ts`
- Create: `src/lib/core/config.ts`
- Create: `src/test/setup.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Define shared types**

```ts
// src/lib/llm/types.ts
export type ProviderName =
  | 'MiniMax'
  | 'GPT/OpenAI'
  | 'Claude/Anthropic'
  | 'DeepSeek'
  | 'MiMo/Xiaomi'
  | '自定义'

export interface LLMConfig {
  provider: ProviderName
  apiKey: string
  baseUrl: string
  modelName: string
}

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMUsage {
  prompt: number
  completion: number
}

export interface LLMResponse {
  content: string
  usage?: LLMUsage
}

export interface AppConfig {
  model: LLMConfig
  research: {
    background: string
    writingStyle: string
  }
  analysis: {
    maxChars: number
    overlap: number
  }
}
```

- [ ] **Step 2: Add storage adapter with in-memory test adapter**

```ts
// src/lib/core/storage.ts
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile, remove } from '@tauri-apps/plugin-fs'

export interface StorageAdapter {
  readText(path: string): Promise<string | null>
  writeText(path: string, content: string): Promise<void>
  remove(path: string): Promise<void>
  ensureDir(path: string): Promise<void>
}

export class TauriStorageAdapter implements StorageAdapter {
  async readText(path: string): Promise<string | null> {
    if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return null
    return readTextFile(path, { baseDir: BaseDirectory.AppData })
  }

  async writeText(path: string, content: string): Promise<void> {
    const slash = path.lastIndexOf('/')
    if (slash > -1) await this.ensureDir(path.slice(0, slash))
    await writeTextFile(path, content, { baseDir: BaseDirectory.AppData })
  }

  async remove(path: string): Promise<void> {
    if (await exists(path, { baseDir: BaseDirectory.AppData })) {
      await remove(path, { baseDir: BaseDirectory.AppData })
    }
  }

  async ensureDir(path: string): Promise<void> {
    if (!path) return
    if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true })
    }
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private files = new Map<string, string>()

  async readText(path: string): Promise<string | null> {
    return this.files.get(path) ?? null
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path)
  }

  async ensureDir(_path: string): Promise<void> {}

  keys(): string[] {
    return [...this.files.keys()]
  }
}
```

- [ ] **Step 3: Write failing config tests**

```ts
// tests/config.test.ts
import { describe, expect, it } from 'vitest'
import { ConfigManager, DEFAULT_CONFIG } from '@/lib/core/config'
import { MemoryStorageAdapter } from '@/lib/core/storage'

describe('ConfigManager', () => {
  it('creates default config when no file exists', async () => {
    const storage = new MemoryStorageAdapter()
    const manager = new ConfigManager(storage)

    const config = await manager.load()

    expect(config.model.provider).toBe(DEFAULT_CONFIG.model.provider)
    expect(config.analysis.maxChars).toBe(7000)
  })

  it('persists updated config', async () => {
    const storage = new MemoryStorageAdapter()
    const manager = new ConfigManager(storage)

    const config = await manager.load()
    config.model.provider = 'DeepSeek'
    config.model.baseUrl = 'https://api.deepseek.com/v1'
    await manager.save(config)

    const reloaded = await manager.load()
    expect(reloaded.model.provider).toBe('DeepSeek')
    expect(reloaded.model.baseUrl).toBe('https://api.deepseek.com/v1')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/config.test.ts`

Expected: FAIL because `src/lib/core/config.ts` does not exist.

- [ ] **Step 5: Implement config manager**

```ts
// src/lib/core/config.ts
import type { AppConfig } from '@/lib/llm/types'
import type { StorageAdapter } from './storage'

export const DEFAULT_CONFIG: AppConfig = {
  model: {
    provider: 'MiniMax',
    apiKey: '',
    baseUrl: 'https://api.minimaxi.com/v1',
    modelName: 'MiniMax-M2.7',
  },
  research: {
    background: 'I am a student interested in AI and research.',
    writingStyle: '本科毕业论文风格，表达清晰，避免过度复杂',
  },
  analysis: {
    maxChars: 7000,
    overlap: 500,
  },
}

export class ConfigManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly path = 'config.json',
  ) {}

  async load(): Promise<AppConfig> {
    const raw = await this.storage.readText(this.path)
    if (!raw) {
      await this.save(DEFAULT_CONFIG)
      return structuredClone(DEFAULT_CONFIG)
    }
    return { ...structuredClone(DEFAULT_CONFIG), ...JSON.parse(raw) } as AppConfig
  }

  async save(config: AppConfig): Promise<void> {
    await this.storage.writeText(this.path, JSON.stringify(config, null, 2))
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/config.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/llm/types.ts src/lib/core/storage.ts src/lib/core/config.ts tests/config.test.ts
git commit -m "feat: add desktop config persistence"
```

---

### Task 4: Chunker

**Files:**
- Create: `src/lib/core/chunker.ts`
- Create: `tests/chunker.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/chunker.test.ts
import { describe, expect, it } from 'vitest'
import { chunkText, estimateTokens } from '@/lib/core/chunker'

describe('chunkText', () => {
  it('returns one chunk for short text', () => {
    expect(chunkText('hello', 100, 10)).toEqual(['hello'])
  })

  it('splits long text with overlap', () => {
    const text = 'a'.repeat(2000)
    const chunks = chunkText(text, 1000, 100)
    expect(chunks).toHaveLength(3)
    expect(chunks[1]).toHaveLength(1000)
    expect(chunks[1].slice(0, 100)).toBe(text.slice(900, 1000))
  })

  it('rejects invalid overlap', () => {
    expect(() => chunkText('abc', 100, 100)).toThrow('overlap must be smaller')
  })
})

describe('estimateTokens', () => {
  it('estimates by char length', () => {
    expect(estimateTokens('a'.repeat(300))).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/chunker.test.ts`

Expected: FAIL because `chunker.ts` does not exist.

- [ ] **Step 3: Implement chunker**

```ts
// src/lib/core/chunker.ts
export function chunkText(text: string, maxChars = 7000, overlap = 500): string[] {
  if (maxChars <= 0) throw new Error('maxChars must be positive')
  if (overlap < 0) throw new Error('overlap must be non-negative')
  if (overlap >= maxChars) throw new Error('overlap must be smaller than maxChars')

  const normalized = text.trim()
  if (!normalized) return []
  if (normalized.length <= maxChars) return [normalized]

  const chunks: string[] = []
  let start = 0

  while (start < normalized.length) {
    const end = Math.min(start + maxChars, normalized.length)
    chunks.push(normalized.slice(start, end))
    if (end >= normalized.length) break
    start = end - overlap
  }

  return chunks
}

export function estimateTokens(text: string): number {
  return Math.floor(text.length / 1.5)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/chunker.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/chunker.ts tests/chunker.test.ts
git commit -m "feat: port text chunker to TypeScript"
```

---

### Task 5: LLM Client With Streaming

**Files:**
- Create: `src/lib/llm/client.ts`
- Create: `tests/llm-client.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/llm-client.test.ts
import { describe, expect, it, vi } from 'vitest'
import { callLLM, callLLMStream } from '@/lib/llm/client'
import type { LLMConfig } from '@/lib/llm/types'

const openAiConfig: LLMConfig = {
  provider: 'DeepSeek',
  apiKey: 'key',
  baseUrl: 'https://api.example.com/v1',
  modelName: 'model',
}

describe('LLM client', () => {
  it('calls OpenAI-compatible chat completions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 1, completion_tokens: 2 },
      }),
    }))

    const result = await callLLM(openAiConfig, [{ role: 'user', content: 'hi' }])

    expect(result.content).toBe('hello')
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('parses OpenAI-compatible SSE chunks', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"he"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"llo"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }))

    const chunks: string[] = []
    const result = await callLLMStream(openAiConfig, [{ role: 'user', content: 'hi' }], text => chunks.push(text))

    expect(chunks).toEqual(['he', 'llo'])
    expect(result.content).toBe('hello')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/llm-client.test.ts`

Expected: FAIL because `client.ts` does not exist.

- [ ] **Step 3: Implement LLM client**

```ts
// src/lib/llm/client.ts
import type { LLMConfig, LLMResponse, Message } from './types'

export class LLMCallError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LLMCallError'
  }
}

export async function callLLM(config: LLMConfig, messages: Message[]): Promise<LLMResponse> {
  if (config.provider === 'Claude/Anthropic') return callAnthropic(config, messages)
  return callOpenAICompatible(config, messages)
}

export async function callLLMStream(
  config: LLMConfig,
  messages: Message[],
  onChunk: (text: string) => void,
): Promise<LLMResponse> {
  if (config.provider === 'Claude/Anthropic') {
    return callAnthropicStream(config, messages, onChunk)
  }
  return callOpenAICompatibleStream(config, messages, onChunk)
}

async function callOpenAICompatible(config: LLMConfig, messages: Message[]): Promise<LLMResponse> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.modelName,
      messages,
      temperature: 0.2,
      max_tokens: 3500,
    }),
  })
  const data = await readJsonResponse(response)
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new LLMCallError('Model returned empty response.')
  return {
    content,
    usage: data.usage
      ? { prompt: data.usage.prompt_tokens ?? 0, completion: data.usage.completion_tokens ?? 0 }
      : undefined,
  }
}

async function callOpenAICompatibleStream(
  config: LLMConfig,
  messages: Message[],
  onChunk: (text: string) => void,
): Promise<LLMResponse> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.modelName,
      messages,
      temperature: 0.2,
      max_tokens: 3500,
      stream: true,
    }),
  })
  return readSse(response, line => {
    const delta = line.choices?.[0]?.delta?.content ?? ''
    if (delta) onChunk(delta)
    return delta
  })
}

async function callAnthropic(config: LLMConfig, messages: Message[]): Promise<LLMResponse> {
  const system = messages.find(message => message.role === 'system')?.content ?? ''
  const userMessages = messages.filter(message => message.role !== 'system')
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.modelName,
      system,
      messages: userMessages,
      temperature: 0.2,
      max_tokens: 3500,
    }),
  })
  const data = await readJsonResponse(response)
  const content = (data.content ?? [])
    .filter((item: { type: string }) => item.type === 'text')
    .map((item: { text: string }) => item.text)
    .join('\n')
    .trim()
  if (!content) throw new LLMCallError('Model returned empty response.')
  return { content }
}

async function callAnthropicStream(
  config: LLMConfig,
  messages: Message[],
  onChunk: (text: string) => void,
): Promise<LLMResponse> {
  const system = messages.find(message => message.role === 'system')?.content ?? ''
  const userMessages = messages.filter(message => message.role !== 'system')
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.modelName,
      system,
      messages: userMessages,
      temperature: 0.2,
      max_tokens: 3500,
      stream: true,
    }),
  })
  return readSse(response, line => {
    const delta = line.type === 'content_block_delta' ? line.delta?.text ?? '' : ''
    if (delta) onChunk(delta)
    return delta
  })
}

async function readJsonResponse(response: Response): Promise<any> {
  if (!response.ok) {
    const body = await response.text()
    throw new LLMCallError(`LLM request failed: HTTP ${response.status} ${body}`)
  }
  return response.json()
}

async function readSse(response: Response, extract: (line: any) => string): Promise<LLMResponse> {
  if (!response.ok || !response.body) {
    const body = await response.text()
    throw new LLMCallError(`LLM stream failed: HTTP ${response.status} ${body}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      const chunk = extract(JSON.parse(payload))
      content += chunk
    }
  }

  if (!content.trim()) throw new LLMCallError('Model returned empty response.')
  return { content }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/llm-client.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm/client.ts tests/llm-client.test.ts
git commit -m "feat: add streaming LLM client"
```

---

### Task 6: File Reader

**Files:**
- Create: `src/lib/core/file-reader.ts`
- Create: `tests/file-reader.test.ts`

- [ ] **Step 1: Write failing tests for text behavior**

```ts
// tests/file-reader.test.ts
import { describe, expect, it } from 'vitest'
import { cleanText, readTextBytes } from '@/lib/core/file-reader'

describe('file-reader text helpers', () => {
  it('reads utf-8 text bytes', async () => {
    const bytes = new TextEncoder().encode('你好\nworld')
    await expect(readTextBytes(bytes)).resolves.toBe('你好\nworld')
  })

  it('normalizes excessive blank lines and full-width spaces', () => {
    expect(cleanText('hello　world\n\n\n\nnext')).toBe('hello world\n\nnext')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/file-reader.test.ts`

Expected: FAIL because `file-reader.ts` does not exist.

- [ ] **Step 3: Implement file reader**

```ts
// src/lib/core/file-reader.ts
import { readFile } from '@tauri-apps/plugin-fs'
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'

export interface ReadFileResult {
  content: string
  fileName: string
  filePath: string
}

export async function readDocumentFile(filePath: string): Promise<ReadFileResult> {
  const bytes = await readFile(filePath)
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  const lower = fileName.toLowerCase()

  let content: string
  if (lower.endsWith('.pdf')) {
    content = await readPdfBytes(bytes)
  } else if (lower.endsWith('.docx')) {
    content = await readDocxBytes(bytes)
  } else {
    content = await readTextBytes(bytes)
  }

  return { content: cleanText(content), fileName, filePath }
}

export async function readPdfBytes(bytes: Uint8Array): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const pages: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
      .trim()
    if (text) pages.push(`--- Page ${pageNumber} ---\n${text}`)
  }

  return pages.join('\n\n')
}

export async function readDocxBytes(bytes: Uint8Array): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer.slice(0) })
  return result.value
}

export async function readTextBytes(bytes: Uint8Array): Promise<string> {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('gbk').decode(bytes)
  }
}

export function cleanText(text: string): string {
  return text
    .replace(/\u3000/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/file-reader.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core/file-reader.ts tests/file-reader.test.ts
git commit -m "feat: add local document reader"
```

---

### Task 7: History Manager

**Files:**
- Create: `src/lib/core/history.ts`
- Create: `tests/history.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/history.test.ts
import { describe, expect, it } from 'vitest'
import { HistoryManager } from '@/lib/core/history'
import { MemoryStorageAdapter } from '@/lib/core/storage'

describe('HistoryManager', () => {
  it('saves, lists, reads, and deletes records', async () => {
    const storage = new MemoryStorageAdapter()
    const manager = new HistoryManager(storage)

    const id = await manager.saveRecord({
      fileName: 'paper.pdf',
      model: 'MiniMax-M2.7',
      summary: 'summary',
      readingCard: '# Card',
      relationAnalysis: '# Relation',
      writingMaterials: '# Writing',
      todoList: '# Todo',
      fullReport: '# Full',
    })

    const list = await manager.listRecords()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(id)

    const record = await manager.getRecord(id)
    expect(record?.fileName).toBe('paper.pdf')

    await manager.deleteRecord(id)
    expect(await manager.listRecords()).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/history.test.ts`

Expected: FAIL because `history.ts` does not exist.

- [ ] **Step 3: Implement history manager**

```ts
// src/lib/core/history.ts
import type { StorageAdapter } from './storage'

export interface HistoryRecord {
  id: string
  fileName: string
  model: string
  summary: string
  createdAt: string
  readingCard: string
  relationAnalysis: string
  writingMaterials: string
  todoList: string
  fullReport: string
}

export type NewHistoryRecord = Omit<HistoryRecord, 'id' | 'createdAt'>

export class HistoryManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly outputsDir = 'outputs',
  ) {}

  async saveRecord(input: NewHistoryRecord): Promise<string> {
    await this.storage.ensureDir(this.outputsDir)
    const id = crypto.randomUUID().slice(0, 8)
    const record: HistoryRecord = {
      id,
      createdAt: new Date().toISOString(),
      ...input,
    }
    await this.storage.writeText(this.recordPath(id), JSON.stringify(record, null, 2))
    return id
  }

  async listRecords(): Promise<HistoryRecord[]> {
    if (!('keys' in this.storage) || typeof this.storage.keys !== 'function') {
      throw new Error('listRecords requires a storage adapter with keys() support until fs directory listing is added')
    }
    const keys = this.storage.keys() as string[]
    const records = await Promise.all(
      keys
        .filter(key => key.startsWith(`${this.outputsDir}/`) && key.endsWith('_record.json'))
        .map(async key => JSON.parse((await this.storage.readText(key)) ?? 'null') as HistoryRecord),
    )
    return records.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getRecord(id: string): Promise<HistoryRecord | null> {
    const raw = await this.storage.readText(this.recordPath(id))
    return raw ? (JSON.parse(raw) as HistoryRecord) : null
  }

  async deleteRecord(id: string): Promise<void> {
    await this.storage.remove(this.recordPath(id))
  }

  private recordPath(id: string): string {
    return `${this.outputsDir}/${id}_record.json`
  }
}
```

- [ ] **Step 4: Replace temporary list implementation with Tauri directory listing**

Modify `src/lib/core/storage.ts`:

```ts
export interface StorageAdapter {
  readText(path: string): Promise<string | null>
  writeText(path: string, content: string): Promise<void>
  remove(path: string): Promise<void>
  ensureDir(path: string): Promise<void>
  listFiles(path: string): Promise<string[]>
}
```

Add to `TauriStorageAdapter`:

```ts
async listFiles(path: string): Promise<string[]> {
  const { readDir } = await import('@tauri-apps/plugin-fs')
  if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return []
  const entries = await readDir(path, { baseDir: BaseDirectory.AppData })
  return entries.filter(entry => entry.isFile).map(entry => `${path}/${entry.name}`)
}
```

Add to `MemoryStorageAdapter`:

```ts
async listFiles(path: string): Promise<string[]> {
  return [...this.files.keys()].filter(key => key.startsWith(`${path}/`))
}
```

Then simplify `HistoryManager.listRecords()`:

```ts
async listRecords(): Promise<HistoryRecord[]> {
  const files = await this.storage.listFiles(this.outputsDir)
  const records = await Promise.all(
    files
      .filter(file => file.endsWith('_record.json'))
      .map(async file => JSON.parse((await this.storage.readText(file)) ?? 'null') as HistoryRecord),
  )
  return records.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/history.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/core/storage.ts src/lib/core/history.ts tests/history.test.ts
git commit -m "feat: add desktop history records"
```

---

### Task 8: Agents

**Files:**
- Create: `src/lib/agents/base.ts`
- Create: `src/lib/agents/literature.ts`
- Create: `src/lib/agents/relation.ts`
- Create: `src/lib/agents/writing.ts`
- Create: `src/lib/agents/todo.ts`
- Create: `src/lib/agents/qa.ts`
- Create: `tests/agents.test.ts`

- [ ] **Step 1: Write failing agent tests**

```ts
// tests/agents.test.ts
import { describe, expect, it, vi } from 'vitest'
import { LiteratureParserAgent } from '@/lib/agents/literature'
import type { LLMConfig } from '@/lib/llm/types'

const config: LLMConfig = {
  provider: 'MiniMax',
  apiKey: 'key',
  baseUrl: 'https://api.example.com/v1',
  modelName: 'model',
}

describe('LiteratureParserAgent', () => {
  it('analyzes each chunk then merges', async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce('chunk one summary')
      .mockResolvedValueOnce('chunk two summary')
      .mockResolvedValueOnce('# Research Material Reading Card')
    const agent = new LiteratureParserAgent(config, caller)

    const result = await agent.run({ textChunks: ['one', 'two'] })

    expect(caller).toHaveBeenCalledTimes(3)
    expect(result.readingCard).toBe('# Research Material Reading Card')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/agents.test.ts`

Expected: FAIL because agents do not exist.

- [ ] **Step 3: Implement base agent**

```ts
// src/lib/agents/base.ts
import { callLLMStream } from '@/lib/llm/client'
import type { LLMConfig, Message } from '@/lib/llm/types'

export type AgentCaller = (
  config: LLMConfig,
  messages: Message[],
  onChunk?: (text: string) => void,
) => Promise<string>

export const defaultAgentCaller: AgentCaller = async (config, messages, onChunk) => {
  const response = await callLLMStream(config, messages, onChunk ?? (() => {}))
  return response.content
}

export abstract class BaseAgent<TInput, TOutput> {
  constructor(
    protected readonly config: LLMConfig,
    protected readonly caller: AgentCaller = defaultAgentCaller,
  ) {}

  protected call(systemPrompt: string, userPrompt: string, onChunk?: (text: string) => void): Promise<string> {
    return this.caller(
      this.config,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      onChunk,
    )
  }

  abstract run(input: TInput, onChunk?: (text: string) => void): Promise<TOutput>
}
```

- [ ] **Step 4: Implement literature agent**

```ts
// src/lib/agents/literature.ts
import { BaseAgent } from './base'

export interface LiteratureInput {
  textChunks: string[]
}

export interface LiteratureOutput {
  readingCard: string
}

const SYSTEM_PROMPT = `
You are a rigorous Chinese research material analysis agent.
Your task is to extract structured information from papers, technical documents, or experiment records.
Requirements:
1. Do not fabricate information not in the original text.
2. Mark uncertain content as "文中未明确说明".
3. Output in Chinese.
4. Do not output lengthy reasoning, only structured results.
`

export class LiteratureParserAgent extends BaseAgent<LiteratureInput, LiteratureOutput> {
  async run(input: LiteratureInput, onChunk?: (text: string) => void): Promise<LiteratureOutput> {
    const partialSummaries: string[] = []

    for (const [index, chunk] of input.textChunks.entries()) {
      const result = await this.call(SYSTEM_PROMPT, fragmentPrompt(chunk), text => {
        onChunk?.(`[文献分块 ${index + 1}/${input.textChunks.length}] ${text}`)
      })
      partialSummaries.push(result)
    }

    const readingCard = await this.call(SYSTEM_PROMPT, mergePrompt(partialSummaries), onChunk)
    return { readingCard }
  }
}

function fragmentPrompt(chunk: string): string {
  return `
Please read the following material fragment and extract structured information.

Fragment:
${chunk}

Output format:

## Fragment Core Information
- Research Background:
- Core Problem:
- Method/System Design:
- Dataset/Experiment Objects:
- Metrics/Evaluation:
- Key Conclusions:
- Reusable Content:
- Uncertain/Missing Information:
`
}

function mergePrompt(partialSummaries: string[]): string {
  return `
The following are analysis results from different fragments of the same material.
Please deduplicate, integrate, and reorganize into a complete research reading card.

Fragment Analysis Results:
${partialSummaries.join('\n')}

Output strictly in this format:

# Research Material Reading Card

## 1. Topic Summary
Summarize what this material researches or discusses in 3-5 sentences.

## 2. Core Pain Points
Explain the key problems this material tries to solve.

## 3. Method/System Workflow
Describe the technical route, model structure, algorithm logic, or system design in order.

## 4. Datasets, Experiment Settings & Metrics
Organize data sources, experiment settings, evaluation metrics, and comparison objects.

## 5. Main Conclusions
List 3-6 conclusions.

## 6. Innovations or Reference Points
Explain what reusable value this material has for research, course projects, paper writing, or code implementation.

## 7. Limitations & Potential Issues
Point out possible shortcomings in methods, experiments, or arguments.

## 8. One-line Summary
Summarize the value of this material in one sentence.
`
}
```

- [ ] **Step 5: Port remaining agents from Python**

Implement these files by translating the current prompt bodies from `backend/agents/relation.py`, `backend/agents/writing.py`, `backend/agents/todo.py`, and `backend/agents/qa.py` without changing output section names:

```ts
// src/lib/agents/relation.ts
import { BaseAgent } from './base'

export interface RelationInput {
  readingCard: string
  researchBackground: string
}

export interface RelationOutput {
  relationAnalysis: string
}

const SYSTEM_PROMPT = `
You are a Chinese research project relation analysis agent.
Your task is to evaluate how a material relates to a user's current research or learning project.
Requirements:
1. Be concrete and avoid forced relevance.
2. Output in Chinese.
3. Distinguish directly usable content from only background reference value.
`

export class ProjectRelationAgent extends BaseAgent<RelationInput, RelationOutput> {
  async run(input: RelationInput, onChunk?: (text: string) => void): Promise<RelationOutput> {
    const relationAnalysis = await this.call(SYSTEM_PROMPT, `
User's current research/learning background:
${input.researchBackground}

Material reading card:
${input.readingCard}

Generate project relation analysis in this format:

# Project Relation Analysis

## 1. Relevance Score
Rate 0-5 and explain why.
- 0: Basically irrelevant
- 1: Weakly relevant
- 2: Some reference value
- 3: Moderately relevant
- 4: Highly relevant
- 5: Directly usable in current project

## 2. Content for Literature Review
What content is suitable for research background or related work.

## 3. Content for Method Design
What ideas, modules, workflows, metrics, or experiment settings can be transferred.

## 4. Content for Experiment Comparison
Whether it can serve as baseline, comparison method, metric reference, or ablation study reference.

## 5. Differences from Current Project
Explain differences between this material and user's project to avoid forced application.

## 6. Key Points for Citation/Recording
List bullet points reusable for paper writing, proposal, or defense.
`, onChunk)
    return { relationAnalysis }
  }
}
```

```ts
// src/lib/agents/writing.ts
import { BaseAgent } from './base'

export interface WritingInput {
  readingCard: string
  relationAnalysis: string
  writingStyle: string
}

export interface WritingOutput {
  writingMaterials: string
}

const SYSTEM_PROMPT = `
You are a Chinese academic writing assistant agent.
Your task is to transform structured materials into paper writing materials.
Requirements:
1. Maintain undergraduate/graduate thesis style.
2. Avoid colloquial or exaggerated expressions.
3. Do not fabricate specific data or citations.
4. Mark missing references as "需补充参考文献".
`

export class WritingAgent extends BaseAgent<WritingInput, WritingOutput> {
  async run(input: WritingInput, onChunk?: (text: string) => void): Promise<WritingOutput> {
    const writingMaterials = await this.call(SYSTEM_PROMPT, `
Material reading card:
${input.readingCard}

Project relation analysis:
${input.relationAnalysis}

User's preferred writing style:
${input.writingStyle}

Generate the following content:

# Reusable Writing Materials

## 1. Literature Review Paragraphs
Write 1-2 paragraphs for "Related Work" or "Research Background".

## 2. Method Inspiration Paragraph
Write 1 paragraph explaining how this material inspires method design.

## 3. Experiment Design Reference Paragraph
Write 1 paragraph explaining its reference value for experiment settings, metrics, or comparison experiments.

## 4. Concise Notes Version
Summarize in 5 or fewer bullet points.

## 5. Writing Notes
Point out where real citations, data, or experiment verification need to be added.
`, onChunk)
    return { writingMaterials }
  }
}
```

```ts
// src/lib/agents/todo.ts
import { BaseAgent } from './base'

export interface TodoInput {
  readingCard: string
  relationAnalysis: string
}

export interface TodoOutput {
  todoList: string
}

const SYSTEM_PROMPT = `
You are a research task planning agent.
Your task is to transform material analysis results into actionable learning, experiment, and writing to-do items.
Requirements:
1. Tasks must be specific.
2. Sort by priority.
3. Estimate workload.
4. Output in Chinese.
`

export class TodoAgent extends BaseAgent<TodoInput, TodoOutput> {
  async run(input: TodoInput, onChunk?: (text: string) => void): Promise<TodoOutput> {
    const todoList = await this.call(SYSTEM_PROMPT, `
Material reading card:
${input.readingCard}

Project relation analysis:
${input.relationAnalysis}

Generate task list in this format:

# Follow-up Task List

## 1. High Priority Tasks
Table format: Task, Purpose, Estimated Time, Output.

## 2. Medium Priority Tasks
Table format: Task, Purpose, Estimated Time, Output.

## 3. Low Priority Tasks
Table format: Task, Purpose, Estimated Time, Output.

## 4. Recommended Execution Order
Give execution path within 5 steps.

## 5. Risk Reminders
Point out potential problems like incomplete materials, hard-to-reproduce experiments, inconsistent metrics.
`, onChunk)
    return { todoList }
  }
}
```

```ts
// src/lib/agents/qa.ts
import { BaseAgent } from './base'

export interface QAInput {
  documentContext: string
  analysisReport: string
  question: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface QAOutput {
  answer: string
}

const SYSTEM_PROMPT = `
You are a research Q&A agent based on document context.
Requirements:
1. Prioritize answering based on uploaded materials and existing analysis.
2. If the answer is not in the materials, explicitly state "当前资料中未找到直接依据".
3. Do not fabricate paper results, experiment data, or citations.
4. Output in Chinese.
`

export class QAAgent extends BaseAgent<QAInput, QAOutput> {
  async run(input: QAInput, onChunk?: (text: string) => void): Promise<QAOutput> {
    const historyText = (input.conversationHistory ?? [])
      .slice(-6)
      .map(message => `${message.role}: ${message.content}`)
      .join('\n')
    const answer = await this.call(SYSTEM_PROMPT, `
Document excerpt:
${input.documentContext.slice(0, 10000)}

Existing analysis report:
${input.analysisReport}

Conversation history:
${historyText}

User question:
${input.question}

Answer the user's question. When necessary, indicate which type of information from the materials your answer is based on.
`, onChunk)
    return { answer }
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/agents.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agents tests/agents.test.ts
git commit -m "feat: port analysis agents to TypeScript"
```

---

### Task 9: Analysis Pipeline

**Files:**
- Create: `src/lib/analysis/pipeline.ts`
- Create: `tests/pipeline.test.ts`

- [ ] **Step 1: Write failing pipeline test**

```ts
// tests/pipeline.test.ts
import { describe, expect, it, vi } from 'vitest'
import { runSingleAnalysis } from '@/lib/analysis/pipeline'
import { HistoryManager } from '@/lib/core/history'
import { MemoryStorageAdapter } from '@/lib/core/storage'
import type { AppConfig } from '@/lib/llm/types'

const config: AppConfig = {
  model: { provider: 'MiniMax', apiKey: 'key', baseUrl: 'https://api.example.com/v1', modelName: 'model' },
  research: { background: 'AI research', writingStyle: 'academic' },
  analysis: { maxChars: 1000, overlap: 100 },
}

describe('runSingleAnalysis', () => {
  it('runs all agents and saves history', async () => {
    const history = new HistoryManager(new MemoryStorageAdapter())
    const caller = vi
      .fn()
      .mockResolvedValueOnce('reading chunk')
      .mockResolvedValueOnce('reading card')
      .mockResolvedValueOnce('relation')
      .mockResolvedValueOnce('writing')
      .mockResolvedValueOnce('todo')

    const result = await runSingleAnalysis({
      fileName: 'paper.md',
      documentText: 'a'.repeat(200),
      config,
      history,
      caller,
      onProgress: vi.fn(),
      onChunk: vi.fn(),
    })

    expect(result.recordId).toHaveLength(8)
    expect(result.result.readingCard).toBe('reading card')
    expect(await history.listRecords()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/pipeline.test.ts`

Expected: FAIL because `pipeline.ts` does not exist.

- [ ] **Step 3: Implement pipeline**

```ts
// src/lib/analysis/pipeline.ts
import { LiteratureParserAgent } from '@/lib/agents/literature'
import { ProjectRelationAgent } from '@/lib/agents/relation'
import { WritingAgent } from '@/lib/agents/writing'
import { TodoAgent } from '@/lib/agents/todo'
import type { AgentCaller } from '@/lib/agents/base'
import { chunkText, estimateTokens } from '@/lib/core/chunker'
import type { HistoryManager } from '@/lib/core/history'
import type { AppConfig } from '@/lib/llm/types'

export type AnalysisStep = 'reading' | 'relation' | 'writing' | 'todo' | 'saving' | 'done'

export interface AnalysisResult {
  fileName: string
  readingCard: string
  relationAnalysis: string
  writingMaterials: string
  todoList: string
  fullReport: string
}

export interface RunSingleAnalysisInput {
  fileName: string
  documentText: string
  config: AppConfig
  history: HistoryManager
  caller?: AgentCaller
  onProgress?: (step: AnalysisStep) => void
  onChunk?: (step: AnalysisStep, text: string) => void
}

export async function runSingleAnalysis(input: RunSingleAnalysisInput): Promise<{
  recordId: string
  result: AnalysisResult
}> {
  const chunks = chunkText(input.documentText, input.config.analysis.maxChars, input.config.analysis.overlap)
  const tokenEstimate = estimateTokens(input.documentText)
  const emit = (step: AnalysisStep) => input.onProgress?.(step)
  const stream = (step: AnalysisStep) => (text: string) => input.onChunk?.(step, text)

  emit('reading')
  const literature = await new LiteratureParserAgent(input.config.model, input.caller).run(
    { textChunks: chunks },
    stream('reading'),
  )

  emit('relation')
  const relation = await new ProjectRelationAgent(input.config.model, input.caller).run(
    {
      readingCard: literature.readingCard,
      researchBackground: input.config.research.background,
    },
    stream('relation'),
  )

  emit('writing')
  const writing = await new WritingAgent(input.config.model, input.caller).run(
    {
      readingCard: literature.readingCard,
      relationAnalysis: relation.relationAnalysis,
      writingStyle: input.config.research.writingStyle,
    },
    stream('writing'),
  )

  emit('todo')
  const todo = await new TodoAgent(input.config.model, input.caller).run(
    {
      readingCard: literature.readingCard,
      relationAnalysis: relation.relationAnalysis,
    },
    stream('todo'),
  )

  const fullReport = buildFullReport({
    fileName: input.fileName,
    model: input.config.model.modelName,
    tokenEstimate,
    textLength: input.documentText.length,
    readingCard: literature.readingCard,
    relationAnalysis: relation.relationAnalysis,
    writingMaterials: writing.writingMaterials,
    todoList: todo.todoList,
  })

  emit('saving')
  const recordId = await input.history.saveRecord({
    fileName: input.fileName,
    model: input.config.model.modelName,
    summary: extractSummary(literature.readingCard),
    readingCard: literature.readingCard,
    relationAnalysis: relation.relationAnalysis,
    writingMaterials: writing.writingMaterials,
    todoList: todo.todoList,
    fullReport,
  })

  emit('done')
  return {
    recordId,
    result: {
      fileName: input.fileName,
      readingCard: literature.readingCard,
      relationAnalysis: relation.relationAnalysis,
      writingMaterials: writing.writingMaterials,
      todoList: todo.todoList,
      fullReport,
    },
  }
}

function buildFullReport(input: {
  fileName: string
  model: string
  tokenEstimate: number
  textLength: number
  readingCard: string
  relationAnalysis: string
  writingMaterials: string
  todoList: string
}): string {
  return `# Note Forge Analysis Report

- File: ${input.fileName}
- Model: ${input.model}
- Time: ${new Date().toLocaleString()}
- Text Length: ${input.textLength} chars
- Token Estimate: ${input.tokenEstimate}

---

${input.readingCard}

---

${input.relationAnalysis}

---

${input.writingMaterials}

---

${input.todoList}
`
}

function extractSummary(readingCard: string): string {
  return readingCard
    .split('\n')
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#'))
    ?.slice(0, 120) ?? 'No summary'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "E:\.code\My\note-forge" && npm run test -- tests/pipeline.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/pipeline.ts tests/pipeline.test.ts
git commit -m "feat: add single document analysis pipeline"
```

---

### Task 10: Pinia Stores

**Files:**
- Create: `src/stores/config.ts`
- Create: `src/stores/analysis.ts`

- [ ] **Step 1: Add config store**

```ts
// src/stores/config.ts
import { defineStore } from 'pinia'
import { ConfigManager, DEFAULT_CONFIG } from '@/lib/core/config'
import { TauriStorageAdapter } from '@/lib/core/storage'
import type { AppConfig } from '@/lib/llm/types'

const manager = new ConfigManager(new TauriStorageAdapter())

export const useConfigStore = defineStore('config', {
  state: () => ({
    config: structuredClone(DEFAULT_CONFIG) as AppConfig,
    loaded: false,
    saving: false,
  }),
  actions: {
    async load() {
      this.config = await manager.load()
      this.loaded = true
    },
    async save(config: AppConfig) {
      this.saving = true
      try {
        await manager.save(config)
        this.config = structuredClone(config)
      } finally {
        this.saving = false
      }
    },
  },
})
```

- [ ] **Step 2: Add analysis store**

```ts
// src/stores/analysis.ts
import { defineStore } from 'pinia'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { readDocumentFile } from '@/lib/core/file-reader'
import { HistoryManager } from '@/lib/core/history'
import { TauriStorageAdapter } from '@/lib/core/storage'
import { runSingleAnalysis, type AnalysisResult, type AnalysisStep } from '@/lib/analysis/pipeline'
import { useConfigStore } from './config'

const history = new HistoryManager(new TauriStorageAdapter())

export const useAnalysisStore = defineStore('analysis', {
  state: () => ({
    loading: false,
    error: '',
    currentStep: '' as AnalysisStep | '',
    streamText: '',
    result: null as AnalysisResult | null,
    selectedPath: '',
    selectedName: '',
  }),
  actions: {
    async selectFilePath(path: string) {
      this.selectedPath = path
      this.selectedName = path.split(/[\\/]/).pop() ?? path
    },
    async analyzeSelectedFile() {
      if (!this.selectedPath) return
      const configStore = useConfigStore()
      if (!configStore.loaded) await configStore.load()

      this.loading = true
      this.error = ''
      this.result = null
      this.streamText = ''

      try {
        const file = await readDocumentFile(this.selectedPath)
        const { result } = await runSingleAnalysis({
          fileName: file.fileName,
          documentText: file.content,
          config: configStore.config,
          history,
          onProgress: step => {
            this.currentStep = step
          },
          onChunk: (_step, text) => {
            this.streamText += text
          },
        })
        this.result = result
        await notifyDone(file.fileName)
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
      } finally {
        this.loading = false
      }
    },
  },
})

async function notifyDone(fileName: string): Promise<void> {
  let permissionGranted = await isPermissionGranted()
  if (!permissionGranted) {
    const permission = await requestPermission()
    permissionGranted = permission === 'granted'
  }
  if (permissionGranted) {
    sendNotification({ title: 'Note Forge', body: `${fileName} 分析完成` })
  }
}
```

- [ ] **Step 3: Build**

Run: `cd "E:\.code\My\note-forge" && npm run build`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/stores
git commit -m "feat: add desktop state stores"
```

---

### Task 11: UI Components

**Files:**
- Create: `src/components/FileUpload.vue`
- Create: `src/components/WorkflowStatus.vue`
- Create: `src/components/AnalysisResult.vue`
- Modify: `src/lib/utils/markdown.ts`

- [ ] **Step 1: Add Markdown renderer**

```ts
// src/lib/utils/markdown.ts
import MarkdownIt from 'markdown-it'

const renderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

export function renderMarkdown(markdown: string): string {
  return renderer.render(markdown)
}
```

- [ ] **Step 2: Add Tauri file picker component**

```vue
<!-- src/components/FileUpload.vue -->
<template>
  <section class="file-picker" @dragover.prevent @drop.prevent="onDrop">
    <el-button type="primary" @click="pickFile">选择文件</el-button>
    <p>{{ fileName || '支持 PDF、DOCX、TXT、MD' }}</p>
  </section>
</template>

<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'

const props = defineProps<{ fileName?: string }>()
const emit = defineEmits<{ selected: [path: string] }>()

async function pickFile() {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md'] }],
  })
  if (typeof selected === 'string') emit('selected', selected)
}

function onDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0]
  const path = file ? (file as File & { path?: string }).path : undefined
  if (path) emit('selected', path)
}
</script>

<style scoped>
.file-picker {
  display: grid;
  place-items: center;
  gap: 12px;
  min-height: 180px;
  border: 1px dashed #c8b98d;
  border-radius: 8px;
  background: #fffdfa;
}

.file-picker p {
  margin: 0;
  color: #666;
}
</style>
```

- [ ] **Step 3: Add workflow status**

```vue
<!-- src/components/WorkflowStatus.vue -->
<template>
  <div class="workflow">
    <div v-for="item in steps" :key="item.key" class="step" :class="{ active: item.key === currentStep, done: isDone(item.key) }">
      <span>{{ item.label }}</span>
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
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin: 18px 0;
}

.step {
  min-height: 40px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  border: 1px solid #ddd2b4;
  background: #fffdfa;
  color: #777;
}

.step.active {
  border-color: #f0c040;
  color: #1a1a2e;
  font-weight: 700;
}

.step.done {
  background: #f7efd4;
  color: #1a1a2e;
}
</style>
```

- [ ] **Step 4: Add analysis result renderer**

```vue
<!-- src/components/AnalysisResult.vue -->
<template>
  <el-tabs v-if="result" class="result-tabs">
    <el-tab-pane label="阅读卡片">
      <article v-html="renderMarkdown(result.readingCard)" />
    </el-tab-pane>
    <el-tab-pane label="关联分析">
      <article v-html="renderMarkdown(result.relationAnalysis)" />
    </el-tab-pane>
    <el-tab-pane label="写作素材">
      <article v-html="renderMarkdown(result.writingMaterials)" />
    </el-tab-pane>
    <el-tab-pane label="待办清单">
      <article v-html="renderMarkdown(result.todoList)" />
    </el-tab-pane>
    <el-tab-pane label="完整报告">
      <article v-html="renderMarkdown(result.fullReport)" />
    </el-tab-pane>
  </el-tabs>
</template>

<script setup lang="ts">
import type { AnalysisResult } from '@/lib/analysis/pipeline'
import { renderMarkdown } from '@/lib/utils/markdown'

defineProps<{ result: AnalysisResult | null }>()
</script>

<style scoped>
.result-tabs {
  margin-top: 22px;
}

article {
  line-height: 1.7;
  padding: 18px;
  background: #fffdfa;
  border: 1px solid #eadfbe;
  border-radius: 8px;
}
</style>
```

- [ ] **Step 5: Build**

Run: `cd "E:\.code\My\note-forge" && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/FileUpload.vue src/components/WorkflowStatus.vue src/components/AnalysisResult.vue src/lib/utils/markdown.ts
git commit -m "feat: add desktop analysis components"
```

---

### Task 12: Views and History UI

**Files:**
- Modify: `src/views/Home.vue`
- Modify: `src/views/History.vue`
- Modify: `src/views/HistoryDetail.vue`
- Modify: `src/views/Settings.vue`

- [ ] **Step 1: Implement Home**

```vue
<!-- src/views/Home.vue -->
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
```

- [ ] **Step 2: Implement History and HistoryDetail**

Add `loadHistoryRecords()` action to `src/stores/analysis.ts`:

```ts
async loadHistoryRecords() {
  return history.listRecords()
},
async loadHistoryRecord(id: string) {
  return history.getRecord(id)
},
async deleteHistoryRecord(id: string) {
  await history.deleteRecord(id)
},
```

Then implement:

```vue
<!-- src/views/History.vue -->
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
```

```vue
<!-- src/views/HistoryDetail.vue -->
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
```

- [ ] **Step 3: Implement Settings**

```vue
<!-- src/views/Settings.vue -->
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
```

- [ ] **Step 4: Build**

Run: `cd "E:\.code\My\note-forge" && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views src/stores/analysis.ts
git commit -m "feat: migrate desktop views"
```

---

### Task 13: End-to-End Verification and Packaging

**Files:**
- Modify as needed: `src-tauri/tauri.conf.json`
- Modify as needed: `src-tauri/capabilities/default.json`
- Modify as needed: `README.md`

- [ ] **Step 1: Run all unit tests**

Run: `cd "E:\.code\My\note-forge" && npm run test`

Expected: All Vitest suites pass.

- [ ] **Step 2: Run production web build**

Run: `cd "E:\.code\My\note-forge" && npm run build`

Expected: `vue-tsc` and `vite build` pass.

- [ ] **Step 3: Run desktop app in dev mode**

Run: `cd "E:\.code\My\note-forge" && npm run tauri:dev`

Expected:
- Tauri window opens.
- Routes `/`, `/history`, `/settings` are reachable.
- Settings save writes `%APPDATA%/note-forge/config.json`.
- File picker opens and accepts PDF/DOCX/TXT/MD.
- Single analysis streams text and saves a JSON record under `%APPDATA%/note-forge/outputs/`.

- [ ] **Step 4: Run desktop package build**

Run: `cd "E:\.code\My\note-forge" && npm run tauri:build`

Expected: Windows installer or executable is produced under `src-tauri/target/release/bundle/`.

- [ ] **Step 5: Update README desktop commands**

Add this section to `README.md`:

````md
## Desktop App

```bash
npm install
npm run tauri:dev
npm run tauri:build
```

Runtime data is stored in the Tauri app data directory:

- Windows: `%APPDATA%/note-forge/config.json`
- Analysis records: `%APPDATA%/note-forge/outputs/{id}_record.json`
````

- [ ] **Step 6: Commit**

```bash
git add README.md src-tauri
git commit -m "chore: verify and document desktop build"
```

---

## Self-Review

Spec coverage:

- Tauri 2 shell: Task 1 and Task 13.
- Vue 3 + TypeScript + Element Plus + Pinia + router: Tasks 1, 2, 10, 12.
- LLM OpenAI-compatible and Anthropic calls with streaming: Task 5.
- PDF, DOCX, TXT, MD reading: Task 6.
- Chunking: Task 4.
- Five agents: Task 8.
- Single-document pipeline with real progress: Task 9 and Task 10.
- JSON config in app data: Task 3 and Task 10.
- JSON history records in app data outputs: Task 7 and Task 12.
- Existing UI pages: Tasks 2, 11, 12.
- Markdown rendering: Task 11.
- System notification: Task 10.
- Packaging: Task 13.

Known implementation constraint:

- Directory listing for history must be supported by `StorageAdapter.listFiles()` before UI history can work in Tauri. Task 7 explicitly adds it before Task 12 uses history views.

Phase 2 is intentionally excluded:

- Batch matrix, traceable QA, Semantic Scholar discovery, citation network, Obsidian/Zotero export, and personal research matching should each get separate specs and plans after Phase 1 desktop parity is working.
