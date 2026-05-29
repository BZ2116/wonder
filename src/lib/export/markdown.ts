import type { HistoryRecord } from '@/lib/core/history'

export function exportObsidianMarkdown(record: HistoryRecord): string {
  return `---
title: "${record.fileName}"
date: ${record.createdAt}
model: "${record.model}"
tags: [wonder, research]
---

${record.fullReport}
`
}
