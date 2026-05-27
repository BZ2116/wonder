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
