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
    getConfig: vi.fn(() => JSON.stringify({
      embedding: { provider: 'openai_compatible', model: 'text-embedding-3-small', dimensions: 1536 },
    })),
    upsertDocumentVectorIndex: vi.fn(),
    getVectorIndexesForDocument: vi.fn(() => []),
    markVectorIndexStatus: vi.fn(),
    markDocumentIndexesStale: vi.fn(),
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
    getDocumentsByKBWithMetadata: vi.fn(() => []),
    addDocumentToKB: vi.fn(),
    removeDocumentFromKB: vi.fn(),
    getReadmeSuggestions: vi.fn(() => []),
    updateReadmeSuggestionStatus: vi.fn(),
    getPaperChunkMetadataByDocument: vi.fn(() => []),
    getDocumentMetadata: vi.fn(() => ({
      document_id: 'doc-1',
      title: 'Test Paper Title',
      authors: JSON.stringify(['Author A', 'Author B']),
      year: 2024,
      venue: 'ACL',
      doi: null,
      url: null,
      abstract: 'This is the abstract.',
      keywords: JSON.stringify(['rag', 'nlp']),
      metadata_status: 'extracted',
      metadata_source: 'llm',
      updated_at: '2025-01-01',
    })),
  }
  const python = {
    post: vi.fn(async () => ({ doc_id: 'doc-1', message: 'Document indexed successfully' })),
  }
  const app = new Hono()
  app.route('/api/knowledge-bases', knowledgeBaseRoutes(storage as any, python as any))
  return { app, storage, python }
}

describe('knowledgeBaseRoutes - reindex', () => {
  it('lists knowledge base documents with vector index metadata', async () => {
    const { app, storage } = createApp()
    storage.getDocumentsByKBWithMetadata.mockReturnValueOnce([
      {
        id: 'doc-1',
        file_name: 'test.pdf',
        title: 'Test Paper Title',
        summary: 'Summary',
        created_at: '2025-01-01',
        index_status: 'indexed',
        index_error: null,
        collection_name: 'documents__openai_compatible__text_embedding_3_small__1536',
        chunk_count: 2,
        indexed_at: '2026-06-06 11:00:00',
        embedding_provider: 'openai_compatible',
        embedding_model: 'text-embedding-3-small',
      },
    ])

    const res = await app.request('/api/knowledge-bases/kb-1/documents')
    const body = await res.json()

    expect(storage.getDocumentsByKBWithMetadata).toHaveBeenCalledWith('kb-1')
    expect(storage.getDocumentsByKB).not.toHaveBeenCalled()
    expect(body[0]).toEqual(expect.objectContaining({
      index_status: 'indexed',
      collection_name: 'documents__openai_compatible__text_embedding_3_small__1536',
      chunk_count: 2,
      indexed_at: '2026-06-06 11:00:00',
      embedding_provider: 'openai_compatible',
      embedding_model: 'text-embedding-3-small',
    }))
  })

  it('calls Python indexing endpoint with correct payload including ledger fields', async () => {
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
      index_id: expect.any(String),
      collection_name: 'documents__openai_compatible__text_embedding_3_small__1536',
      embedding_provider: 'openai_compatible',
      embedding_model: 'text-embedding-3-small',
      embedding_dimensions: 1536,
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

  it('passes document metadata fields to Python indexing endpoint', async () => {
    const { app, python } = createApp()

    await app.request('/api/knowledge-bases/kb-1/documents/doc-1/reindex', {
      method: 'POST',
    })

    expect(python.post).toHaveBeenCalledWith('/api/knowledge/documents/gateway', expect.objectContaining({
      paper_title: 'Test Paper Title',
      authors: ['Author A', 'Author B'],
      year: 2024,
      venue: 'ACL',
      abstract: 'This is the abstract.',
      keywords: ['rag', 'nlp'],
      metadata_status: 'extracted',
    }))
  })

  it('falls back to file_name when metadata is missing', async () => {
    const { app, storage, python } = createApp()
    storage.getDocumentMetadata.mockReturnValueOnce(undefined)

    await app.request('/api/knowledge-bases/kb-1/documents/doc-1/reindex', {
      method: 'POST',
    })

    expect(python.post).toHaveBeenCalledWith('/api/knowledge/documents/gateway', expect.objectContaining({
      paper_title: 'test.pdf',
      authors: [],
      year: null,
      venue: null,
      metadata_status: 'missing',
    }))
  })

  it('sends an empty string file_path when stored file_path is null', async () => {
    const { app, storage, python } = createApp()
    storage.getDocument.mockReturnValueOnce({
      id: 'doc-1',
      file_name: 'test.pdf',
      file_path: null,
      file_type: 'pdf',
      summary: 'Summary',
      reading_card: 'Card',
      relation_analysis: 'Relation',
      writing_materials: 'Writing',
      todo_list: 'Todo',
      tags: null,
      match_score: 85,
      lifecycle_status: 'analyzed',
      created_at: '2025-01-01',
    })

    await app.request('/api/knowledge-bases/kb-1/documents/doc-1/reindex', {
      method: 'POST',
    })

    expect(python.post).toHaveBeenCalledWith('/api/knowledge/documents/gateway', expect.objectContaining({
      file_path: '',
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
      readme: expect.stringContaining('## 主题\n- AI相关内容'),
    }))
  })

  it('accepts readme suggestion instruction text as plain section content', async () => {
    const { app, storage } = createApp()
    storage.getKnowledgeBase.mockReturnValueOnce({
      id: 'kb-1',
      name: 'Test KB',
      readme: '# Knowledge Base README\n\n## Topic\n',
      description: 'desc',
      created_at: '',
      updated_at: '',
    })
    storage.getReadmeSuggestionById = vi.fn((id: string) => id === 'suggestion-2' ? {
      id: 'suggestion-2',
      knowledge_base_id: 'kb-1',
      document_id: 'doc-1',
      section: 'Topic',
      suggestion: 'Suggest adding AI education applications',
      reason: 'The document discusses this direction',
      status: 'pending',
      created_at: '2025-01-01',
    } : undefined)

    const res = await app.request('/api/knowledge-bases/readme-suggestions/suggestion-2/accept', {
      method: 'POST',
    })

    expect(res.status).toBe(200)
    expect(storage.updateKnowledgeBase).toHaveBeenCalledWith('kb-1', expect.objectContaining({
      readme: expect.stringContaining('## Topic\n- AI education applications'),
    }))
    const updatedReadme = storage.updateKnowledgeBase.mock.calls.at(-1)?.[1].readme
    expect(updatedReadme).not.toContain('Suggest adding')
  })

  it('records index status on success via vector ledger', async () => {
    const { app, storage } = createApp()

    await app.request('/api/knowledge-bases/kb-1/documents/doc-1/reindex', { method: 'POST' })

    expect(storage.updateDocumentLifecycle).toHaveBeenCalledWith('doc-1', 'indexing')
    expect(storage.upsertDocumentVectorIndex).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
      backend: 'chroma',
      status: 'indexing',
    }))
    expect(storage.markVectorIndexStatus).toHaveBeenCalledWith(expect.any(String), 'indexed')
  })

  it('marks old indexes stale and creates new version on reindex', async () => {
    const { app, storage } = createApp()
    storage.getVectorIndexesForDocument.mockReturnValueOnce([
      { id: 'old-idx', document_id: 'doc-1', knowledge_base_id: 'kb-1', index_version: 2, status: 'indexed' },
    ])

    await app.request('/api/knowledge-bases/kb-1/documents/doc-1/reindex', { method: 'POST' })

    expect(storage.markDocumentIndexesStale).toHaveBeenCalledWith('doc-1')
    expect(storage.upsertDocumentVectorIndex).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
      indexVersion: 3,
      status: 'indexing',
    }))
  })

  it('records index_failed via vector ledger when Python throws', async () => {
    const { app, storage, python } = createApp()
    python.post.mockRejectedValueOnce(new Error('embedding timeout'))

    const res = await app.request('/api/knowledge-bases/kb-1/documents/doc-1/reindex', { method: 'POST' })

    expect(res.status).toBe(500)
    expect(storage.markVectorIndexStatus).toHaveBeenCalledWith(expect.any(String), 'failed', 'embedding timeout')
  })

  it('returns 404 for non-existent document', async () => {
    const { app } = createApp()

    const res = await app.request('/api/knowledge-bases/kb-1/documents/nonexistent/reindex', { method: 'POST' })

    expect(res.status).toBe(404)
  })
})

describe('knowledgeBaseRoutes - add to KB', () => {
  it('creates a vector index ledger row and calls Python with ledger fields', async () => {
    const { app, storage, python } = createApp()

    const res = await app.request('/api/knowledge-bases/kb-1/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: 'doc-1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(storage.upsertDocumentVectorIndex).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
      backend: 'chroma',
      collectionName: 'documents__openai_compatible__text_embedding_3_small__1536',
      embeddingProvider: 'openai_compatible',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      chunkCount: 2,
      indexVersion: 1,
      status: 'indexing',
    }))
    expect(python.post).toHaveBeenCalledWith('/api/knowledge/documents/gateway', expect.objectContaining({
      doc_id: 'doc-1',
      knowledge_base_id: 'kb-1',
      index_id: expect.any(String),
      collection_name: 'documents__openai_compatible__text_embedding_3_small__1536',
      embedding_provider: 'openai_compatible',
      embedding_model: 'text-embedding-3-small',
      embedding_dimensions: 1536,
      paper_title: 'Test Paper Title',
      authors: ['Author A', 'Author B'],
      year: 2024,
      venue: 'ACL',
      metadata_status: 'extracted',
    }))
  })

  it('marks vector index as indexed on success', async () => {
    const { app, storage } = createApp()

    await app.request('/api/knowledge-bases/kb-1/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: 'doc-1' }),
    })

    // Wait for the async Python call to resolve
    await vi.waitFor(() => {
      expect(storage.markVectorIndexStatus).toHaveBeenCalledWith(expect.any(String), 'indexed')
    })
    expect(storage.updateDocumentLifecycle).toHaveBeenCalledWith('doc-1', 'indexed')
  })

  it('marks vector index as failed when Python throws', async () => {
    const { app, storage, python } = createApp()
    python.post.mockRejectedValueOnce(new Error('chroma down'))

    await app.request('/api/knowledge-bases/kb-1/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: 'doc-1' }),
    })

    await vi.waitFor(() => {
      expect(storage.markVectorIndexStatus).toHaveBeenCalledWith(expect.any(String), 'failed', 'chroma down')
    })
    expect(storage.updateDocumentLifecycle).toHaveBeenCalledWith('doc-1', 'index_failed')
  })

  it('returns 400 when documentId is missing', async () => {
    const { app } = createApp()

    const res = await app.request('/api/knowledge-bases/kb-1/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
  })

  it('passes stored paper chunk metadata as paperChunks when indexing a KB document', async () => {
    const { app, storage, python } = createApp()
    storage.getDocument.mockReturnValue({
      id: 'doc-1',
      file_name: 'paper.pdf',
      file_path: '',
      file_type: 'pdf',
      summary: 'summary',
      reading_card: '',
      relation_analysis: '',
      writing_materials: '',
      todo_list: '',
      tags: '',
    })
    storage.getChunksByDocument.mockReturnValue([
      { id: 'chunk-1', document_id: 'doc-1', content: 'method text', chunk_index: 0 },
    ])
    storage.getPaperChunkMetadataByDocument.mockReturnValue([
      {
        chunk_id: 'chunk-1',
        document_id: 'doc-1',
        chunk_type: 'content',
        section_title: '2 Method',
        section_type: 'method',
        page_start: 2,
        page_end: 3,
        labels: JSON.stringify(['Eq. (8)']),
        is_reference: 0,
        prev_chunk_id: null,
        next_chunk_id: null,
        parser: 'mineru_precision',
        parser_version: 'vlm',
        created_at: '',
        updated_at: '',
      },
    ])

    await app.request('/api/knowledge-bases/kb-1/documents', {
      method: 'POST',
      body: JSON.stringify({ documentId: 'doc-1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const payload = python.post.mock.calls[0][1]
    expect(payload.paperChunks).toEqual([{
      chunkId: 'chunk-1',
      text: 'method text',
      chunkIndex: 0,
      chunkType: 'content',
      sectionTitle: '2 Method',
      sectionType: 'method',
      pageStart: 2,
      pageEnd: 3,
      labels: ['Eq. (8)'],
      isReference: false,
      prevChunkId: null,
      nextChunkId: null,
      parser: 'mineru_precision',
      parserVersion: 'vlm',
      blockTypes: [],
    }])
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
