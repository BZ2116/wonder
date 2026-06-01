import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { analysisRoutes } from '../../../server/routes/analysis'

function createSSEApp() {
  const storage = {
    getKnowledgeBase: vi.fn(() => ({ id: 'kb-1', name: 'Test KB', readme: '# KB README', description: 'desc' })),
    getDocumentsByKB: vi.fn(() => []),
    getConfig: vi.fn((key: string) => key === 'globalProfile' ? 'profile' : undefined),
    upsertDocument: vi.fn(),
    addDocumentToKB: vi.fn(),
    addReadmeSuggestion: vi.fn(),
    addHistory: vi.fn(),
  }
  const python = {
    post: vi.fn(async () => ({
      doc_id: 'doc-1',
      file_name: 'test.pdf',
      status: 'ok',
      failed_agents: [],
      reading_card: '# Reading Card\nKey findings...',
      relation_analysis: 'Relation analysis text',
      writing_materials: 'Writing materials text',
      todo_list: 'Todo list text',
      summary: 'Summary text',
      tags: ['ai', 'nlp'],
      fit_score: 85,
      placement: 'NLP',
      recommended_action: 'add',
      readme_suggestions: [{ section: 'Core Keywords', suggestion: 'Add NLP', reason: 'relevant' }],
      source_chunks: ['chunk1'],
    })),
  }
  const app = new Hono()
  app.route('/api/analysis', analysisRoutes(storage as any, python as any))
  return { app, storage, python }
}

describe('analysisRoutes', () => {
  it('forwards analysis to Python /api/analysis/gateway', async () => {
    const { app, python } = createSSEApp()

    const res = await app.request('/api/analysis/single', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.pdf',
        fileType: 'pdf',
        text: 'Sample document text',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    // Consume the SSE stream fully so async operations complete
    await res.text()

    expect(python.post).toHaveBeenCalledWith('/api/analysis/gateway', expect.objectContaining({
      doc_id: expect.any(String),
      file_name: 'test.pdf',
      file_type: 'pdf',
      text: 'Sample document text',
      max_chars: 7000,
      overlap: 500,
    }))
  })

  it('persists document and history after successful analysis', async () => {
    const { app, storage } = createSSEApp()

    const res = await app.request('/api/analysis/single', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'paper.pdf',
        fileType: 'pdf',
        text: 'Some text.',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    await res.text()

    expect(storage.upsertDocument).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'paper.pdf',
      fileType: 'pdf',
      readingCard: '# Reading Card\nKey findings...',
    }))
    expect(storage.addHistory).toHaveBeenCalledWith(expect.objectContaining({
      documentId: expect.any(String),
    }))
  })

  it('links document to knowledge base when knowledgeBaseId provided', async () => {
    const { app, storage } = createSSEApp()

    const res = await app.request('/api/analysis/single', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.pdf',
        fileType: 'pdf',
        text: 'Text.',
        knowledgeBaseId: 'kb-1',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    await res.text()

    expect(storage.addDocumentToKB).toHaveBeenCalledWith(expect.objectContaining({
      knowledgeBaseId: 'kb-1',
      fitScore: 85,
      recommendedAction: 'add',
    }))
    expect(storage.addReadmeSuggestion).toHaveBeenCalledWith(expect.objectContaining({
      knowledgeBaseId: 'kb-1',
      section: 'Core Keywords',
    }))
  })

  it('returns 400 when text is empty', async () => {
    const { app } = createSSEApp()

    const res = await app.request('/api/analysis/single', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.pdf',
        fileType: 'pdf',
        text: '',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(400)
  })

  it('sends SSE step events during analysis', async () => {
    const { app } = createSSEApp()

    const res = await app.request('/api/analysis/single', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.pdf',
        fileType: 'pdf',
        text: 'Some text.',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const body = await res.text()
    // Verify SSE events are present
    expect(body).toContain('event: step')
    expect(body).toContain('event: complete')
    expect(body).toContain('documentId')
  })

  it('sends complete event with documentId and historyId', async () => {
    const { app } = createSSEApp()

    const res = await app.request('/api/analysis/single', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'test.pdf',
        fileType: 'pdf',
        text: 'Text.',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const body = await res.text()
    // Extract the complete event data
    const completeMatch = body.match(/event: complete\ndata: (.+)/)
    expect(completeMatch).not.toBeNull()
    if (completeMatch) {
      const data = JSON.parse(completeMatch[1])
      expect(data.documentId).toBeDefined()
      expect(data.historyId).toBeDefined()
    }
  })
})

describe('analysisRoutes - provider boundary', () => {
  it('does not build Anthropic headers in route code', () => {
    // Verify the route module does not import or use Anthropic-specific code
    const routeSource = require('fs').readFileSync(
      require('path').join(__dirname, '../../../server/routes/analysis.ts'),
      'utf-8'
    )
    expect(routeSource).not.toContain('x-api-key')
    expect(routeSource).not.toContain('anthropic-version')
    expect(routeSource).not.toContain('LLMService')
  })
})
