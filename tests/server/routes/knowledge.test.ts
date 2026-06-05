import { describe, expect, it, vi } from 'vitest'
import { knowledgeRoutes } from '../../../server/routes/knowledge'

describe('knowledgeRoutes document search', () => {
  it('returns documents for an empty mention query', async () => {
    const storage = {
      listDocumentsWithMetadata: vi.fn(() => []),
      getDocumentsByKBWithMetadata: vi.fn(() => [
        {
          id: 'doc-1',
          file_name: 'attention.pdf',
          title: 'Attention Is All You Need',
          authors: 'Vaswani et al.',
          year: 2017,
          knowledge_base_id: 'kb-1',
          index_status: 'indexed',
          metadata_status: 'complete',
          created_at: '2026-06-01T00:00:00Z',
        },
      ]),
    }
    const app = knowledgeRoutes(storage as any, { delete: vi.fn() } as any)

    const res = await app.request('/documents/search?q=&knowledgeBaseId=kb-1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([
      expect.objectContaining({
        id: 'doc-1',
        fileName: 'attention.pdf',
        title: 'Attention Is All You Need',
        authors: ['Vaswani et al.'],
        year: 2017,
        knowledgeBaseId: 'kb-1',
        indexedStatus: 'indexed',
      }),
    ])
  })

  it('filters by file name, title, authors, and year', async () => {
    const storage = {
      listDocumentsWithMetadata: vi.fn(() => []),
      getDocumentsByKBWithMetadata: vi.fn(() => [
        { id: 'doc-1', file_name: 'attention.pdf', title: 'Attention Is All You Need', authors: 'Vaswani', year: 2017, knowledge_base_id: 'kb-1', index_status: 'indexed', metadata_status: 'complete' },
        { id: 'doc-2', file_name: 'bert.pdf', title: 'BERT', authors: 'Devlin', year: 2018, knowledge_base_id: 'kb-1', index_status: 'indexed', metadata_status: 'complete' },
      ]),
    }
    const app = knowledgeRoutes(storage as any, { delete: vi.fn() } as any)

    const res = await app.request('/documents/search?q=vaswani&knowledgeBaseId=kb-1')
    const body = await res.json()
    expect(body.map((d: any) => d.id)).toEqual(['doc-1'])
  })

  it('searches documents through KB membership when knowledgeBaseId is provided', async () => {
    const storage = {
      getDocumentsByKBWithMetadata: vi.fn(() => [
        {
          id: 'doc-1',
          file_name: 'bad-file-name.pdf',
          title: 'Real Paper Title',
          authors: JSON.stringify(['Author A']),
          year: 2024,
          venue: 'NeurIPS',
          knowledge_base_id: 'kb1',
          index_status: 'indexed',
          metadata_status: 'complete',
        },
      ]),
      listDocumentsWithMetadata: vi.fn(() => []),
    }
    const app = knowledgeRoutes(storage as any, { delete: vi.fn() } as any)

    const res = await app.request('/documents/search?q=real&knowledgeBaseId=kb1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(storage.getDocumentsByKBWithMetadata).toHaveBeenCalledWith('kb1')
    expect(body[0]).toMatchObject({
      id: 'doc-1',
      fileName: 'bad-file-name.pdf',
      title: 'Real Paper Title',
      year: 2024,
      venue: 'NeurIPS',
      knowledgeBaseId: 'kb1',
      indexedStatus: 'indexed',
      metadataStatus: 'complete',
    })
    // authors should be parsed from JSON string to array
    expect(body[0].authors).toEqual(['Author A'])
  })

  it('uses listDocumentsWithMetadata when no knowledgeBaseId is provided', async () => {
    const storage = {
      listDocumentsWithMetadata: vi.fn(() => [
        {
          id: 'doc-2',
          file_name: 'global.pdf',
          title: 'Global Paper',
          authors: 'Author B',
          year: 2023,
          knowledge_base_id: null,
          index_status: 'indexed',
          metadata_status: 'partial',
        },
      ]),
      getDocumentsByKBWithMetadata: vi.fn(() => []),
    }
    const app = knowledgeRoutes(storage as any, { delete: vi.fn() } as any)

    const res = await app.request('/documents/search?q=global')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(storage.listDocumentsWithMetadata).toHaveBeenCalled()
    expect(storage.getDocumentsByKBWithMetadata).not.toHaveBeenCalled()
    expect(body[0]).toMatchObject({
      id: 'doc-2',
      title: 'Global Paper',
      metadataStatus: 'partial',
    })
  })

  it('searches over venue, doi, tags, and kb_tags fields', async () => {
    const storage = {
      getDocumentsByKBWithMetadata: vi.fn(() => [
        {
          id: 'doc-1',
          file_name: 'a.pdf',
          title: 'Paper A',
          authors: 'X',
          year: 2024,
          venue: 'ICML',
          doi: '10.1234/test',
          tags: '["deep-learning"]',
          kb_tags: '["important"]',
          knowledge_base_id: 'kb1',
          index_status: 'indexed',
          metadata_status: 'complete',
        },
        {
          id: 'doc-2',
          file_name: 'b.pdf',
          title: 'Paper B',
          authors: 'Y',
          year: 2024,
          venue: 'CVPR',
          doi: null,
          tags: null,
          kb_tags: null,
          knowledge_base_id: 'kb1',
          index_status: 'indexed',
          metadata_status: 'complete',
        },
      ]),
      listDocumentsWithMetadata: vi.fn(() => []),
    }
    const app = knowledgeRoutes(storage as any, { delete: vi.fn() } as any)

    // Search by venue
    const res = await app.request('/documents/search?q=icml&knowledgeBaseId=kb1')
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('doc-1')
  })

  it('parses JSON array authors into string array', async () => {
    const storage = {
      getDocumentsByKBWithMetadata: vi.fn(() => [
        {
          id: 'doc-1',
          file_name: 'a.pdf',
          title: 'Paper',
          authors: JSON.stringify(['Alice', 'Bob']),
          year: 2024,
          knowledge_base_id: 'kb1',
          index_status: 'indexed',
          metadata_status: 'complete',
        },
      ]),
      listDocumentsWithMetadata: vi.fn(() => []),
    }
    const app = knowledgeRoutes(storage as any, { delete: vi.fn() } as any)

    const res = await app.request('/documents/search?q=&knowledgeBaseId=kb1')
    const body = await res.json()
    expect(body[0].authors).toEqual(['Alice', 'Bob'])
  })

  it('handles comma-separated authors string', async () => {
    const storage = {
      getDocumentsByKBWithMetadata: vi.fn(() => [
        {
          id: 'doc-1',
          file_name: 'a.pdf',
          title: 'Paper',
          authors: 'Alice; Bob, Charlie',
          year: 2024,
          knowledge_base_id: 'kb1',
          index_status: 'indexed',
          metadata_status: 'complete',
        },
      ]),
      listDocumentsWithMetadata: vi.fn(() => []),
    }
    const app = knowledgeRoutes(storage as any, { delete: vi.fn() } as any)

    const res = await app.request('/documents/search?q=&knowledgeBaseId=kb1')
    const body = await res.json()
    expect(body[0].authors).toEqual(['Alice', 'Bob', 'Charlie'])
  })
})
