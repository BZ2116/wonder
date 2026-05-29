import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Typography, List } from 'antd'
import { useHistoryStore } from '../stores/history'

export default function History() {
  const navigate = useNavigate()
  const { items, loading, loadHistory } = useHistoryStore()

  useEffect(() => { loadHistory() }, [loadHistory])

  return (
    <div>
      <Typography.Title level={4}>历史记录</Typography.Title>
      <Card>
        <List
          loading={loading}
          dataSource={items as { id: string; created_at: string; result: string }[]}
          renderItem={(item) => (
            <List.Item onClick={() => navigate(`/history/${item.id}`)} style={{ cursor: 'pointer' }}>
              <List.Item.Meta
                title={`分析记录 ${item.id.slice(0, 8)}`}
                description={new Date(item.created_at).toLocaleString('zh-CN')}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  )
}
