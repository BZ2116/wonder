import { Hono } from 'hono'
import { StorageService } from '../services/storage'
import { randomUUID } from 'crypto'
import { OA_BASE, oaFetch, mapWorkToPaper, type OaWork } from '../services/openalex'

export function discoveryRoutes(storage: StorageService) {
  const app = new Hono()

  // ── OpenAlex proxy ──────────────────────────────────────────────────

  app.get('/search', async (c) => {
    const q = c.req.query('q')
    const limit = Math.min(50, parseInt(c.req.query('limit') ?? '20', 10))
    if (!q) return c.json({ error: '缺少查询参数 q' }, 400)

    try {
      const url = `${OA_BASE}/works?search=${encodeURIComponent(q)}&per_page=${limit}`
      const res = await oaFetch(url)
      if (!res.ok) return c.json({ error: `OpenAlex API 错误: ${res.status}` }, 502)

      const data = await res.json()
      return c.json({
        total: data.meta?.count ?? 0,
        papers: (data.results ?? []).map(mapWorkToPaper).filter(Boolean),
      })
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : '搜索失败' }, 502)
    }
  })

  app.get('/papers/:paperId', async (c) => {
    const paperId = c.req.param('paperId')
    try {
      const url = `${OA_BASE}/works/${encodeURIComponent(paperId)}`
      const res = await oaFetch(url, 10000)
      if (!res.ok) return c.json({ error: `OpenAlex API 错误: ${res.status}` }, 502)

      const work: OaWork = await res.json()
      return c.json(mapWorkToPaper(work))
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : '获取论文失败' }, 502)
    }
  })

  // ── Candidate CRUD ──────────────────────────────────────────────────

  app.post('/candidates', async (c) => {
    const body = await c.req.json()
    if (!body.paperId) return c.json({ error: 'paperId is required' }, 400)
    if (!body.title) return c.json({ error: 'title is required' }, 400)
    const id = body.id || randomUUID()
    storage.upsertDiscoveryCandidate({
      id,
      paperId: body.paperId,
      title: body.title,
      abstract: body.abstract,
      year: body.year,
      citationCount: body.citationCount,
      influentialCitationCount: body.influentialCitationCount,
      venue: body.venue,
      authors: body.authors ? JSON.stringify(body.authors) : null,
      url: body.url,
      sourceQuery: body.sourceQuery,
      discoveryPriorityScore: body.discoveryPriorityScore,
      discoveryReason: body.discoveryReason,
      state: body.state ?? 'saved',
      knowledgeBaseId: body.knowledgeBaseId ?? null,
    })
    const saved = storage.getDiscoveryCandidate(id)
    return c.json(saved, 201)
  })

  app.get('/candidates/:id', (c) => {
    const id = c.req.param('id')
    const candidate = storage.getDiscoveryCandidate(id)
    if (!candidate) return c.json({ error: '候选不存在' }, 404)
    return c.json(candidate)
  })

  app.get('/candidates', (c) => {
    const knowledgeBaseId = c.req.query('knowledgeBaseId') ?? undefined
    const state = c.req.query('state') ?? undefined
    const candidates = storage.listDiscoveryCandidates({ knowledgeBaseId, state })
    return c.json(candidates)
  })

  app.patch('/candidates/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json()
    const existing = storage.getDiscoveryCandidate(id)
    if (!existing) return c.json({ error: '候选不存在' }, 404)

    if (body.state) {
      storage.updateDiscoveryCandidateState(id, body.state)
    }
    const updated = storage.getDiscoveryCandidate(id)
    return c.json(updated)
  })

  app.delete('/candidates/:id', (c) => {
    const id = c.req.param('id')
    const existing = storage.getDiscoveryCandidate(id)
    if (!existing) return c.json({ error: '候选不存在' }, 404)

    storage.deleteDiscoveryCandidate(id)
    return c.json({ success: true })
  })

  return app
}
