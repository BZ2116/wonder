import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card, Typography, Spin } from 'antd'
import { api } from '../services/api'

export default function HistoryDetail() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<{ id: string; created_at: string; result: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      api.get<{ id: string; created_at: string; result: string }>(`/api/history/${id}`)
        .then(setData)
        .finally(() => setLoading(false))
    }
  }, [id])

  if (loading) return <Spin />
  if (!data) return <Typography.Text>记录不存在</Typography.Text>

  return (
    <div>
      <Typography.Title level={4}>分析详情</Typography.Title>
      <Card>
        <Typography.Paragraph>时间：{new Date(data.created_at).toLocaleString('zh-CN')}</Typography.Paragraph>
        <Typography.Paragraph>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(JSON.parse(data.result), null, 2)}</pre>
        </Typography.Paragraph>
      </Card>
    </div>
  )
}
