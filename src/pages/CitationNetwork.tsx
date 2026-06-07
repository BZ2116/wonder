import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Card, Typography, Spin, Tag, Space, Button, Empty, message, Divider } from 'antd'
import { LinkOutlined, ArrowLeftOutlined, BookOutlined, CalendarOutlined, GlobalOutlined, SaveOutlined, StopOutlined } from '@ant-design/icons'
import { buildCitationGraph, type GraphNode, type GraphEdge } from '../lib/discovery/citation-graph'
import { calculateDiscoveryPriorityScore } from '../lib/discovery/ranking'
import { useDiscoveryStore } from '../stores/discovery'
import type { DiscoveryCandidate } from '../types/discovery'

export default function CitationNetwork() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const paperId = searchParams.get('id')

  const [loading, setLoading] = useState(false)
  const [seedPaper, setSeedPaper] = useState<GraphNode | null>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [selectedRef, setSelectedRef] = useState<GraphNode | null>(null)

  const { discoveryContext, saveCandidate, isInQueue, getCandidate } = useDiscoveryStore()

  useEffect(() => {
    if (!paperId) return
    setLoading(true)
    setSelectedRef(null)

    buildCitationGraph(paperId, 1, 15)
      .then(graph => {
        const seed = graph.nodes.find(n => n.paperId === paperId) ?? null
        setSeedPaper(seed)
        setNodes(graph.nodes)
        setEdges(graph.edges)

        const refEdges = graph.edges.filter(e => e.from === paperId && e.type === 'references')
        const citEdges = graph.edges.filter(e => e.to === paperId && e.type === 'citations')
        if (refEdges.length === 0 && citEdges.length === 0 && graph.nodes.length <= 1) {
          message.warning('引用数据可能不完整，部分信息加载失败')
        }
      })
      .catch(e => message.error(`加载失败: ${(e as Error).message}`))
      .finally(() => setLoading(false))
  }, [paperId])

  const references = useMemo(() => {
    return edges
      .filter(e => e.from === paperId && e.type === 'references')
      .map(e => nodes.find(n => n.paperId === e.to))
      .filter(Boolean) as GraphNode[]
  }, [edges, nodes, paperId])

  const citations = useMemo(() => {
    return edges
      .filter(e => e.to === paperId && e.type === 'citations')
      .map(e => nodes.find(n => n.paperId === e.from))
      .filter(Boolean) as GraphNode[]
  }, [edges, nodes, paperId])

  const getScoreAndReason = (node: GraphNode) => {
    if (!discoveryContext || discoveryContext.keywords.length === 0) {
      return { score: 0, reason: '无上下文' }
    }
    return calculateDiscoveryPriorityScore({
      title: node.title,
      abstract: node.abstract ?? null,
      year: node.year,
      citationCount: node.citationCount,
      venue: node.venue,
    }, discoveryContext.keywords)
  }

  const handleSaveCandidate = async (node: GraphNode, type: 'reference' | 'citation') => {
    if (!discoveryContext) {
      message.warning('请先在文献发现页面设置发现上下文')
      return
    }

    const ranking = getScoreAndReason(node)
    const candidate: Omit<DiscoveryCandidate, 'id'> = {
      paperId: node.paperId,
      title: node.title,
      abstract: node.abstract ?? null,
      year: node.year,
      citationCount: node.citationCount,
      influentialCitationCount: node.influentialCitationCount ?? 0,
      venue: node.venue,
      authors: node.authors ?? [],
      sourceQuery: type === 'reference' ? 'citation-reference' : 'citation-citing',
      discoveryPriorityScore: ranking.score,
      discoveryReason: ranking.reason,
      state: 'saved',
    }
    try {
      await saveCandidate(candidate)
      message.success('已保存到候选队列')
    } catch {
      message.error('保存失败，请重试')
    }
  }

  const handleIgnoreCandidate = async (node: GraphNode, type: 'reference' | 'citation') => {
    if (!discoveryContext) {
      message.warning('请先在文献发现页面设置发现上下文')
      return
    }

    const ranking = getScoreAndReason(node)
    const candidate: Omit<DiscoveryCandidate, 'id'> = {
      paperId: node.paperId,
      title: node.title,
      abstract: node.abstract ?? null,
      year: node.year,
      citationCount: node.citationCount,
      influentialCitationCount: node.influentialCitationCount ?? 0,
      venue: node.venue,
      authors: node.authors ?? [],
      sourceQuery: type === 'reference' ? 'citation-reference' : 'citation-citing',
      discoveryPriorityScore: ranking.score,
      discoveryReason: ranking.reason,
      state: 'ignored',
    }
    try {
      await saveCandidate(candidate)
      message.info('已忽略该论文')
    } catch {
      message.error('操作失败，请重试')
    }
  }

  const getCandidateStateTag = (nodeId: string) => {
    const candidate = getCandidate(nodeId)
    if (!candidate) return null

    const stateMap = {
      new: { color: 'blue', text: '新' },
      saved: { color: 'green', text: '已保存' },
      ignored: { color: 'default', text: '已忽略' },
      sent_to_analysis: { color: 'purple', text: '已发送分析' },
    }
    const state = stateMap[candidate.state]
    return <Tag color={state.color} style={{ marginLeft: 4 }}>{state.text}</Tag>
  }

  if (!paperId) {
    return (
      <div className="wonder-page">
        <div className="wonder-page-header">
          <Typography.Title level={4}>引用图谱</Typography.Title>
        </div>
        <Empty description="请从文献发现页面选择一篇论文查看引用图谱">
          <Button type="primary" onClick={() => navigate('/discovery')}>去搜索</Button>
        </Empty>
      </div>
    )
  }

  return (
    <div className="wonder-page wonder-stagger">
      <div className="wonder-page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/discovery')} />
        <div>
          <Typography.Title level={4} style={{ marginBottom: 0 }}>引用图谱</Typography.Title>
          <Typography.Text type="secondary">追踪论文的引用关系</Typography.Text>
        </div>
      </div>

      {loading ? (
        <div className="wonder-loading-center">
          <Spin size="large" />
          <div style={{ marginTop: 16, color: 'var(--ink-faint)' }}>正在加载引用数据...</div>
        </div>
      ) : (
        <>
          {seedPaper && (
            <Card style={{ marginBottom: 16 }}>
              <Typography.Title level={5} style={{ fontFamily: 'var(--font-serif)', marginBottom: 8 }}>
                {seedPaper.title}
              </Typography.Title>
              <Space wrap style={{ marginBottom: 8 }}>
                <Tag icon={<CalendarOutlined />}>{seedPaper.year ?? '未知'}</Tag>
                <Tag icon={<GlobalOutlined />}>引用 {seedPaper.citationCount}</Tag>
              </Space>
              <div style={{ color: 'var(--ink-caption)', fontSize: 13, marginBottom: 8 }}>
                <BookOutlined style={{ marginRight: 6 }} />
                {seedPaper.authors?.map(a => a.name).join(', ') || '未知作者'}
              </div>
              {seedPaper.abstract && (
                <Typography.Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0, color: 'var(--ink-faint)' }}>
                  {seedPaper.abstract}
                </Typography.Paragraph>
              )}
            </Card>
          )}

          <div style={{ display: 'flex', gap: 16 }}>
            <Card title={`参考文献 (${references.length})`} style={{ flex: 1 }}>
              {references.length === 0 ? (
                <Empty description="暂无参考文献数据" />
              ) : (
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {references.map((ref) => {
                    const { score, reason } = getScoreAndReason(ref)
                    const inQueue = isInQueue(ref.paperId)
                    return (
                      <div
                        key={ref.paperId}
                        className="wonder-discovery-item"
                        style={{ marginBottom: 8 }}
                      >
                        <div
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedRef(ref)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="wonder-discovery-item__title" style={{ flex: 1 }}>{ref.title}</div>
                            {discoveryContext && (
                              <div style={{ marginLeft: 8, textAlign: 'right' }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-primary)' }}>{score}</div>
                                <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>优先级</div>
                              </div>
                            )}
                          </div>
                          <div className="wonder-discovery-item__meta">
                            {ref.year ?? '未知'} · 引用 {ref.citationCount}
                            {getCandidateStateTag(ref.paperId)}
                          </div>
                          {discoveryContext && (
                            <div style={{ fontSize: 11, color: 'var(--ink-caption)', marginTop: 2 }}>
                              {reason}
                            </div>
                          )}
                        </div>
                        {discoveryContext && !inQueue && (
                          <Space size={4} style={{ marginTop: 4 }}>
                            <Button
                              type="link"
                              size="small"
                              icon={<SaveOutlined />}
                              onClick={(e) => { e.stopPropagation(); handleSaveCandidate(ref, 'reference') }}
                            >
                              保存
                            </Button>
                            <Button
                              type="link"
                              size="small"
                              icon={<StopOutlined />}
                              onClick={(e) => { e.stopPropagation(); handleIgnoreCandidate(ref, 'reference') }}
                            >
                              忽略
                            </Button>
                          </Space>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            <Card title={`被引用 (${citations.length})`} style={{ flex: 1 }}>
              {citations.length === 0 ? (
                <Empty description="暂无被引数据" />
              ) : (
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {citations.map((cit) => {
                    const { score, reason } = getScoreAndReason(cit)
                    const inQueue = isInQueue(cit.paperId)
                    return (
                      <div
                        key={cit.paperId}
                        className="wonder-discovery-item"
                        style={{ marginBottom: 8 }}
                      >
                        <div
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedRef(cit)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="wonder-discovery-item__title" style={{ flex: 1 }}>{cit.title}</div>
                            {discoveryContext && (
                              <div style={{ marginLeft: 8, textAlign: 'right' }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-primary)' }}>{score}</div>
                                <div style={{ fontSize: 10, color: 'var(--ink-faint)' }}>优先级</div>
                              </div>
                            )}
                          </div>
                          <div className="wonder-discovery-item__meta">
                            {cit.year ?? '未知'} · 引用 {cit.citationCount}
                            {getCandidateStateTag(cit.paperId)}
                          </div>
                          {discoveryContext && (
                            <div style={{ fontSize: 11, color: 'var(--ink-caption)', marginTop: 2 }}>
                              {reason}
                            </div>
                          )}
                        </div>
                        {discoveryContext && !inQueue && (
                          <Space size={4} style={{ marginTop: 4 }}>
                            <Button
                              type="link"
                              size="small"
                              icon={<SaveOutlined />}
                              onClick={(e) => { e.stopPropagation(); handleSaveCandidate(cit, 'citation') }}
                            >
                              保存
                            </Button>
                            <Button
                              type="link"
                              size="small"
                              icon={<StopOutlined />}
                              onClick={(e) => { e.stopPropagation(); handleIgnoreCandidate(cit, 'citation') }}
                            >
                              忽略
                            </Button>
                          </Space>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {selectedRef && (
            <Card
              style={{ marginTop: 16 }}
              title={
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}>
                  选中论文详情
                </span>
              }
              extra={
                <Space>
                  <Button
                    type="primary"
                    size="small"
                    icon={<LinkOutlined />}
                    onClick={() => navigate(`/citation?id=${selectedRef.paperId}`)}
                  >
                    查看引用图谱
                  </Button>
                  {discoveryContext && !isInQueue(selectedRef.paperId) && (
                    <>
                      <Button
                        size="small"
                        icon={<SaveOutlined />}
                        onClick={() => handleSaveCandidate(selectedRef, 'reference')}
                      >
                        保存候选
                      </Button>
                      <Button
                        size="small"
                        icon={<StopOutlined />}
                        onClick={() => handleIgnoreCandidate(selectedRef, 'reference')}
                      >
                        忽略
                      </Button>
                    </>
                  )}
                  <Button size="small" onClick={() => setSelectedRef(null)}>关闭</Button>
                </Space>
              }
            >
              <Typography.Title level={5} style={{ fontFamily: 'var(--font-serif)', marginBottom: 8 }}>
                {selectedRef.title}
              </Typography.Title>
              <Space wrap>
                <Tag icon={<CalendarOutlined />}>{selectedRef.year ?? '未知'}</Tag>
                <Tag icon={<GlobalOutlined />}>引用 {selectedRef.citationCount}</Tag>
                {discoveryContext && (
                  <Tag color="blue">优先级: {getScoreAndReason(selectedRef).score}</Tag>
                )}
                {getCandidateStateTag(selectedRef.paperId)}
              </Space>
              {discoveryContext && (
                <div style={{ marginTop: 8, color: 'var(--ink-caption)', fontSize: 12 }}>
                  {getScoreAndReason(selectedRef).reason}
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
