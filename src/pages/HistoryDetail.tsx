import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Typography, Spin, Button } from 'antd'
import { ArrowLeftOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { api, ApiError } from '../services/api'
import AnalysisResult from '../components/AnalysisResult'
import { normalizeAnalysisResult } from '../lib/analysis/normalize'
import type { AnalysisResult as AnalysisResultType } from '../types/analysis'

export default function HistoryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<{ id: string; created_at: string; result: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      api.get<{ id: string; created_at: string; result: string }>(`/api/history/${id}`)
        .then(setData)
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

  if (!data) {
    return (
      <div className="wonder-page">
        <Typography.Text style={{ color: 'var(--ink-faint)' }}>
          {error === 'not_found' ? '记录不存在' : error || '加载失败，请稍后重试。'}
        </Typography.Text>
      </div>
    )
  }

  let parsed: AnalysisResultType | unknown
  try {
    const raw = JSON.parse(data.result)
    parsed = normalizeAnalysisResult(raw) ?? raw
  } catch {
    parsed = data.result
  }

  const isStructured = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && ('summary' in parsed || 'readingCard' in parsed)
  const paperTitle = isStructured ? (parsed as AnalysisResultType).paperTitle : undefined
  const fileName = isStructured ? (parsed as Record<string, unknown>).fileName as string | undefined : undefined

  return (
    <div className="wonder-page wonder-stagger">
      <div className="wonder-page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/history')} />
        <div>
          <Typography.Title level={4} style={{ marginBottom: 0 }}>{paperTitle || '分析详情'}</Typography.Title>
          <Typography.Text type="secondary">
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {new Date(data.created_at).toLocaleString('zh-CN')}
          </Typography.Text>
        </div>
      </div>

      {isStructured ? (
        <AnalysisResult result={parsed as AnalysisResultType} fileName={fileName} />
      ) : (
        <Card>
          <pre style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--ink-secondary)',
            background: 'var(--bg)',
            padding: '16px 20px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)',
            maxHeight: 600,
            overflow: 'auto',
          }}>
            {JSON.stringify(parsed, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  )
}
