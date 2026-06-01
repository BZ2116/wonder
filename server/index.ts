import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { cwd } from 'node:process'
import path from 'node:path'
import { StorageService } from './services/storage.js'
import { analysisRoutes } from './routes/analysis.js'
import { knowledgeRoutes } from './routes/knowledge.js'
import { knowledgeBaseRoutes } from './routes/knowledge-bases.js'
import { historyRoutes } from './routes/history.js'
import { configRoutes } from './routes/config.js'
import { filesRoutes } from './routes/files.js'
import { PythonBackendClient } from './services/python-backend.js'
import { qaRoutes } from './routes/qa.js'
import { serveStatic } from '@hono/node-server/serve-static'

const dataDir = process.env.DATA_DIR || path.join(cwd(), 'data')
const storage = StorageService.create(dataDir)
const pythonBackend = new PythonBackendClient()

const app = new Hono()

app.use('*', cors())

app.route('/api/analysis', analysisRoutes(storage, pythonBackend))
app.route('/api/knowledge', knowledgeRoutes(storage, pythonBackend))
app.route('/api/knowledge-bases', knowledgeBaseRoutes(storage))
app.route('/api/history', historyRoutes(storage))
app.route('/api/config', configRoutes(storage))
app.route('/api/files', filesRoutes())
app.route('/api/qa', qaRoutes(storage, pythonBackend))

app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.get('/api/health/ai-core', async (c) => {
  const ok = await pythonBackend.health()
  return c.json({ status: ok ? 'ok' : 'unavailable' }, ok ? 200 : 503)
})
app.get('/api/health/llm', async (c) => {
  try {
    const result = await pythonBackend.post<{ status: string; provider: string; message?: string }>(
      '/api/config/health/chat', {}
    )
    return c.json(result)
  } catch {
    return c.json({ status: 'unavailable', provider: 'unknown', message: 'Python AI Core is unavailable' }, 503)
  }
})

app.use(
  '/*',
  serveStatic({
    root: '../dist/renderer',
    rewriteRequestPath: (p) => p,
  })
)

app.get('*', serveStatic({ root: '../dist/renderer', path: 'index.html' }))

const port = parseInt(process.env.PORT || '9800', 10)
serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  console.log('Wonder server running at http://127.0.0.1:' + info.port)
})
