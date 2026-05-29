import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Card, Typography, Spin, List, Tag, Space, Button, message } from 'antd'
import { LinkOutlined } from '@ant-design/icons'
import { buildCitationGraph, type GraphNode, type GraphEdge } from '../lib/discovery/citation-graph'
import { getPaper } from '../lib/discovery/semantic-scholar'
import type { S2Paper } from '../lib/discovery/types'

export default function CitationNetwork() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const paperId = searchParams.get('id')

  const [loading, setLoading] = useState(false)
  const [seedPaper, setSeedPaper] = useState<S2Paper | null>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])

  useEffect(() => {
    if (!paperId) return
    setLoading(true)

    Promise.all([
      getPaper(paperId),
      buildCitationGraph(paperId, 1, 15),
    ])
      .then(([paper, graph]) => {
        setSeedPaper(paper)
        setNodes(graph.nodes)
        setEdges(graph.edges)
      })
      .catch(e => message.error(`加载失败: ${(e as Error).message}`))
      .finally(() => setLoading(false))
  }, [paperId])

  if (!paperId) {
    return <Typography.Text>请从论文搜索页面选择一篇论文查看引用图谱</Typography.Text>
  }

  // Derive reference list from edges (type=references, from=seedPaperId)
  const references = edges
    .filter(e => e.from === paperId && e.type === 'references')
    .map(e => nodes.find(n => n.paperId === e.to))
    .filter(Boolean) as GraphNode[]

  // Derive citation list from edges (type=citations, to=seedPaperId)
  const citations = edges
    .filter(e => e.to === paperId && e.type === 'citations')
    .map(e => nodes.find(n => n.paperId === e.from))
    .filter(Boolean) as GraphNode[]

  return (
    <div>
      <Typography.Title level={4}>引用图谱</Typography.Title>
      {loading ? (
        <Spin size="large" style={{ display: 'block', margin: '48px auto' }} />
      ) : (
        <>
          {seedPaper && (
            <Card style={{ marginBottom: 16 }}>
              <Typography.Title level={5} style={{ marginBottom: 4 }}>{seedPaper.title}</Typography.Title>
              <Space>
                <Tag>{seedPaper.year ?? '未知'}</Tag>
                <Tag>引用 {seedPaper.citationCount}</Tag>
                <span>{seedPaper.authors?.map(a => a.name).join(', ')}</span>
              </Space>
              {seedPaper.abstract && (
                <Typography.Paragraph ellipsis={{ rows: 3 }} style={{ marginTop: 8, marginBottom: 0 }}>
                  {seedPaper.abstract}
                </Typography.Paragraph>
              )}
            </Card>
          )}

          <Card title={`参考文献 (${references.length})`} style={{ marginBottom: 16 }}>
            <List
              dataSource={references}
              renderItem={(ref) => (
                <List.Item
                  actions={[
                    <Button
                      key="cite"
                      icon={<LinkOutlined />}
                      size="small"
                      onClick={() => navigate(`/citation?id=${ref.paperId}`)}
                    >
                      详情
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={ref.title}
                    description={
                      <Space>
                        <Tag>{ref.year ?? '未知'}</Tag>
                        <span>引用 {ref.citationCount}</span>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>

          <Card title={`被引用 (${citations.length})`}>
            <List
              dataSource={citations}
              renderItem={(cit) => (
                <List.Item
                  actions={[
                    <Button
                      key="cite"
                      icon={<LinkOutlined />}
                      size="small"
                      onClick={() => navigate(`/citation?id=${cit.paperId}`)}
                    >
                      详情
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={cit.title}
                    description={
                      <Space>
                        <Tag>{cit.year ?? '未知'}</Tag>
                        <span>引用 {cit.citationCount}</span>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </>
      )}
    </div>
  )
}
