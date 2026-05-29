import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Input, Button, Typography, Space, message } from 'antd'
import { useConfigStore } from '../stores/config'
import type { AppConfig } from '../lib/llm/types'

export default function Welcome() {
  const navigate = useNavigate()
  const { saveConfig } = useConfigStore()
  const [form, setForm] = useState({
    provider: 'openai-compatible' as const,
    baseUrl: 'https://api.minimaxi.com/v1',
    apiKey: '',
    model: 'MiniMax-M2.7',
  })

  const handleSave = async () => {
    const config: AppConfig = {
      provider: form.provider,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      model: form.model,
      embeddingModel: 'text-embedding-3-small',
    }
    await saveConfig(config)
    message.success('配置已保存')
    navigate('/')
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Card style={{ width: 500 }}>
        <Typography.Title level={3}>欢迎使用 Wonder</Typography.Title>
        <Typography.Paragraph>请先配置 LLM API 密钥</Typography.Paragraph>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input placeholder="API Base URL" value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))} />
          <Input.Password placeholder="API Key" value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))} />
          <Input placeholder="Model" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
          <Button type="primary" block onClick={handleSave} disabled={!form.apiKey}>开始使用</Button>
        </Space>
      </Card>
    </div>
  )
}
