import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { StorageService } from './services/storage'
import { LLMService } from './services/llm'
import { analysisRoutes } from './routes/analysis'
import { knowledgeRoutes } from './routes/knowledge'
import { historyRoutes } from './routes/history'
import { configRoutes } from './routes/config'
import path from 'path'

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
const storage = StorageService.create(dataDir)
const llmService = new LLMService(storage)

const app = new Hono()
app.use('/*', cors())

app.route('/api/analysis', analysisRoutes(storage, llmService))
app.route('/api/knowledge', knowledgeRoutes(storage, llmService))
app.route('/api/history', historyRoutes(storage))
app.route('/api/config', configRoutes(storage))

app.get('/api/health', (c) => c.json({ status: 'ok' }))

const port = parseInt(process.env.PORT || '9800')
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`Wonder server running on http://127.0.0.1:${port}`)
})
