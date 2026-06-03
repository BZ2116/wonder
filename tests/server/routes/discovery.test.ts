import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { discoveryRoutes } from '../../../server/routes/discovery'

function createApp() {
  const storage = {
    upsertDiscoveryCandidate: vi.fn(),
    getDiscoveryCandidate: vi.fn((id: string) => id === 'c1' ? {
      id: 'c1', paper_id: 's2-123', title: 'Test Paper', abstract: 'Abstract',
      year: 2024, citation_count: 10, influential_citation_count: 2,
      venue: 'ICML', authors: '[{"authorId":"a1","name":"Author"}]',
      url: 'https://example.com', source_query: 'RAG',
      discovery_priority_score: 75, discovery_reason: 'keyword match',
      state: 'saved', knowledge_base_id: null,
      created_at: '2025-01-01', updated_at: '2025-01-01',
    } : undefined),
    listDiscoveryCandidates: vi.fn(() => []),
    updateDiscoveryCandidateState: vi.fn(),
    deleteDiscoveryCandidate: vi.fn(),
  }
  const app = new Hono()
  app.route('/api/discovery', discoveryRoutes(storage as any))
  return { app, storage }
}

describe('discoveryRoutes - candidates', () => {
  it('POST /candidates saves a candidate', async () => {
    const { app, storage } = createApp()
    const res = await app.request('/api/discovery/candidates', {
      method: 'POST',
      body: JSON.stringify({
        paperId: 's2-456', title: 'New Paper', state: 'saved',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(201)
    expect(storage.upsertDiscoveryCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ paperId: 's2-456', title: 'New Paper', state: 'saved' }),
    )
  })

  it('GET /candidates lists candidates', async () => {
    const { app, storage } = createApp()
    ;(storage.listDiscoveryCandidates as any).mockReturnValue([{
      id: 'c1', paper_id: 'p1', title: 'A', state: 'saved',
    }])
    const res = await app.request('/api/discovery/candidates')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
  })

  it('GET /candidates filters by knowledgeBaseId', async () => {
    const { app, storage } = createApp()
    await app.request('/api/discovery/candidates?knowledgeBaseId=kb-1')
    expect(storage.listDiscoveryCandidates).toHaveBeenCalledWith({ knowledgeBaseId: 'kb-1', state: undefined })
  })

  it('PATCH /candidates/:id updates state', async () => {
    const { app, storage } = createApp()
    const res = await app.request('/api/discovery/candidates/c1', {
      method: 'PATCH',
      body: JSON.stringify({ state: 'ignored' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(200)
    expect(storage.updateDiscoveryCandidateState).toHaveBeenCalledWith('c1', 'ignored')
  })

  it('PATCH /candidates/:id returns 404 for non-existent', async () => {
    const { app } = createApp()
    const res = await app.request('/api/discovery/candidates/nonexistent', {
      method: 'PATCH',
      body: JSON.stringify({ state: 'ignored' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(404)
  })

  it('DELETE /candidates/:id deletes a candidate', async () => {
    const { app, storage } = createApp()
    const res = await app.request('/api/discovery/candidates/c1', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(storage.deleteDiscoveryCandidate).toHaveBeenCalledWith('c1')
  })

  it('DELETE /candidates/:id returns 404 for non-existent', async () => {
    const { app } = createApp()
    const res = await app.request('/api/discovery/candidates/nonexistent', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('GET /candidates/:id returns a single candidate', async () => {
    const { app } = createApp()
    const res = await app.request('/api/discovery/candidates/c1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.paper_id).toBe('s2-123')
    expect(body.title).toBe('Test Paper')
  })

  it('GET /candidates/:id returns 404 for non-existent', async () => {
    const { app } = createApp()
    const res = await app.request('/api/discovery/candidates/nonexistent')
    expect(res.status).toBe(404)
  })

  it('POST /candidates returns 400 when paperId is missing', async () => {
    const { app } = createApp()
    const res = await app.request('/api/discovery/candidates', {
      method: 'POST',
      body: JSON.stringify({ title: 'Paper without ID' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('POST /candidates returns 400 when title is missing', async () => {
    const { app } = createApp()
    const res = await app.request('/api/discovery/candidates', {
      method: 'POST',
      body: JSON.stringify({ paperId: 's2-789' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})

describe('discoveryRoutes - OpenAlex proxy', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('GET /search returns 400 when q is missing', async () => {
    const { app } = createApp()
    const res = await app.request('/api/discovery/search')
    expect(res.status).toBe(400)
  })

  it('GET /search proxies to OpenAlex', async () => {
    const { app } = createApp()
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        meta: { count: 1 },
        results: [{
          id: 'https://openalex.org/W123',
          title: 'Paper',
          abstract_inverted_index: null,
          publication_year: 2024,
          cited_by_count: 10,
          primary_location: { source: { display_name: 'ICML' } },
          doi: 'https://doi.org/10.1234',
          authorships: [{ author: { id: 'https://openalex.org/a1', display_name: 'Author' } }],
          referenced_works: [],
        }],
      }),
    }))
    vi.stubGlobal('fetch', mockFetch)

    const res = await app.request('/api/discovery/search?q=RAG&limit=5')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.papers).toHaveLength(1)
    expect(body.papers[0].paperId).toBe('W123')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('search=RAG'),
      expect.any(Object),
    )
  })

  it('GET /papers/:paperId proxies to OpenAlex', async () => {
    const { app } = createApp()
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'https://openalex.org/W456',
        title: 'Paper',
        abstract_inverted_index: null,
        publication_year: 2024,
        cited_by_count: 5,
        primary_location: null,
        doi: null,
        authorships: [],
        referenced_works: [],
      }),
    }))
    vi.stubGlobal('fetch', mockFetch)

    const res = await app.request('/api/discovery/papers/W456')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.paperId).toBe('W456')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/works/W456'),
      expect.any(Object),
    )
  })

  it('GET /search returns 502 when OpenAlex fails', async () => {
    const { app } = createApp()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))

    const res = await app.request('/api/discovery/search?q=test')
    expect(res.status).toBe(502)
  })
})
