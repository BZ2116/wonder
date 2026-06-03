import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { historyRoutes } from '../../../server/routes/history'

const sampleHistory = [
  { id: 'h1', query: 'What is AI?', answer: 'Artificial Intelligence', created_at: '2025-01-01' },
  { id: 'h2', query: 'What is NLP?', answer: 'Natural Language Processing', created_at: '2025-01-02' },
]

function createApp() {
  const storage = {
    listHistory: vi.fn((limit: number) => sampleHistory.slice(0, limit)),
    getHistory: vi.fn((id: string) => sampleHistory.find(h => h.id === id)),
    deleteHistory: vi.fn((id: string) => sampleHistory.some(h => h.id === id)),
  }
  const app = new Hono()
  app.route('/api/history', historyRoutes(storage as any))
  return { app, storage }
}

describe('historyRoutes - GET /', () => {
  it('returns history list', async () => {
    const { app, storage } = createApp()

    const res = await app.request('/api/history')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveLength(2)
    expect(storage.listHistory).toHaveBeenCalledWith(50)
  })

  it('passes limit parameter to storage', async () => {
    const { app, storage } = createApp()

    await app.request('/api/history?limit=10')

    expect(storage.listHistory).toHaveBeenCalledWith(10)
  })

  it('caps limit to 500', async () => {
    const { app, storage } = createApp()

    await app.request('/api/history?limit=999999')

    expect(storage.listHistory).toHaveBeenCalledWith(500)
  })

  it('handles NaN limit by falling back to 50', async () => {
    const { app, storage } = createApp()

    await app.request('/api/history?limit=abc')

    expect(storage.listHistory).toHaveBeenCalledWith(50)
  })
})

describe('historyRoutes - GET /:id', () => {
  it('returns a single history entry', async () => {
    const { app } = createApp()

    const res = await app.request('/api/history/h1')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.id).toBe('h1')
    expect(body.query).toBe('What is AI?')
  })

  it('returns 404 for missing entry', async () => {
    const { app } = createApp()

    const res = await app.request('/api/history/nonexistent')

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Not found')
  })
})

describe('historyRoutes - DELETE /:id', () => {
  it('deletes an existing entry', async () => {
    const { app, storage } = createApp()

    const res = await app.request('/api/history/h1', { method: 'DELETE' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(storage.deleteHistory).toHaveBeenCalledWith('h1')
  })

  it('returns 404 when deleting a missing entry', async () => {
    const { app, storage } = createApp()
    storage.deleteHistory.mockReturnValueOnce(false)

    const res = await app.request('/api/history/nonexistent', { method: 'DELETE' })

    expect(res.status).toBe(404)
  })
})
