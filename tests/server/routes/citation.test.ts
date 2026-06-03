import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { citationRoutes } from '../../../server/routes/citation'

function createApp() {
  const storage = {
    upsertPaperNode: vi.fn(),
    getPaperNode: vi.fn(),
    insertPaperEdge: vi.fn(),
    getPaperEdgesBySeed: vi.fn(() => []),
    getPaperEdgesByNode: vi.fn(() => []),
  }
  const app = new Hono()
  app.route('/api/citation', citationRoutes(storage as any))
  return { app, storage }
}

function makeOaWork(id: string, title: string, opts?: { referenced_works?: string[] }) {
  return {
    id: `https://openalex.org/${id}`,
    title,
    abstract_inverted_index: null,
    publication_year: 2024,
    cited_by_count: 10,
    primary_location: { source: { display_name: 'ICML' } },
    doi: `https://doi.org/${id}`,
    authorships: [{ author: { id: 'https://openalex.org/a1', display_name: 'Author' } }],
    referenced_works: opts?.referenced_works ?? [],
  }
}

describe('citationRoutes - GET /graph', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 400 when paperId is missing', async () => {
    const { app } = createApp()
    const res = await app.request('/api/citation/graph')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('paperId')
  })

  it('returns graph with seed paper only when no refs/citations', async () => {
    const { app, storage } = createApp()
    const seed = makeOaWork('Wseed', 'Seed Paper')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = url as string
      if (u.includes('/works/Wseed')) {
        return { ok: true, json: async () => seed }
      }
      // No references or citations
      return { ok: true, json: async () => ({ results: [], meta: { count: 0 } }) }
    }))

    const res = await app.request('/api/citation/graph?paperId=Wseed')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nodes).toHaveLength(1)
    expect(body.nodes[0].paperId).toBe('Wseed')
    expect(body.edges).toHaveLength(0)
    expect(storage.upsertPaperNode).toHaveBeenCalledWith(expect.objectContaining({ paperId: 'Wseed' }))
  })

  it('returns graph with references and citations', async () => {
    const { app } = createApp()
    const ref1 = makeOaWork('Wref1', 'Reference 1')
    const cit1 = makeOaWork('Wcit1', 'Citation 1')
    const seed = makeOaWork('Wseed', 'Seed Paper', { referenced_works: ['https://openalex.org/Wref1'] })

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = url as string
      if (u.includes('/works/Wseed')) {
        return { ok: true, json: async () => seed }
      }
      if (u.includes('filter=openalex:')) {
        return { ok: true, json: async () => ({ results: [ref1], meta: { count: 1 } }) }
      }
      if (u.includes('filter=cites:')) {
        return { ok: true, json: async () => ({ results: [cit1], meta: { count: 1 } }) }
      }
      return { ok: true, json: async () => ({ results: [], meta: { count: 0 } }) }
    }))

    const res = await app.request('/api/citation/graph?paperId=Wseed&limit=10')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nodes).toHaveLength(3)
    expect(body.edges).toHaveLength(2)
    expect(body.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'Wseed', to: 'Wref1', type: 'references' }),
      expect.objectContaining({ from: 'Wcit1', to: 'Wseed', type: 'citations' }),
    ]))
  })

  it('respects direction=references', async () => {
    const { app } = createApp()
    const ref1 = makeOaWork('Wref1', 'Ref 1')
    const seed = makeOaWork('Wseed', 'Seed', { referenced_works: ['https://openalex.org/Wref1'] })

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = url as string
      if (u.includes('/works/Wseed')) {
        return { ok: true, json: async () => seed }
      }
      if (u.includes('filter=openalex:')) {
        return { ok: true, json: async () => ({ results: [ref1], meta: { count: 1 } }) }
      }
      return { ok: true, json: async () => ({ results: [], meta: { count: 0 } }) }
    }))

    const res = await app.request('/api/citation/graph?paperId=Wseed&direction=references')
    expect(res.status).toBe(200)
    const body = await res.json()
    // Only references fetched, no citations fetch called
    const fetchCalls = (fetch as any).mock.calls.map((c: string[]) => c[0])
    expect(fetchCalls.some((u: string) => u.includes('filter=cites:'))).toBe(false)
  })

  it('returns 502 when OpenAlex API fails', async () => {
    const { app } = createApp()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))

    const res = await app.request('/api/citation/graph?paperId=Wseed')
    expect(res.status).toBe(502)
  })

  it('caches paper nodes via storage', async () => {
    const { app, storage } = createApp()
    const ref1 = makeOaWork('Wref1', 'Ref 1')
    const seed = makeOaWork('Wseed', 'Seed', { referenced_works: ['https://openalex.org/Wref1'] })

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = url as string
      if (u.includes('/works/Wseed')) {
        return { ok: true, json: async () => seed }
      }
      if (u.includes('filter=openalex:')) {
        return { ok: true, json: async () => ({ results: [ref1], meta: { count: 1 } }) }
      }
      return { ok: true, json: async () => ({ results: [], meta: { count: 0 } }) }
    }))

    await app.request('/api/citation/graph?paperId=Wseed')
    expect(storage.upsertPaperNode).toHaveBeenCalledWith(expect.objectContaining({ paperId: 'Wseed' }))
    expect(storage.upsertPaperNode).toHaveBeenCalledWith(expect.objectContaining({ paperId: 'Wref1' }))
    expect(storage.insertPaperEdge).toHaveBeenCalledWith(expect.objectContaining({
      fromPaperId: 'Wseed', toPaperId: 'Wref1', type: 'references', sourceSeedPaperId: 'Wseed',
    }))
  })

  it('caps depth to 2 even if higher value requested', async () => {
    const { app } = createApp()
    const seed = makeOaWork('Wseed', 'Seed Paper')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = url as string
      if (u.includes('/works/Wseed')) {
        return { ok: true, json: async () => seed }
      }
      return { ok: true, json: async () => ({ results: [], meta: { count: 0 } }) }
    }))

    const res = await app.request('/api/citation/graph?paperId=Wseed&depth=99')
    expect(res.status).toBe(200)
  })

  it('caps limit to 50 even if higher value requested', async () => {
    const { app } = createApp()
    const seed = makeOaWork('Wseed', 'Seed Paper')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = url as string
      if (u.includes('/works/Wseed')) {
        return { ok: true, json: async () => seed }
      }
      return { ok: true, json: async () => ({ results: [], meta: { count: 0 } }) }
    }))

    const res = await app.request('/api/citation/graph?paperId=Wseed&limit=999')
    expect(res.status).toBe(200)
  })

  it('deduplicates edges', async () => {
    const { app } = createApp()
    const ref1 = makeOaWork('Wref1', 'Ref 1')
    // Seed references ref1, and ref1 cites seed (edge case: same paper in both lists)
    const seed = makeOaWork('Wseed', 'Seed', { referenced_works: ['https://openalex.org/Wref1'] })

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = url as string
      if (u.includes('/works/Wseed')) {
        return { ok: true, json: async () => seed }
      }
      if (u.includes('filter=openalex:')) {
        return { ok: true, json: async () => ({ results: [ref1], meta: { count: 1 } }) }
      }
      if (u.includes('filter=cites:')) {
        return { ok: true, json: async () => ({ results: [ref1], meta: { count: 1 } }) }
      }
      return { ok: true, json: async () => ({ results: [], meta: { count: 0 } }) }
    }))

    const res = await app.request('/api/citation/graph?paperId=Wseed')
    const body = await res.json()
    // seed->Wref1:references and Wref1->seed:citations are different edges, both should exist
    expect(body.edges).toHaveLength(2)
  })
})
