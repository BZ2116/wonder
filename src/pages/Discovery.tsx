import { useState } from 'react'
import { Card, Typography, Input, Button, Tag, Space, Empty, message } from 'antd'
import { SearchOutlined, LinkOutlined, BookOutlined, CalendarOutlined, GlobalOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { searchPapers } from '../lib/discovery/semantic-scholar'
import type { S2Paper } from '../lib/discovery/types'

export default function Discovery() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<S2Paper[]>([])
  const [selected, setSelected] = useState<S2Paper | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const { papers } = await searchPapers(query, 20)
      setResults(papers)
      setSelected(papers[0] ?? null)
    } catch (e) {
      message.error(`搜索失败: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="wonder-page wonder-discovery-page">
      <div className="wonder-page-header">
        <Typography.Title level={4}>文献发现</Typography.Title>
        <Typography.Text type="secondary">搜索学术论文，发现研究前沿</Typography.Text>
      </div>

      <div className="wonder-discovery-search">
        <Input.Search
          placeholder="搜索论文标题、关键词..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onSearch={handleSearch}
          enterButton={<><SearchOutlined /> 搜索</>}
          loading={loading}
          size="large"
        />
      </div>

      <div className="wonder-discovery-layout">
        <div className="wonder-discovery-sidebar">
          {results.length === 0 && !loading ? (
            <Empty
              description={
                <span style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-serif)' }}>
                  输入关键词开始搜索
                </span>
              }
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 300 }}
            />
          ) : (
            results.map((paper) => (
              <div
                key={paper.paperId}
                className={`wonder-discovery-item ${selected?.paperId === paper.paperId ? 'wonder-discovery-item--selected' : ''}`}
                onClick={() => setSelected(paper)}
              >
                <div className="wonder-discovery-item__title">{paper.title}</div>
                <div className="wonder-discovery-item__meta">
                  <Space size={4}>
                    <CalendarOutlined /> {paper.year ?? '未知'}
                    <span style={{ margin: '0 4px' }}>·</span>
                    引用 {paper.citationCount}
                  </Space>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="wonder-discovery-main">
          {selected ? (
            <Card>
              <Typography.Title level={5} style={{ fontFamily: 'var(--font-serif)', marginBottom: 12 }}>
                {selected.title}
              </Typography.Title>
              <Space wrap style={{ marginBottom: 16 }}>
                <Tag icon={<CalendarOutlined />}>{selected.year ?? '未知'}</Tag>
                <Tag icon={<GlobalOutlined />}>引用 {selected.citationCount}</Tag>
                {selected.influentialCitationCount > 0 && (
                  <Tag color="gold">高影响力 {selected.influentialCitationCount}</Tag>
                )}
              </Space>
              <div style={{ marginBottom: 16, color: 'var(--ink-caption)', fontSize: 13 }}>
                <BookOutlined style={{ marginRight: 6 }} />
                {selected.authors?.map(a => a.name).join(', ') || '未知作者'}
              </div>
              {selected.abstract && (
                <div style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                  marginBottom: 20,
                  fontFamily: 'var(--font-serif)',
                  fontSize: 14,
                  lineHeight: 1.8,
                  color: 'var(--ink-secondary)',
                }}>
                  {selected.abstract}
                </div>
              )}
              <Space>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  onClick={() => navigate(`/citation?id=${selected.paperId}`)}
                >
                  查看引用图谱
                </Button>
                {selected.url && (
                  <Button icon={<GlobalOutlined />} href={selected.url} target="_blank">
                    原文链接
                  </Button>
                )}
              </Space>
            </Card>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--ink-ghost)' }}>
              <Empty description="选择一篇论文查看详情" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
