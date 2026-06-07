import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Typography, Spin, Button } from 'antd'
import { ArrowLeftOutlined, FileTextOutlined } from '@ant-design/icons'
import { api, ApiError } from '../services/api'
import AnalysisResult from '../components/AnalysisResult'
import { normalizeAnalysisResult } from '../lib/analysis/normalize'
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
      const normalized = normalizeAnalysisResult(raw)
      if (normalized) return normalized
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
      <div className="wonder-loading-center">
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
        <AnalysisResult result={result} fileName={doc.file_name || undefined} />
      ) : (
        <Card>
          <Typography.Text type="secondary">该文档暂无分析报告</Typography.Text>
        </Card>
      )}
    </div>
  )
}
