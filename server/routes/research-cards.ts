import { Hono } from 'hono'
import { randomUUID } from 'crypto'
import { StorageService } from '../services/storage.js'
import { PythonBackendClient } from '../services/python-backend.js'

// ── Helpers ──────────────────────────────────────────────────────────────

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

function normalizeEvidenceRef(ref: any) {
  return {
    id: ref.id || randomUUID(),
    documentId: ref.documentId ?? ref.document_id ?? ref.doc_id ?? null,
    fileName: ref.fileName ?? ref.file_name ?? null,
    chunkId: ref.chunkId ?? ref.chunk_id ?? null,
    chunkIndex: ref.chunkIndex ?? ref.chunk_index ?? null,
    chunkType: ref.chunkType ?? ref.chunk_type ?? 'content',
    snippet: String(ref.snippet ?? ref.content ?? ''),
    score: typeof ref.score === 'number' ? ref.score : null,
  }
}

function cardRowToResponse(row: any) {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    question: row.question,
    coreClaims: parseJsonArray(row.core_claims),
    knowledgeType: row.knowledge_type,
    tags: parseJsonArray(row.tags),
    subDirection: row.sub_direction,
    validationNotes: row.validation_notes,
    useCases: parseJsonArray(row.use_cases),
    linkedDocIds: parseJsonArray(row.linked_doc_ids),
    answerMode: row.answer_mode,
    sourceMessageId: row.source_message_id,
    status: row.status,
    noPaperEvidence: row.no_paper_evidence === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function evidenceRefRowToResponse(row: any) {
  return {
    id: row.id,
    documentId: row.document_id,
    fileName: row.file_name,
    chunkId: row.chunk_id,
    chunkIndex: row.chunk_index,
    chunkType: row.chunk_type,
    snippet: row.snippet,
    score: row.score,
  }
}

// ── Route Factory ────────────────────────────────────────────────────────

export function researchCardRoutes(storage: StorageService, python: PythonBackendClient) {
  const app = new Hono()

  // ── POST /draft-from-qa ──────────────────────────────────────────────

  app.post('/draft-from-qa', async (c) => {
    const body = await c.req.json<{
      sessionId: string
      messageId: string
      knowledgeBaseId?: string
    }>()

    if (!body.sessionId || !body.messageId) {
      return c.json({ error: 'sessionId and messageId are required' }, 400)
    }

    // Load the assistant message
    const message = storage.getQAMessage(body.messageId)
    if (!message) {
      return c.json({ error: 'Message not found' }, 404)
    }
    if (message.session_id !== body.sessionId) {
      return c.json({ error: 'Message does not belong to session' }, 400)
    }
    if (message.role !== 'assistant') {
      return c.json({ error: 'Message is not an assistant message' }, 400)
    }

    // Load previous user message
    const prevUser = storage.getPreviousUserMessage(body.sessionId, message.created_at)

    // Parse sources from assistant message
    let sources: any = {}
    try {
      if (message.sources) sources = JSON.parse(message.sources)
    } catch { /* ignore */ }

    // Infer KB id from request or session scope
    let knowledgeBaseId = body.knowledgeBaseId ?? null
    if (!knowledgeBaseId) {
      const session = storage.getQASession(body.sessionId)
      if (session) {
        try {
          const scopeIds = JSON.parse(session.scope_ids)
          if (session.scope_type === 'knowledge_base' && scopeIds.length > 0) {
            knowledgeBaseId = scopeIds[0]
          }
        } catch { /* ignore */ }
      }
    }

    // Try calling Python for draft generation
    try {
      const result = await python.post<any>('/api/research-cards/draft', {
        question: prevUser?.content ?? '',
        answer: message.content,
        sources: sources.refs ?? [],
        answer_mode: sources.answerMode ?? null,
        knowledge_base_id: knowledgeBaseId,
      })

      return c.json({
        question: result.question ?? prevUser?.content ?? '',
        coreClaims: result.core_claims ?? [],
        knowledgeType: result.knowledge_type ?? 'other',
        tags: result.tags ?? [],
        subDirection: result.sub_direction ?? null,
        validationNotes: result.validation_notes ?? '',
        useCases: result.use_cases ?? [],
        linkedDocIds: result.linked_doc_ids ?? [],
        noPaperEvidence: result.no_paper_evidence ?? false,
        evidenceRefs: (result.evidence_refs ?? []).map(normalizeEvidenceRef),
        answerMode: sources.answerMode ?? null,
        sourceMessageId: message.id,
      })
    } catch {
      // Fallback draft when Python fails
      const refs = (sources.refs ?? []).map(normalizeEvidenceRef)
      return c.json({
        question: prevUser?.content ?? '',
        coreClaims: [message.content.length > 500 ? message.content.slice(0, 500) : message.content],
        knowledgeType: 'other',
        tags: [],
        subDirection: null,
        validationNotes: '',
        useCases: [],
        linkedDocIds: sources.docIds ?? [],
        noPaperEvidence: refs.length === 0,
        evidenceRefs: refs,
        answerMode: sources.answerMode ?? null,
        sourceMessageId: message.id,
      })
    }
  })

  // ── POST / ───────────────────────────────────────────────────────────

  app.post('/', async (c) => {
    const body = await c.req.json<{
      knowledgeBaseId: string
      question: string
      coreClaims?: string[]
      knowledgeType?: string
      tags?: string[]
      subDirection?: string | null
      validationNotes?: string
      useCases?: string[]
      linkedDocIds?: string[]
      answerMode?: string | null
      sourceMessageId?: string | null
      status?: string
      noPaperEvidence?: boolean
      evidenceRefs?: any[]
    }>()

    if (!body.knowledgeBaseId || !body.question) {
      return c.json({ error: 'knowledgeBaseId and question are required' }, 400)
    }

    const cardId = randomUUID()
    const evidenceRefs = (body.evidenceRefs ?? []).map(normalizeEvidenceRef)

    // Create card and evidence refs in a single transaction
    storage.createResearchCardWithRefs({
      id: cardId,
      knowledgeBaseId: body.knowledgeBaseId,
      question: body.question,
      coreClaims: JSON.stringify(body.coreClaims ?? []),
      knowledgeType: body.knowledgeType ?? 'other',
      tags: JSON.stringify(body.tags ?? []),
      subDirection: body.subDirection ?? null,
      validationNotes: body.validationNotes ?? '',
      useCases: JSON.stringify(body.useCases ?? []),
      linkedDocIds: JSON.stringify(body.linkedDocIds ?? []),
      answerMode: body.answerMode ?? null,
      sourceMessageId: body.sourceMessageId ?? null,
      status: body.status ?? 'saved',
      noPaperEvidence: body.noPaperEvidence ?? false,
    }, evidenceRefs)

    // Upsert vector index row with status 'indexing'
    const vectorIndexId = randomUUID()
    storage.upsertResearchCardVectorIndex({
      id: vectorIndexId,
      cardId,
      knowledgeBaseId: body.knowledgeBaseId,
      backend: 'chroma',
      collectionName: `cards__${cardId}`,
      status: 'indexing',
    })

    // Fire-and-forget Python index call
    python.post('/api/research-cards/index', {
      card_id: cardId,
      knowledge_base_id: body.knowledgeBaseId,
      question: body.question,
      core_claims: body.coreClaims ?? [],
      evidence_refs: evidenceRefs,
    }).then(() => {
      storage.markResearchCardVectorIndexStatus(vectorIndexId, 'indexed')
    }).catch((err) => {
      storage.markResearchCardVectorIndexStatus(vectorIndexId, 'failed', err instanceof Error ? err.message : String(err))
    })

    // Return the saved card
    const card = storage.getResearchCard(cardId)!
    const refs = storage.getResearchCardEvidenceRefs(cardId)

    return c.json({
      ...cardRowToResponse(card),
      evidenceRefs: refs.map(evidenceRefRowToResponse),
    }, 201)
  })

  // ── GET /knowledge-base/:kbId ────────────────────────────────────────

  app.get('/knowledge-base/:kbId', (c) => {
    const kbId = c.req.param('kbId')
    const status = c.req.query('status')
    const knowledgeType = c.req.query('knowledgeType')
    const tag = c.req.query('tag')
    const documentId = c.req.query('documentId')

    const cards = storage.listResearchCards({
      knowledgeBaseId: kbId,
      status,
      knowledgeType,
      tag,
      documentId,
    })

    const result = cards.map(card => {
      const refs = storage.getResearchCardEvidenceRefs(card.id)
      return {
        ...cardRowToResponse(card),
        evidenceRefs: refs.map(evidenceRefRowToResponse),
      }
    })

    return c.json(result)
  })

  // ── PATCH /:id ───────────────────────────────────────────────────────

  app.patch('/:id', async (c) => {
    const id = c.req.param('id')
    const card = storage.getResearchCard(id)
    if (!card) return c.json({ error: 'Card not found' }, 404)

    const body = await c.req.json<{
      coreClaims?: string[]
      knowledgeType?: string
      tags?: string[]
      subDirection?: string | null
      validationNotes?: string
      useCases?: string[]
      linkedDocIds?: string[]
      status?: string
      noPaperEvidence?: boolean
      evidenceRefs?: any[]
    }>()

    // Update card fields
    storage.updateResearchCard(id, {
      coreClaims: body.coreClaims !== undefined ? JSON.stringify(body.coreClaims) : undefined,
      knowledgeType: body.knowledgeType,
      tags: body.tags !== undefined ? JSON.stringify(body.tags) : undefined,
      subDirection: body.subDirection,
      validationNotes: body.validationNotes,
      useCases: body.useCases !== undefined ? JSON.stringify(body.useCases) : undefined,
      linkedDocIds: body.linkedDocIds !== undefined ? JSON.stringify(body.linkedDocIds) : undefined,
      status: body.status,
      noPaperEvidence: body.noPaperEvidence,
    })

    // Replace evidence refs if passed
    let evidenceRefs: any[] | undefined
    if (body.evidenceRefs !== undefined) {
      evidenceRefs = body.evidenceRefs.map(normalizeEvidenceRef)
      storage.replaceResearchCardEvidenceRefs(id, evidenceRefs)
    }

    // Re-index if content changed
    if (body.coreClaims !== undefined || body.evidenceRefs !== undefined || body.knowledgeType !== undefined) {
      // Get existing vector indexes and mark them stale, create new one
      const existingIndexes = storage.getResearchCardVectorIndexes(id)
      for (const idx of existingIndexes) {
        storage.markResearchCardVectorIndexStatus(idx.id, 'stale')
      }

      const vectorIndexId = randomUUID()
      storage.upsertResearchCardVectorIndex({
        id: vectorIndexId,
        cardId: id,
        knowledgeBaseId: card.knowledge_base_id,
        backend: 'chroma',
        collectionName: `cards__${id}`,
        status: 'indexing',
      })

      const refs = evidenceRefs ?? storage.getResearchCardEvidenceRefs(id)
      const updatedCard = storage.getResearchCard(id)!

      // Fire-and-forget re-index
      python.post('/api/research-cards/index', {
        card_id: id,
        knowledge_base_id: card.knowledge_base_id,
        question: updatedCard.question,
        core_claims: parseJsonArray(updatedCard.core_claims),
        evidence_refs: refs,
      }).then(() => {
        storage.markResearchCardVectorIndexStatus(vectorIndexId, 'indexed')
      }).catch((err) => {
        storage.markResearchCardVectorIndexStatus(vectorIndexId, 'failed', err instanceof Error ? err.message : String(err))
      })
    }

    // Return updated card
    const updated = storage.getResearchCard(id)!
    const refs = storage.getResearchCardEvidenceRefs(id)

    return c.json({
      ...cardRowToResponse(updated),
      evidenceRefs: refs.map(evidenceRefRowToResponse),
    })
  })

  // ── DELETE /:id ──────────────────────────────────────────────────────

  app.delete('/:id', (c) => {
    const id = c.req.param('id')
    const card = storage.getResearchCard(id)
    if (!card) return c.json({ error: 'Card not found' }, 404)

    storage.archiveResearchCard(id)
    return c.json({ success: true })
  })

  return app
}
