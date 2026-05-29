import { useState } from 'react'
import { Card, Typography, Input, List, Tag, Button, Space, message } from 'antd'
import { SearchOutlined, LinkOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { searchPapers } from '../lib/discovery/semantic-scholar'
import type { S2Paper } from '../lib/discovery/types'

export default function Discovery() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<S2Paper[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const { papers } = await searchPapers(query, 20)
      setResults(papers)
    } catch (e) {
      message.error(`搜索失败: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Typography.Title level={4}>论文搜索</Typography.Title>
      <Card>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="搜索论文..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onPressEnter={handleSearch}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading} />
        </Space.Compact>
      </Card>
      <Card style={{ marginTop: 16 }}>
        <List
          dataSource={results}
          renderItem={(paper) => (
            <List.Item
              actions={[
                <Button
                  key="cite"
                  icon={<LinkOutlined />}
                  size="small"
                  onClick={() => navigate(`/citation?id=${paper.paperId}`)}
                >
                  引用图谱
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={paper.title}
                description={
                  <Space>
                    <Tag>{paper.year ?? '未知'}</Tag>
                    <Tag>引用 {paper.citationCount}</Tag>
                    <span>{paper.authors?.map(a => a.name).join(', ')}</span>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  )
}
