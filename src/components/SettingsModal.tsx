import { useEffect, useRef, useState } from 'react'
import { Input, Button, message, Avatar, Tag, Select, Typography } from 'antd'
import {
  ApiOutlined,
  KeyOutlined,
  RobotOutlined,
  ExperimentOutlined,
  UserOutlined,
  FileTextOutlined,
  SyncOutlined,
  CloseOutlined,
  BookOutlined,
  CheckOutlined,
  PlusOutlined,
  CameraOutlined,
} from '@ant-design/icons'
import { useConfigStore } from '../stores/config'
import { useUIStore } from '../stores/ui'
import type { NormalizedAppConfig, ChatProvider, EmbeddingProvider } from '../types/config'

type SettingsTab = 'api' | 'research' | 'update' | 'profile'

interface ProviderPreset {
  id: string
  name: string
  provider: ChatProvider | EmbeddingProvider
  baseUrl: string
  chatModels: string[]
  embeddingModels: string[]
}

const providerPresets: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    provider: 'openai_compatible',
    baseUrl: 'https://api.openai.com/v1',
    chatModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    embeddingModels: ['text-embedding-3-small', 'text-embedding-3-large'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    chatModels: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
    embeddingModels: [],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'openai_compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    chatModels: ['deepseek-chat', 'deepseek-reasoner'],
    embeddingModels: [],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    provider: 'minimax',
    baseUrl: 'https://api.minimaxi.com/v1',
    chatModels: ['MiniMax-M2.7'],
    embeddingModels: ['text-embedding-003'],
  },
]

const tabs: { key: SettingsTab; icon: React.ReactNode; label: string }[] = [
  { key: 'api', icon: <ApiOutlined />, label: 'API 设置' },
  { key: 'research', icon: <BookOutlined />, label: '研究背景' },
  { key: 'update', icon: <SyncOutlined />, label: '查看更新' },
  { key: 'profile', icon: <UserOutlined />, label: '我' },
]

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { config, loadConfig, saveConfig } = useConfigStore()
  const { settingsTarget } = useUIStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('api')
  const analysisRef = useRef<HTMLDivElement>(null)
  const embeddingRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    chatPreset: '',
    chatProvider: '' as ChatProvider | '',
    chatBaseUrl: '',
    chatApiKey: '',
    chatModel: '',
    embeddingPreset: '',
    embeddingProvider: '' as EmbeddingProvider | '',
    embeddingBaseUrl: '',
    embeddingApiKey: '',
    embeddingModel: '',
    researchBackground: '',
    globalUserProfile: '',
    nickname: '',
    avatar: '',
  })

  useEffect(() => { loadConfig() }, [loadConfig])

  useEffect(() => {
    if (open) {
      setActiveTab('api')
      setTimeout(() => {
        const ref = settingsTarget === 'embedding' ? embeddingRef.current : analysisRef.current
        ref?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [open, settingsTarget])

  useEffect(() => {
    if (config) {
      setForm({
        chatPreset: config.chat.preset || '',
        chatProvider: config.chat.provider || '',
        chatBaseUrl: config.chat.baseUrl || '',
        chatApiKey: config.chat.apiKey || '',
        chatModel: config.chat.model || '',
        embeddingPreset: config.embedding.preset || '',
        embeddingProvider: config.embedding.provider || '',
        embeddingBaseUrl: config.embedding.baseUrl || '',
        embeddingApiKey: config.embedding.apiKey || '',
        embeddingModel: config.embedding.model || '',
        researchBackground: '',
        globalUserProfile: config.research.globalProfile || '',
        nickname: config.nickname || '',
        avatar: config.avatar || '',
      })
    }
  }, [config])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      message.error('头像大小不能超过 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setForm(f => ({ ...f, avatar: reader.result as string }))
    }
    reader.readAsDataURL(file)
  }

  const handleProviderChange = (presetId: string, target: 'analysis' | 'embedding') => {
    const preset = providerPresets.find(p => p.id === presetId)
    if (!preset) return

    if (target === 'analysis') {
      setForm(f => ({
        ...f,
        chatPreset: presetId,
        chatProvider: preset.provider as ChatProvider,
        chatBaseUrl: preset.baseUrl,
        chatModel: preset.chatModels[0] || '',
      }))
    } else {
      setForm(f => ({
        ...f,
        embeddingPreset: presetId,
        embeddingProvider: preset.provider as EmbeddingProvider,
        embeddingBaseUrl: preset.baseUrl,
        embeddingModel: preset.embeddingModels[0] || '',
      }))
    }
  }

  const handleCustomProvider = (target: 'analysis' | 'embedding') => {
    if (target === 'analysis') {
      setForm(f => ({ ...f, chatPreset: 'custom', chatProvider: 'custom_openai_compatible', chatModel: '' }))
    } else {
      setForm(f => ({ ...f, embeddingPreset: 'custom', embeddingProvider: 'custom_openai_compatible', embeddingModel: '' }))
    }
  }

  const handleSave = async () => {
    const payload: NormalizedAppConfig = {
      chat: {
        provider: (form.chatProvider || 'openai_compatible') as ChatProvider,
        preset: form.chatPreset || '',
        apiKey: form.chatApiKey,
        baseUrl: form.chatBaseUrl,
        model: form.chatModel,
        temperature: config?.chat.temperature ?? 0.2,
        maxTokens: config?.chat.maxTokens ?? 4096,
      },
      embedding: {
        provider: (form.embeddingProvider || 'openai_compatible') as EmbeddingProvider,
        preset: form.embeddingPreset || '',
        apiKey: form.embeddingApiKey,
        baseUrl: form.embeddingBaseUrl,
        model: form.embeddingModel,
        dimensions: config?.embedding.dimensions ?? 1536,
      },
      knowledge: config?.knowledge ?? { enabled: true, autoIndex: true, contextTokenLimit: 8000 },
      research: { globalProfile: form.globalUserProfile },
      nickname: form.nickname || undefined,
      avatar: form.avatar || undefined,
    }
    await saveConfig(payload)
    message.success('设置已保存')
  }

  const renderProviderSection = (
    target: 'analysis' | 'embedding',
    title: string,
    icon: React.ReactNode,
    presetId: string,
    baseUrl: string,
    apiKey: string,
    model: string,
  ) => {
    const currentPreset = providerPresets.find(p => p.id === presetId)
    const isCustom = presetId === 'custom'
    const models = target === 'analysis'
      ? (currentPreset?.chatModels || [])
      : (currentPreset?.embeddingModels || [])

    return (
      <div className="wonder-settings-field">
        <label className="wonder-settings-label">
          {icon} {title}
        </label>

        {/* 服务商选择 */}
        <div className="wonder-provider-grid" style={{ marginBottom: 12 }}>
          {providerPresets.map(preset => (
            <button
              key={preset.id}
              className={`wonder-provider-card ${presetId === preset.id ? 'wonder-provider-card--active' : ''}`}
              onClick={() => handleProviderChange(preset.id, target)}
            >
              <span className="wonder-provider-name">{preset.name}</span>
              {presetId === preset.id && (
                <CheckOutlined className="wonder-provider-check" />
              )}
            </button>
          ))}
          <button
            className={`wonder-provider-card ${isCustom ? 'wonder-provider-card--active' : ''}`}
            onClick={() => handleCustomProvider(target)}
          >
            <span className="wonder-provider-name"><PlusOutlined /> 自定义</span>
            {isCustom && (
              <CheckOutlined className="wonder-provider-check" />
            )}
          </button>
        </div>

        {/* 配置详情 */}
        {(presetId || isCustom) && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Typography.Text style={{ display: 'block', marginBottom: 4, color: 'var(--ink-caption)', fontSize: 12 }}>
                API Base URL
              </Typography.Text>
              <Input
                placeholder="https://api.example.com/v1"
                value={baseUrl}
                onChange={e => {
                  if (target === 'analysis') {
                    setForm(f => ({ ...f, chatBaseUrl: e.target.value }))
                  } else {
                    setForm(f => ({ ...f, embeddingBaseUrl: e.target.value }))
                  }
                }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <Typography.Text style={{ display: 'block', marginBottom: 4, color: 'var(--ink-caption)', fontSize: 12 }}>
                <KeyOutlined /> API Key
                {target === 'embedding' && form.chatApiKey && (
                  <span style={{ marginLeft: 8, color: 'var(--ink-muted)', fontSize: 11 }}>
                    (留空则复用分析模型的 Key)
                  </span>
                )}
              </Typography.Text>
              <Input.Password
                placeholder={`输入 API Key`}
                value={apiKey}
                onChange={e => {
                  if (target === 'analysis') {
                    setForm(f => ({ ...f, chatApiKey: e.target.value }))
                  } else {
                    setForm(f => ({ ...f, embeddingApiKey: e.target.value }))
                  }
                }}
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <Typography.Text style={{ display: 'block', marginBottom: 4, color: 'var(--ink-caption)', fontSize: 12 }}>
                模型名称
              </Typography.Text>
              {isCustom ? (
                <Input
                  placeholder="输入模型名称"
                  value={model}
                  onChange={e => {
                    if (target === 'analysis') {
                      setForm(f => ({ ...f, chatModel: e.target.value }))
                    } else {
                      setForm(f => ({ ...f, embeddingModel: e.target.value }))
                    }
                  }}
                />
              ) : (
                <Select
                  style={{ width: '100%' }}
                  placeholder="选择模型"
                  value={model || undefined}
                  onChange={value => {
                    if (target === 'analysis') {
                      setForm(f => ({ ...f, chatModel: value }))
                    } else {
                      setForm(f => ({ ...f, embeddingModel: value }))
                    }
                  }}
                  options={models.map(m => ({ label: m, value: m }))}
                  showSearch
                />
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  if (!open) return null

  return (
    <div className="wonder-settings-overlay" onClick={onClose}>
      <div className="wonder-settings-modal" onClick={e => e.stopPropagation()}>
        {/* 左侧导航 */}
        <nav className="wonder-settings-nav">
          <div className="wonder-settings-nav-header">
            <span className="wonder-settings-nav-title">设置</span>
            <button className="wonder-settings-close" onClick={onClose}>
              <CloseOutlined />
            </button>
          </div>

          <div className="wonder-settings-nav-items">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={`wonder-settings-nav-item ${activeTab === tab.key ? 'wonder-settings-nav-item--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="wonder-settings-nav-icon">{tab.icon}</span>
                <span className="wonder-settings-nav-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* 右侧内容 */}
        <main className="wonder-settings-content">
          {activeTab === 'api' && (
            <div className="wonder-settings-pane">
              <h2 className="wonder-settings-pane-title">
                <ApiOutlined /> LLM 配置
              </h2>
              <p className="wonder-settings-pane-desc">分别配置分析模型和 Embedding 模型</p>

              {/* 分析模型配置 */}
              <div ref={analysisRef}>
                {renderProviderSection(
                  'analysis',
                  '分析模型',
                  <RobotOutlined />,
                  form.chatPreset,
                  form.chatBaseUrl,
                  form.chatApiKey,
                  form.chatModel,
                )}
              </div>

              {/* 分隔线 */}
              <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0' }} />

              {/* Embedding 模型配置 */}
              <div ref={embeddingRef}>
                {renderProviderSection(
                  'embedding',
                  'Embedding 模型',
                  <ExperimentOutlined />,
                  form.embeddingPreset,
                  form.embeddingBaseUrl,
                  form.embeddingApiKey || '',
                  form.embeddingModel,
                )}
              </div>

              <Button type="primary" onClick={handleSave} style={{ marginTop: 16 }}>
                保存 API 设置
              </Button>
            </div>
          )}

          {activeTab === 'research' && (
            <div className="wonder-settings-pane">
              <h2 className="wonder-settings-pane-title">
                <BookOutlined /> 研究背景
              </h2>
              <p className="wonder-settings-pane-desc">
                全局研究背景会在所有知识库的分析中生效
              </p>

              <div className="wonder-settings-field">
                <label className="wonder-settings-label">
                  <UserOutlined /> 全局用户画像
                </label>
                <Typography.Text style={{ display: 'block', marginBottom: 8, color: 'var(--ink-caption)', fontSize: 12 }}>
                  描述你的专业、研究阶段、长期兴趣、偏好方法、写作风格等，所有知识库共享此上下文
                </Typography.Text>
                <Input.TextArea
                  rows={8}
                  placeholder={`例如：
- 专业：计算机科学，研二
- 研究方向：大语言模型在教育领域的应用
- 偏好方法：混合研究方法，注重实证
- 写作风格：学术正式，偏好结构化表达
- 分析偏好：关注方法论创新和实际应用价值
- 约束：避免泛泛而谈，标记不确定的结论`}
                  value={form.globalUserProfile}
                  onChange={e => setForm(f => ({ ...f, globalUserProfile: e.target.value }))}
                  style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 13 }}
                />
              </div>

              <div className="wonder-settings-field" style={{ marginTop: 16 }}>
                <label className="wonder-settings-label">
                  <FileTextOutlined /> 研究方向描述
                </label>
                <Input.TextArea
                  rows={4}
                  placeholder="简要描述你的研究方向和兴趣..."
                  value={form.researchBackground}
                  onChange={e => setForm(f => ({ ...f, researchBackground: e.target.value }))}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <Button type="primary" onClick={handleSave} style={{ marginTop: 8 }}>
                保存研究背景
              </Button>
            </div>
          )}

          {activeTab === 'update' && (
            <div className="wonder-settings-pane">
              <h2 className="wonder-settings-pane-title">
                <SyncOutlined /> 查看更新
              </h2>
              <p className="wonder-settings-pane-desc">了解 Wonder 的最新功能和改进</p>

              <div className="wonder-settings-update-card">
                <div className="wonder-settings-update-header">
                  <Tag color="green">最新版本</Tag>
                  <span className="wonder-settings-update-version">v1.0.0</span>
                  <span className="wonder-settings-update-date">2026-05-29</span>
                </div>
                <ul className="wonder-settings-update-list">
                  <li>单篇论文深度分析</li>
                  <li>批量矩阵对比</li>
                  <li>文献发现与引用网络</li>
                  <li>追溯问答系统</li>
                  <li>知识库管理</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="wonder-settings-pane">
              <h2 className="wonder-settings-pane-title">
                <UserOutlined /> 我的资料
              </h2>
              <p className="wonder-settings-pane-desc">管理你的个人信息，AI 在对话中会用昵称称呼你</p>

              <div className="wonder-settings-profile">
                <div
                  className="wonder-settings-avatar"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {form.avatar ? (
                    <img src={form.avatar} alt="头像" />
                  ) : (
                    <CameraOutlined style={{ fontSize: 24, color: 'var(--ink-ghost)' }} />
                  )}
                  <div className="wonder-settings-avatar-overlay">
                    <CameraOutlined style={{ fontSize: 14, color: '#fff' }} />
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleAvatarChange}
                  />
                </div>
                <div className="wonder-settings-profile-info">
                  <span className="wonder-settings-profile-name">
                    {form.nickname || 'Wonder 用户'}
                  </span>
                  <span className="wonder-settings-profile-email">
                    {form.nickname ? '点击头像更换照片' : '设置昵称后 AI 会这样称呼你'}
                  </span>
                </div>
              </div>

              <div className="wonder-settings-field" style={{ marginTop: 20 }}>
                <label className="wonder-settings-label">
                  <UserOutlined /> 昵称
                </label>
                <Input
                  placeholder="你希望 AI 怎么称呼你"
                  value={form.nickname}
                  onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
                  maxLength={20}
                  showCount
                />
              </div>

              <Button type="primary" onClick={handleSave} style={{ marginTop: 8 }}>
                保存个人资料
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
