import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Typography, Spin, Button } from 'antd'
import { ArrowLeftOutlined, FileTextOutlined } from '@ant-design/icons'
import { api, ApiError } from '../services/api'
import AnalysisResult from '../components/AnalysisResult'
import type { AnalysisResult as AnalysisResultType } from '../types/analysis'

interface DocumentRow {
  id: string
  file_name: string | null
  file_path: string | null
  file_type: string | null
  created_at: string
  summary: string | null
  reading_card: string | null
  relation_analysis: string | null
  writing_materials: string | null
  todo_list: string | null
  tags: string | null
  match_score: number | null
  lifecycle_status: string | null
  index_status: string | null
  index_error: string | null
  indexed_at: string | null
  analysisResult: string | null
}

function parseAnalysisResult(doc: DocumentRow): AnalysisResultType | null {
  // Prefer the full analysis_history result over the flat document columns
  if (doc.analysisResult) {
    try {
      const raw = JSON.parse(doc.analysisResult)
      // Nested format: { literature, relation, writing, readmeSuggestions }
      if (raw && typeof raw === 'object' && raw.literature) {
        const lit = raw.literature || {}
        const rel = raw.relation || {}
        const wri = raw.writing || {}
        return {
          summary: lit.summary || '',
          readingCard: lit.readingCard || '',
          knowledgeBaseFitScore: lit.fitScore,
          recommendedAction: lit.action,
          tags: lit.tags,
          relationAnalysis: rel.relationAnalysis,
          relationToExistingDocs: rel.relationToExistingDocs,
          writingAssets: wri.writingAssets,
          readmeUpdateSuggestions: raw.readmeSuggestions,
        } as AnalysisResultType
      }
      // Flat format
      if (raw && typeof raw === 'object' && ('reading_card' in raw || 'readingCard' in raw || 'summary' in raw)) {
        const fitScore = (raw.fit_score as number) ?? (raw.knowledgeBaseFitScore as number) ?? undefined
        const fitReason = (raw.fit_reason as string) || (raw.fitReason as string) || undefined
        const relationType = (raw.relation_type as string) || (raw.relationType as string) || undefined
        return {
          summary: (raw.summary as string) || '',
          readingCard: (raw.reading_card as string) || (raw.readingCard as string) || '',
          knowledgeBaseFitScore: fitScore,
          fitReason,
          relationToExistingDocs: raw.relationToExistingDocs || (relationType ? {
            type: relationType,
            reason: fitReason || '',
            relatedDocumentIds: [],
          } : undefined),
          relationAnalysis: (raw.relation_analysis as string) || (raw.relationAnalysis as string) || undefined,
          writingMaterials: (raw.writing_materials as string) || (raw.writingMaterials as string) || undefined,
          todoList: (raw.todo_list as string) || (raw.todoList as string) || undefined,
          noveltyForKnowledgeBase: raw.noveltyForKnowledgeBase as string | undefined,
          suggestedPlacement: raw.suggestedPlacement as AnalysisResultType['suggestedPlacement'],
          writingAssets: raw.writingAssets as AnalysisResultType['writingAssets'],
          readmeUpdateSuggestions: raw.readmeUpdateSuggestions as AnalysisResultType['readmeUpdateSuggestions'],
          matchScore: fitScore,
          matchReason: fitReason,
          tags: raw.tags as string[] | undefined,
          recommendedAction: (raw.recommended_action as string) || (raw.recommendedAction as string) || undefined,
        } as AnalysisResultType
      }
      // Unknown structured format — pass through
      return raw as AnalysisResultType
    } catch {
      // Fall through to flat columns
    }
  }

  // Fallback: use flat document columns
  const fitScore = doc.match_score ?? undefined
  return {
    summary: doc.summary || '',
    readingCard: doc.reading_card || '',
    knowledgeBaseFitScore: fitScore,
    relationAnalysis: doc.relation_analysis || undefined,
    writingMaterials: doc.writing_materials || undefined,
    todoList: doc.todo_list || undefined,
    matchScore: fitScore,
    tags: doc.tags ? doc.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
  } as AnalysisResultType
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<DocumentRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      api.get<DocumentRow>(`/api/documents/${id}`)
        .then(setDoc)
        .catch((err) => {
          if (err instanceof ApiError && err.status === 404) {
            setError('not_found')
          } else {
            setError(err instanceof ApiError ? err.userMessage : '加载失败，请稍后重试。')
          }
        })
        .finally(() => setLoading(false))
    }
  }, [id])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="wonder-page">
        <Typography.Text style={{ color: 'var(--ink-faint)' }}>
          {error === 'not_found' ? '文档不存在' : error || '加载失败，请稍后重试。'}
        </Typography.Text>
      </div>
    )
  }

  const result = parseAnalysisResult(doc)
  const hasStructuredResult = result && (result.summary || result.readingCard)

  return (
    <div className="wonder-page wonder-stagger">
      <div className="wonder-page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/knowledge')} />
        <div>
          <Typography.Title level={4} style={{ marginBottom: 0 }}>
            <FileTextOutlined style={{ marginRight: 8 }} />
            {doc.file_name || '未命名文档'}
          </Typography.Title>
          <Typography.Text type="secondary">
            {new Date(doc.created_at).toLocaleString('zh-CN')}
          </Typography.Text>
        </div>
      </div>

      {hasStructuredResult ? (
        <AnalysisResult result={result} />
      ) : (
        <Card>
          <Typography.Text type="secondary">该文档暂无分析报告</Typography.Text>
        </Card>
      )}
    </div>
  )
}
