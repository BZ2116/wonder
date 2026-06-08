import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, AutoComplete, Button, message } from 'antd'
import {
  ThunderboltOutlined,
  ApiOutlined,
  UserOutlined,
  BookOutlined,
  KeyOutlined,
  RobotOutlined,
  ExperimentOutlined,
  CheckOutlined,
  PlusOutlined,
  CameraOutlined,
  ArrowRightOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import { useConfigStore } from '../stores/config'
import type { NormalizedAppConfig } from '../types/config'

interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  models: string[]
}

const providers: ProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
  {
    id: 'mimo',
    name: 'Xiaomi MiMo',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    models: ['mimo-v2.5-pro', 'mimo-v2-pro'],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    models: ['MiniMax-M2.7'],
  },
  {
    id: 'zhipu',
    name: 'Zhipu GLM',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    models: ['glm-5'],
  },
]

/* ─── Decorative SVG ─── */
function DecoCorner() {
  return (
    <svg className="welcome-deco" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M160 0 Q200 0 200 40 Q200 80 160 80 Q120 80 120 40 Q120 0 160 0Z" fill="var(--accent)" opacity="0.06"/>
      <circle cx="30" cy="30" r="60" stroke="var(--accent)" strokeWidth="0.75" fill="none" opacity="0.08"/>
      <circle cx="30" cy="30" r="40" stroke="var(--accent)" strokeWidth="0.5" fill="none" opacity="0.06"/>
      <path d="M10 100 Q30 60 60 80 Q90 100 80 130" stroke="var(--border)" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.3"/>
    </svg>
  )
}

export default function Welcome() {
  const navigate = useNavigate()
  const { config, loaded, saveConfig } = useConfigStore()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    provider: '',
    baseUrl: '',
    apiKey: '',
    model: '',
    embeddingProvider: '',
    embeddingBaseUrl: '',
    embeddingApiKey: '',
    embeddingModel: '',
    nickname: '',
    avatar: '',
    globalUserProfile: '',
  })

  // 已有配置则直接进主页
  useEffect(() => {
    if (loaded && config?.chat?.provider && config?.chat?.apiKey && config?.chat?.model) {
      navigate('/', { replace: true })
    }
  }, [loaded, config, navigate])

  const handleProviderChange = (providerId: string, target: 'analysis' | 'embedding') => {
    const provider = providers.find(p => p.id === providerId)
    if (!provider) return
    if (target === 'analysis') {
      setForm(f => ({
        ...f,
        provider: providerId,
        baseUrl: provider.baseUrl,
        model: provider.models[0] || '',
      }))
    } else {
      setForm(f => ({
        ...f,
        embeddingProvider: providerId,
        embeddingBaseUrl: provider.baseUrl,
        embeddingModel: provider.models[0] || '',
      }))
    }
  }

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

  const canProceedStep0 = form.provider && form.apiKey && form.model

  const handleFinish = async () => {
    setSaving(true)
    try {
      const payload: NormalizedAppConfig = {
        chat: {
          provider: (form.provider || 'openai_compatible') as NormalizedAppConfig['chat']['provider'],
          preset: '',
          apiKey: form.apiKey,
          baseUrl: form.baseUrl,
          model: form.model,
          temperature: 0.2,
          maxTokens: 4096,
        },
        embedding: {
          provider: (form.embeddingProvider || 'openai_compatible') as NormalizedAppConfig['embedding']['provider'],
          preset: '',
          apiKey: form.embeddingApiKey || '',
          baseUrl: form.embeddingBaseUrl || '',
          model: form.embeddingModel || '',
          dimensions: 1536,
        },
        knowledge: { enabled: true, autoIndex: true, contextTokenLimit: 8000 },
        research: { globalProfile: form.globalUserProfile || '' },
        nickname: form.nickname || undefined,
        avatar: form.avatar || undefined,
      }
      await saveConfig(payload)
      message.success('配置完成，欢迎使用 Wonder')
      navigate('/', { replace: true })
    } catch {
      message.error('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const renderProviderCard = (provider: ProviderConfig, target: 'analysis' | 'embedding') => {
    const currentId = target === 'analysis' ? form.provider : form.embeddingProvider
    const isActive = currentId === provider.id
    return (
      <button
        key={provider.id}
        className={`wp-provider-card ${isActive ? 'wp-provider-card--active' : ''}`}
        onClick={() => handleProviderChange(provider.id, target)}
      >
        <span className="wp-provider-name">{provider.name}</span>
        {isActive && <CheckOutlined className="wp-provider-check" />}
      </button>
    )
  }

  const renderStep0 = () => (
    <div className="wp-step-content">
      <div className="wp-field-group">
        <label className="wp-field-label">
          <RobotOutlined /> 分析模型
        </label>
        <div className="wp-provider-grid">
          {providers.map(p => renderProviderCard(p, 'analysis'))}
          <button
            className={`wp-provider-card ${form.provider === 'custom' ? 'wp-provider-card--active' : ''}`}
            onClick={() => setForm(f => ({ ...f, provider: 'custom', model: '' }))}
          >
            <span className="wp-provider-name"><PlusOutlined /> 自定义</span>
            {form.provider === 'custom' && <CheckOutlined className="wp-provider-check" />}
          </button>
        </div>

        {form.provider && (
          <div className="wp-fields">
            <div className="wp-field">
              <span className="wp-field-hint">API Base URL</span>
              <Input
                placeholder="https://api.example.com/anthropic"
                value={form.baseUrl}
                onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
              />
            </div>
            <div className="wp-field">
              <span className="wp-field-hint"><KeyOutlined /> API Key</span>
              <Input.Password
                placeholder="输入 API Key"
                value={form.apiKey}
                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              />
            </div>
            <div className="wp-field">
              <span className="wp-field-hint">模型名称</span>
              {form.provider === 'custom' ? (
                <Input placeholder="输入模型名称" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              ) : (
                <AutoComplete
                  style={{ width: '100%' }}
                  placeholder="选择或输入模型名称"
                  value={form.model || undefined}
                  onChange={value => setForm(f => ({ ...f, model: value }))}
                  options={providers.find(p => p.id === form.provider)?.models.map(m => ({ label: m, value: m }))}
                  allowClear
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="wp-divider" />

      <div className="wp-field-group">
        <label className="wp-field-label">
          <ExperimentOutlined /> Embedding 模型
          <span className="wp-field-label-hint">可选，留空则复用分析模型</span>
        </label>
        <div className="wp-provider-grid">
          {providers.map(p => renderProviderCard(p, 'embedding'))}
          <button
            className={`wp-provider-card ${form.embeddingProvider === 'custom' ? 'wp-provider-card--active' : ''}`}
            onClick={() => setForm(f => ({ ...f, embeddingProvider: 'custom', embeddingModel: '' }))}
          >
            <span className="wp-provider-name"><PlusOutlined /> 自定义</span>
            {form.embeddingProvider === 'custom' && <CheckOutlined className="wp-provider-check" />}
          </button>
        </div>

        {form.embeddingProvider && (
          <div className="wp-fields">
            <div className="wp-field">
              <span className="wp-field-hint">API Base URL</span>
              <Input placeholder="https://api.example.com/anthropic" value={form.embeddingBaseUrl} onChange={e => setForm(f => ({ ...f, embeddingBaseUrl: e.target.value }))} />
            </div>
            <div className="wp-field">
              <span className="wp-field-hint">
                <KeyOutlined /> API Key
                {form.apiKey && <span style={{ fontWeight: 'normal', marginLeft: 6 }}>(留空则复用)</span>}
              </span>
              <Input.Password placeholder="输入 API Key" value={form.embeddingApiKey} onChange={e => setForm(f => ({ ...f, embeddingApiKey: e.target.value }))} />
            </div>
            <div className="wp-field">
              <span className="wp-field-hint">模型名称</span>
              {form.embeddingProvider === 'custom' ? (
                <Input placeholder="输入模型名称" value={form.embeddingModel} onChange={e => setForm(f => ({ ...f, embeddingModel: e.target.value }))} />
              ) : (
                <AutoComplete
                  style={{ width: '100%' }}
                  placeholder="选择或输入模型名称"
                  value={form.embeddingModel || undefined}
                  onChange={value => setForm(f => ({ ...f, embeddingModel: value }))}
                  options={providers.find(p => p.id === form.embeddingProvider)?.models.map(m => ({ label: m, value: m }))}
                  allowClear
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div className="wp-step-content">
      <div className="wp-avatar-center">
        <div className="wp-avatar" onClick={() => fileInputRef.current?.click()}>
          {form.avatar ? (
            <img src={form.avatar} alt="头像" />
          ) : (
            <CameraOutlined style={{ fontSize: 26, color: 'var(--ink-ghost)' }} />
          )}
          <div className="wp-avatar-overlay">
            <CameraOutlined style={{ fontSize: 13, color: '#fff' }} />
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
        </div>
        <span className="wp-avatar-hint">点击上传头像</span>
      </div>

      <div className="wp-fields" style={{ marginTop: 20 }}>
        <div className="wp-field">
          <span className="wp-field-hint">昵称</span>
          <Input placeholder="你希望 AI 怎么称呼你" value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} maxLength={20} showCount />
        </div>
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="wp-step-content">
      <div className="wp-profile-template">
        <span className="wp-profile-tag">全局画像</span>
        <p className="wp-profile-hint">描述你的专业、研究阶段、长期兴趣、偏好方法等，AI 会据此调整回答风格</p>
      </div>
      <div className="wp-fields" style={{ marginTop: 8 }}>
        <div className="wp-field">
          <Input.TextArea
            rows={9}
            placeholder={`例如：
- 专业：计算机科学，研二
- 研究方向：大语言模型在教育领域的应用
- 偏好方法：混合研究方法，注重实证
- 写作风格：学术正式，偏好结构化表达
- 分析偏好：关注方法论创新和实际应用价值`}
            value={form.globalUserProfile}
            onChange={e => setForm(f => ({ ...f, globalUserProfile: e.target.value }))}
            style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 13 }}
          />
        </div>
      </div>
    </div>
  )

  const stepLabels = ['API 配置', '个人信息', '研究方向']
  const stepIcons = [<ApiOutlined />, <UserOutlined />, <BookOutlined />]

  return (
    <div className="wp-root">
      <DecoCorner />

      <div className="wp-container">
        {/* Header */}
        <div className="wp-header">
          <div className="wp-logo">
            <ThunderboltOutlined />
          </div>
          <h1 className="wp-title">欢迎使用 Wonder</h1>
          <p className="wp-subtitle">完成以下配置，开始你的学术研究之旅</p>
        </div>

        {/* Step indicator */}
        <div className="wp-steps">
          {stepLabels.map((label, i) => (
            <div key={i} className="wp-step-item">
              <div className={`wp-step-dot ${i === step ? 'wp-step-dot--active' : i < step ? 'wp-step-dot--done' : ''}`}>
                {i < step ? <CheckOutlined /> : stepIcons[i]}
              </div>
              <span className={`wp-step-label ${i === step ? 'wp-step-label--active' : i < step ? 'wp-step-label--done' : ''}`}>{label}</span>
              {i < stepLabels.length - 1 && (
                <div className={`wp-step-line ${i < step ? 'wp-step-line--done' : ''}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="wp-card">
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
        </div>

        {/* Nav */}
        <div className="wp-nav">
          <button
            className="wp-btn wp-btn--back"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
          >
            <ArrowLeftOutlined /> 上一步
          </button>
          {step < 2 ? (
            <button
              className="wp-btn wp-btn--primary"
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 && !canProceedStep0}
            >
              下一步 <ArrowRightOutlined />
            </button>
          ) : (
            <button className="wp-btn wp-btn--primary" onClick={handleFinish} disabled={saving}>
              {saving ? '保存中…' : '完成配置'}
            </button>
          )}
        </div>

        {/* Skip */}
        <div className="wp-skip">
          {step === 1 && <button className="wp-skip-btn" onClick={() => setStep(2)}>跳过此步</button>}
          {step === 2 && <button className="wp-skip-btn" onClick={handleFinish} disabled={saving}>跳过，直接完成</button>}
        </div>
      </div>
    </div>
  )
}