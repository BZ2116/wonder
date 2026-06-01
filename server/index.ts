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
import { discoveryRoutes } from './routes/discovery.js'
import { batchRoutes } from './routes/batch.js'
import { citationRoutes } from './routes/citation.js'
import { serveStatic } from '@hono/node-server/serve-static'

const dataDir = process.env.DATA_DIR || path.join(cwd(), 'data')
const storage = StorageService.create(dataDir)
const pythonBackend = new PythonBackendClient()

const app = new Hono()

app.use('*', cors())

app.route('/api/analysis', analysisRoutes(storage, pythonBackend))
app.route('/api/knowledge', knowledgeRoutes(storage, pythonBackend))
app.route('/api/knowledge-bases', knowledgeBaseRoutes(storage, pythonBackend))
app.route('/api/history', historyRoutes(storage))
app.route('/api/config', configRoutes(storage))
app.route('/api/files', filesRoutes())
app.route('/api/qa', qaRoutes(storage, pythonBackend))
app.route('/api/discovery', discoveryRoutes(storage))
app.route('/api/citation', citationRoutes(storage))
app.route('/api/batch', batchRoutes(storage))

app.get('/api/documents/:id', (c) => {
  const doc = storage.getDocument(c.req.param('id'))
  if (!doc) return c.json({ error: '文档不存在' }, 404)
  const history = storage.getLatestHistoryByDocumentId(doc.id)
  return c.json({ ...doc, analysisResult: history?.result ?? null })
})

app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.get('/api/health/ai-core', async (c) => {
  const ok = await pythonBackend.health()
  return c.json({ status: ok ? 'ok' : 'unavailable' }, ok ? 200 : 503)
})
app.get('/api/health/llm', async (c) => {
  try {
    const raw = storage.getConfig('appConfig')
    let chat: { provider?: string; apiKey?: string; baseUrl?: string; model?: string } = {}

    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        // normalizedConfig stores { chat: { provider, apiKey, baseUrl, model }, ... }
        if (parsed.chat) {
          chat = parsed.chat
        } else {
          // legacy flat format: { apiKey, baseUrl, model }
          chat = {
            provider: 'openai_compatible',
            apiKey: parsed.apiKey,
            baseUrl: parsed.baseUrl || 'https://api.anthropic.com',
            model: parsed.model || 'claude-sonnet-4-20250514',
          }
        }
      } catch { /* ignore */ }
    }

    if (!chat.apiKey) {
      return c.json({ status: 'error', provider: 'unknown', message: '未配置 API Key' }, 400)
    }

    const provider = chat.provider || 'openai_compatible'
    const baseUrl = chat.baseUrl || 'https://api.anthropic.com'
    const model = chat.model || 'claude-sonnet-4-20250514'

    let ok = false
    if (provider === 'anthropic') {
      const resp = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': chat.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        signal: AbortSignal.timeout(10000),
      })
      ok = resp.ok
    } else {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${chat.apiKey}`,
        },
        body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        signal: AbortSignal.timeout(10000),
      })
      ok = resp.ok
    }

    return c.json({ status: ok ? 'ok' : 'error', provider })
  } catch (err) {
    return c.json({ status: 'error', provider: 'unknown', message: err instanceof Error ? err.message : '连接失败' }, 503)
  }
})

const rendererDir = path.join(__dirname, '../../dist/renderer')

app.use(
  '/*',
  serveStatic({
    root: rendererDir,
    rewriteRequestPath: (p) => p,
  })
)

app.get('*', serveStatic({ root: rendererDir, path: 'index.html' }))

const port = parseInt(process.env.PORT || '9800', 10)
serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  console.log('Wonder server running at http://127.0.0.1:' + info.port)
})
