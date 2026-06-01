import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Typography, Button, Empty, Tag, Popconfirm } from 'antd'
import { FileTextOutlined, RightOutlined, BookOutlined, DeleteOutlined } from '@ant-design/icons'
import { useHistoryStore } from '../stores/history'
import { useKnowledgeStore } from '../stores/knowledge'

const actionLabels: Record<string, { label: string; color: string }> = {
  add: { label: '收录', color: 'green' },
  deep_read: { label: '精读', color: 'blue' },
  skim: { label: '略读', color: 'default' },
  track_citations: { label: '追踪', color: 'orange' },
  add_to_other_kb: { label: '其他库', color: 'purple' },
  ignore: { label: '忽略', color: 'default' },
}

export default function History() {
  const navigate = useNavigate()
  const { items, loading, loadHistory, deleteHistory } = useHistoryStore()
  const { knowledgeBases, loadKnowledgeBases } = useKnowledgeStore()

  useEffect(() => { loadHistory(); loadKnowledgeBases() }, [loadHistory, loadKnowledgeBases])

  const kbMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const kb of knowledgeBases) m.set(kb.id, kb.name)
    return m
  }, [knowledgeBases])

  const list = items as { id: string; document_id: string | null; created_at: string; result: string }[]

  const parseResult = (result: string) => {
    try {
      const parsed = JSON.parse(result)
      const lit = parsed.literature || {}
      return {
        paperTitle: parsed.paperTitle || parsed.paper_title || null,
        summary: lit.summary || parsed.summary || null,
        fitScore: lit.fitScore ?? lit.matchScore ?? parsed.knowledgeBaseFitScore ?? parsed.matchScore ?? parsed.fit_score ?? null,
        action: lit.action || parsed.recommendedAction || parsed.recommended_action || null,
        knowledgeBaseId: parsed.knowledgeBaseId || null,
        fileName: parsed.fileName || parsed.file_name || null,
      }
    } catch {
      return { paperTitle: null, summary: null, fitScore: null, action: null, knowledgeBaseId: null, fileName: null }
    }
  }

  return (
    <div className="wonder-page wonder-stagger">
      <div className="wonder-page-header">
        <Typography.Title level={4}>历史记录</Typography.Title>
        <Typography.Text type="secondary">查看过往分析结果</Typography.Text>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink-faint)' }}>
          加载中...
        </div>
      ) : list.length === 0 ? (
        <Empty
          description={
            <span style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-serif)' }}>
              暂无历史记录
            </span>
          }
        >
          <Button type="primary" onClick={() => navigate('/')}>去分析</Button>
        </Empty>
      ) : (
        <div>
          {list.map((item) => {
            const { paperTitle, summary, fitScore, action, knowledgeBaseId, fileName } = parseResult(item.result)
            // Derive action: if document is in a KB, show "收录" unless AI recommended something else
            const effectiveAction = action || (knowledgeBaseId ? 'add' : null)
            const actionInfo = effectiveAction ? actionLabels[effectiveAction] : null
            const kbName = knowledgeBaseId ? kbMap.get(knowledgeBaseId) : null
            return (
              <div
                key={item.id}
                className="wonder-history-card"
                onClick={() => navigate(`/history/${item.id}`)}
              >
                <FileTextOutlined />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="wonder-history-card__title">
                    {paperTitle || summary || fileName || `分析记录 ${item.id.slice(0, 8)}`}
                  </div>
                  <div className="wonder-history-card__meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>{new Date(item.created_at).toLocaleString('zh-CN')}</span>
                    {kbName && (
                      <Tag color="blue"><BookOutlined style={{ marginRight: 4 }} />{kbName}</Tag>
                    )}
                    {fitScore != null && (
                      <Tag color={fitScore >= 70 ? 'green' : fitScore >= 40 ? 'orange' : 'default'}>
                        契合 {Math.round(fitScore)}分
                      </Tag>
                    )}
                    {actionInfo && (
                      <Tag color={actionInfo.color}>{actionInfo.label}</Tag>
                    )}
                  </div>
                </div>
                <div className="wonder-history-card__actions" onClick={(e) => e.stopPropagation()}>
                  <Popconfirm
                    title="确认删除"
                    description="删除后不可恢复，确定要删除这条记录吗？"
                    onConfirm={() => deleteHistory(item.id)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                  <Button type="text" size="small" icon={<RightOutlined />} onClick={() => navigate(`/history/${item.id}`)} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
