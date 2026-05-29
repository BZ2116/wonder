import { useEffect, useState } from 'react'
import { Card, Input, Button, Typography, Space, message, Divider } from 'antd'
import { useConfigStore } from '../stores/config'
import type { AppConfig } from '../lib/llm/types'

export default function Settings() {
  const { config, loadConfig, saveConfig } = useConfigStore()
  const [form, setForm] = useState({
    provider: 'openai-compatible' as string,
    baseUrl: '',
    apiKey: '',
    model: '',
    embeddingModel: '',
    researchBackground: '',
  })

  useEffect(() => { loadConfig() }, [loadConfig])

  useEffect(() => {
    if (config) {
      setForm({
        provider: config.provider,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        embeddingModel: config.embeddingModel || '',
        researchBackground: '',
      })
    }
  }, [config])

  const handleSave = async () => {
    await saveConfig(form as AppConfig)
    message.success('设置已保存')
  }

  return (
    <div>
      <Typography.Title level={4}>设置</Typography.Title>
      <Card>
        <Typography.Title level={5}>LLM 配置</Typography.Title>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input placeholder="API Base URL" value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))} />
          <Input.Password placeholder="API Key" value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))} />
          <Input placeholder="Model" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
          <Input placeholder="Embedding Model" value={form.embeddingModel} onChange={e => setForm(f => ({ ...f, embeddingModel: e.target.value }))} />
        </Space>
        <Divider />
        <Typography.Title level={5}>研究背景</Typography.Title>
        <Input.TextArea rows={4} placeholder="描述你的研究方向和兴趣..." value={form.researchBackground} onChange={e => setForm(f => ({ ...f, researchBackground: e.target.value }))} />
        <Divider />
        <Button type="primary" onClick={handleSave}>保存设置</Button>
      </Card>
    </div>
  )
}
