import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { knowledgeBaseRoutes } from '../../../server/routes/knowledge-bases'

function createApp() {
  const storage = {
    getDocument: vi.fn((id: string) => id === 'doc-1' ? {
      id: 'doc-1', file_name: 'test.pdf', file_path: '/tmp/test.pdf', file_type: 'pdf',
      summary: 'Summary', reading_card: 'Card', relation_analysis: 'Relation',
      writing_materials: 'Writing', todo_list: 'Todo', tags: 'ai,nlp', match_score: 85,
      lifecycle_status: 'analyzed', index_status: 'not_indexed', index_error: null, indexed_at: null,
      created_at: '2025-01-01',
    } : undefined),
    getChunksByDocument: vi.fn(() => [
      { id: 'c1', document_id: 'doc-1', content: 'chunk one', chunk_index: 0, embedding: null },
      { id: 'c2', document_id: 'doc-1', content: 'chunk two', chunk_index: 1, embedding: null },
    ]),
    updateDocumentLifecycle: vi.fn(),
    updateDocumentIndexStatus: vi.fn(),
    listKnowledgeBases: vi.fn(() => []),
    getKnowledgeBase: vi.fn(() => ({ id: 'kb-1', name: 'Test KB', readme: '', description: 'desc', created_at: '', updated_at: '' })),
    getDocumentKBCount: vi.fn(() => 0),
    getKBTags: vi.fn(() => []),
    getPendingSuggestionCount: vi.fn(() => 0),
    createKnowledgeBase: vi.fn(),
    updateKnowledgeBase: vi.fn(),
    deleteKnowledgeBase: vi.fn(),
    deleteKnowledgeBaseCascade: vi.fn(),
    getDocumentsByKB: vi.fn(() => []),
    addDocumentToKB: vi.fn(),
    removeDocumentFromKB: vi.fn(),
    getReadmeSuggestions: vi.fn(() => []),
    updateReadmeSuggestionStatus: vi.fn(),
  }
  const python = {
    post: vi.fn(async () => ({ doc_id: 'doc-1', message: 'Document indexed successfully' })),
  }
  const app = new Hono()
  app.route('/api/knowledge-bases', knowledgeBaseRoutes(storage as any, python as any))
  return { app, storage, python }
}

describe('knowledgeBaseRoutes - reindex', () => {
  it('calls Python indexing endpoint with correct payload', async () => {
    const { app, python } = createApp()

    const res = await app.request('/api/knowledge-bases/kb-1/documents/doc-1/reindex', {
      method: 'POST',
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(python.post).toHaveBeenCalledWith('/api/knowledge/documents/gateway', expect.objectContaining({
      doc_id: 'doc-1',
      knowledge_base_id: 'kb-1',
      file_name: 'test.pdf',
      chunks: ['chunk one', 'chunk two'],
      summary: 'Summary',
      analysis_result: expect.objectContaining({
        reading_card: 'Card',
        relation_analysis: 'Relation',
        writing_materials: 'Writing',
        todo_list: 'Todo',
      }),
      tags: ['ai', 'nlp'],
    }))
  })

  it('accepts a readme suggestion', async () => {
    const { app, storage } = createApp()

    // Mock getReadmeSuggestionById to return a suggestion
    storage.getReadmeSuggestionById = vi.fn((id: string) => id === 'suggestion-1' ? {
      id: 'suggestion-1',
      knowledge_base_id: 'kb-1',
      document_id: 'doc-1',
      section: '主题',
      suggestion: '添加AI相关内容',
      reason: '文档涉及AI领域',
      status: 'pending',
      created_at: '2025-01-01',
    } : undefined)

    const res = await app.request('/api/knowledge-bases/readme-suggestions/suggestion-1/accept', {
      method: 'POST',
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(storage.updateReadmeSuggestionStatus).toHaveBeenCalledWith('suggestion-1', 'accepted')
    expect(storage.updateKnowledgeBase).toHaveBeenCalledWith('kb-1', expect.objectContaining({
      readme: expect.stringContaining('## 主题\n- 添加AI相关内容'),
    }))
  })

  it('records index status on success', async () => {
    const { app, storage } = createApp()

    await app.request('/api/knowledge-bases/kb-1/documents/doc-1/reindex', { method: 'POST' })

    expect(storage.updateDocumentLifecycle).toHaveBeenCalledWith('doc-1', 'indexing')
    expect(storage.updateDocumentIndexStatus).toHaveBeenCalledWith('doc-1', 'indexed', null)
  })

  it('records index_failed when Python throws', async () => {
    const { app, storage, python } = createApp()
    python.post.mockRejectedValueOnce(new Error('embedding timeout'))

    const res = await app.request('/api/knowledge-bases/kb-1/documents/doc-1/reindex', { method: 'POST' })

    expect(res.status).toBe(500)
    expect(storage.updateDocumentIndexStatus).toHaveBeenCalledWith('doc-1', 'index_failed', 'embedding timeout')
  })

  it('returns 404 for non-existent document', async () => {
    const { app } = createApp()

    const res = await app.request('/api/knowledge-bases/kb-1/documents/nonexistent/reindex', { method: 'POST' })

    expect(res.status).toBe(404)
  })
})

describe('knowledgeBaseRoutes - cascade delete', () => {
  it('deletes an existing knowledge base via cascade cleanup', async () => {
    const { app, storage } = createApp()

    const res = await app.request('/api/knowledge-bases/kb-1', { method: 'DELETE' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(storage.deleteKnowledgeBaseCascade).toHaveBeenCalledWith('kb-1')
  })

  it('returns 404 when deleting a missing knowledge base', async () => {
    const { app, storage } = createApp()
    storage.getKnowledgeBase.mockReturnValueOnce(undefined)

    const res = await app.request('/api/knowledge-bases/missing', { method: 'DELETE' })

    expect(res.status).toBe(404)
    expect(storage.deleteKnowledgeBaseCascade).not.toHaveBeenCalled()
  })
})
