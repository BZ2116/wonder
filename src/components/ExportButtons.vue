<template>
  <div class="export-bar">
    <el-button size="small" @click="exportMd">
      <span class="btn-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 2h7l3 3v9H3V2z"/><path d="M10 2v3h3"/></svg>
      </span>
      导出 Markdown
    </el-button>
    <el-button size="small" @click="exportBib">
      <span class="btn-icon">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 2h7l3 3v9H3V2z"/><path d="M10 2v3h3"/><path d="M5 8h6M5 11h4"/></svg>
      </span>
      导出 BibTeX
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import type { HistoryRecord } from '@/lib/core/history'
import { exportObsidianMarkdown } from '@/lib/export/markdown'
import { exportBibTeX } from '@/lib/export/bibtex'

const props = defineProps<{ record: HistoryRecord }>()

async function exportMd() {
  const path = await save({
    defaultPath: `${props.record.fileName}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (path) await writeTextFile(path, exportObsidianMarkdown(props.record))
}

async function exportBib() {
  const path = await save({
    defaultPath: `${props.record.fileName}.bib`,
    filters: [{ name: 'BibTeX', extensions: ['bib'] }],
  })
  if (path) await writeTextFile(path, exportBibTeX(props.record))
}
</script>

<style scoped>
.export-bar {
  padding: 12px 20px;
  border-top: 1px solid var(--border-light);
  display: flex;
  gap: 8px;
}

.btn-icon {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
}

.btn-icon svg {
  width: 100%;
  height: 100%;
}
</style>
