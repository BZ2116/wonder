import type { HistoryRecord } from '@/lib/core/history'

export function exportBibTeX(record: HistoryRecord): string {
  const title = record.fileName.replace(/\.[^.]+$/, '')
  const key = `wonder_${record.id}`
  const year = new Date(record.createdAt).getFullYear()
  const date = new Date(record.createdAt).toLocaleDateString()

  return `@article{${key},
  title = {${title}},
  year = {${year}},
  note = {Analyzed by Wonder on ${date}}
}
`
}
