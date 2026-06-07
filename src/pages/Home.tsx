import { useEffect, useState, useMemo } from 'react'
import { Typography, Button, Empty, Spin, Modal, Form, Input, message } from 'antd'
import {
  PlusOutlined, BookOutlined, SearchOutlined, ExperimentOutlined,
  EditOutlined, UploadOutlined, ClockCircleOutlined,
  FileTextOutlined, SettingOutlined, FolderOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useKnowledgeStore } from '../stores/knowledge'
import { useHistoryStore } from '../stores/history'
import ApiGuard from '../components/ApiGuard'
import type { KnowledgeBase } from '../types/analysis'

function parseReadmeSections(readme: string): { topic: string; scope: string; questions: string } {
  if (!readme) return { topic: '', scope: '', questions: '' }
  const getSection = (header: string): string => {
    const regex = new RegExp(`## ${header}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`)
    const match = readme.match(regex)
    return match ? match[1].trim() : ''
  }
  return {
    topic: getSection('主题'),
    scope: getSection('收录范围'),
    questions: getSection('当前问题') || getSection('当前关注问题'),
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function readmeStatus(readme: string): { label: string; complete: boolean } {
  if (!readme) return { label: 'README 待创建', complete: false }
  const sections = parseReadmeSections(readme)
  const filled = [sections.topic, sections.scope, sections.questions].filter(Boolean).length
  if (filled >= 2) return { label: 'README 已完善', complete: true }
  if (filled >= 1) return { label: 'README 待补充', complete: false }
  return { label: 'README 待完善', complete: false }
}

export default function Home() {
  const navigate = useNavigate()
  const {
    knowledgeBases, kbLoading, loadKnowledgeBases,
    createKnowledgeBase, selectKB: storeSelectKB,
  } = useKnowledgeStore()
  const { items: historyItems, loading: historyLoading, loadHistory } = useHistoryStore()

  const [selectedKBId, setSelectedKBId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    loadKnowledgeBases()
    loadHistory()
  }, [loadKnowledgeBases, loadHistory])

  // Auto-select first KB if none selected
  useEffect(() => {
    if (!selectedKBId && knowledgeBases.length > 0) {
      setSelectedKBId(knowledgeBases[0].id)
    }
  }, [knowledgeBases, selectedKBId])

  const selectedKB = useMemo(
    () => knowledgeBases.find(kb => kb.id === selectedKBId) ?? null,
    [knowledgeBases, selectedKBId],
  )

  const recentActivity = useMemo(() => {
    return (historyItems as { id: string; document_id?: string; created_at: string; result: string }[])
      .slice(0, 5)
      .map(item => {
        let title = '文档分析'
        try {
          const parsed = JSON.parse(item.result)
          title = parsed.summary?.slice(0, 40) || '文档分析完成'
        } catch { /* ignore */ }
        return { id: item.id, title, time: timeAgo(item.created_at) }
      })
  }, [historyItems])

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      const kb = await createKnowledgeBase(values.name, values.description, values.readme)
      setCreateOpen(false)
      form.resetFields()
      setSelectedKBId(kb.id)
      message.success('知识库创建成功')
    } catch { /* validation error */ }
  }

  const handleQuickAction = (action: string) => {
    if (!selectedKBId) {
      message.info('请先选择一个知识库')
      return
    }
    storeSelectKB(selectedKBId)
    switch (action) {
      case 'upload':
        navigate(`/analysis?kb=${selectedKBId}`)
        break
      case 'discovery':
        navigate('/discovery')
        break
      case 'qa':
        navigate('/qa')
        break
      case 'readme':
        navigate('/knowledge')
        break
    }
  }

  return (
    <ApiGuard require="analysis">
      <div className="wonder-page wonder-stagger">
        {/* Header */}
        <div className="wonder-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Typography.Title level={4} style={{ marginBottom: 4 }}>我的知识库</Typography.Title>
            <Typography.Text type="secondary">先选择研究方向，再进行文献分析、发现与问答</Typography.Text>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建知识库
            </Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={() => handleQuickAction('upload')}
            >
              导入文献
            </Button>
          </div>
        </div>

        {kbLoading ? (
          <div className="wonder-loading-center">
            <Spin />
          </div>
        ) : knowledgeBases.length === 0 ? (
          <div className="kb-hub-empty">
            <div className="kb-hub-empty-icon">
              <FolderOutlined />
            </div>
            <Typography.Title level={5} style={{ color: 'var(--ink-caption)', marginBottom: 8 }}>
              还没有知识库
            </Typography.Title>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
              创建一个知识库，开始按研究方向管理你的文献
            </Typography.Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建知识库
            </Button>
          </div>
        ) : (
          <div className="kb-hub-layout">
            {/* Left: KB list + recent activity */}
            <div className="kb-hub-left">
              <div className="kb-hub-section-label">知识库文件夹</div>
              <div className="kb-hub-card-list">
                {knowledgeBases.map((kb, index) => (
                  <KBCard
                    key={kb.id}
                    kb={kb}
                    selected={kb.id === selectedKBId}
                    onClick={() => setSelectedKBId(kb.id)}
                    index={index}
                  />
                ))}
              </div>

              {/* Recent activity */}
              {recentActivity.length > 0 && (
                <div className="kb-hub-activity">
                  <div className="kb-hub-activity-header">
                    <ClockCircleOutlined style={{ fontSize: 13, color: 'var(--ink-faint)' }} />
                    <span>最近活动</span>
                  </div>
                  <div className="kb-hub-activity-list">
                    {recentActivity.map(item => (
                      <div
                        key={item.id}
                        className="kb-hub-activity-item"
                        onClick={() => navigate(`/history/${item.id}`)}
                      >
                        <FileTextOutlined style={{ fontSize: 12, color: 'var(--ink-ghost)', flexShrink: 0 }} />
                        <span className="kb-hub-activity-title">{item.title}</span>
                        <span className="kb-hub-activity-time">{item.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: KB overview */}
            <div className="kb-hub-right">
              {selectedKB ? (
                <KBOverview
                  kb={selectedKB}
                  onAction={handleQuickAction}
                />
              ) : (
                <div className="kb-hub-overview-empty">
                  <Empty
                    description={
                      <span style={{ color: 'var(--ink-faint)', fontSize: 13 }}>
                        选择一个知识库查看详情
                      </span>
                    }
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Create KB Modal */}
        <Modal
          title="新建知识库"
          open={createOpen}
          onOk={handleCreate}
          onCancel={() => setCreateOpen(false)}
          okText="创建"
          cancelText="取消"
        >
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入知识库名称' }]}>
              <Input placeholder="例如：大语言模型在教育中的应用" />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea rows={2} placeholder="简要描述这个知识库的主题和用途" />
            </Form.Item>
            <Form.Item name="readme" label="README" initialValue={`# 知识库 README\n\n## 主题\n\n## 收录范围\n\n## 排除范围\n\n## 核心关键词\n\n## 子方向\n\n## 当前问题\n\n## 阅读与分析偏好\n`}>
              <Input.TextArea rows={10} style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </ApiGuard>
  )
}

/* ─── KB Card ─── */

function KBCard({ kb, selected, onClick, index }: {
  kb: KnowledgeBase
  selected: boolean
  onClick: () => void
  index: number
}) {
  const status = readmeStatus(kb.readme)
  const tags = kb.tags ?? []

  return (
    <div
      className={`kb-card ${selected ? 'kb-card--selected' : ''}`}
      onClick={onClick}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="kb-card-icon">
        <BookOutlined />
      </div>
      <div className="kb-card-body">
        <div className="kb-card-name">{kb.name}</div>
        <div className="kb-card-meta">
          <span className="kb-card-count">{kb.documentCount ?? 0} 篇文献</span>
          <span className={`kb-card-status ${status.complete ? 'kb-card-status--complete' : ''}`}>
            {status.label}
          </span>
        </div>
        {tags.length > 0 && (
          <div className="kb-card-tags">
            {tags.slice(0, 4).map(tag => (
              <span key={tag} className="kb-card-tag">{tag}</span>
            ))}
            {tags.length > 4 && <span className="kb-card-tag kb-card-tag--more">+{tags.length - 4}</span>}
          </div>
        )}
      </div>
      <div className="kb-card-time">
        {timeAgo(kb.updated_at)}
      </div>
    </div>
  )
}

/* ─── KB Overview ─── */

function KBOverview({ kb, onAction }: {
  kb: KnowledgeBase
  onAction: (action: string) => void
}) {
  const sections = parseReadmeSections(kb.readme)
  const status = readmeStatus(kb.readme)

  return (
    <div className="kb-overview">
      <div className="kb-overview-header">
        <Typography.Title level={5} style={{ marginBottom: 0, fontFamily: 'var(--font-serif)' }}>
          {kb.name}
        </Typography.Title>
        {kb.description && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {kb.description}
          </Typography.Text>
        )}
      </div>

      {/* README preview */}
      <div className="kb-overview-readme">
        <div className="kb-overview-readme-header">
          <BookOutlined style={{ fontSize: 13, color: 'var(--accent)' }} />
          <span>README 摘要</span>
        </div>
        {sections.topic || sections.scope || sections.questions ? (
          <div className="kb-overview-readme-body">
            {sections.topic && (
              <div className="kb-overview-field">
                <div className="kb-overview-field-label">主题</div>
                <div className="kb-overview-field-value">{sections.topic}</div>
              </div>
            )}
            {sections.scope && (
              <div className="kb-overview-field">
                <div className="kb-overview-field-label">收录范围</div>
                <div className="kb-overview-field-value">{sections.scope}</div>
              </div>
            )}
            {sections.questions && (
              <div className="kb-overview-field">
                <div className="kb-overview-field-label">当前关注问题</div>
                <div className="kb-overview-field-value">{sections.questions}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="kb-overview-readme-empty">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              README 尚未填写，点击下方编辑
            </Typography.Text>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="kb-overview-stats">
        <div className="kb-overview-stat">
          <div className="kb-overview-stat-value">{kb.documentCount ?? 0}</div>
          <div className="kb-overview-stat-label">文献</div>
        </div>
        <div className="kb-overview-stat">
          <div className="kb-overview-stat-value">{kb.pendingSuggestionCount ?? 0}</div>
          <div className="kb-overview-stat-label">README 建议</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="kb-overview-actions">
        <div className="kb-overview-actions-label">快捷操作</div>
        <div className="kb-overview-action-grid">
          <button className="kb-overview-action" onClick={() => onAction('upload')}>
            <UploadOutlined />
            <span>上传并分析文献</span>
          </button>
          <button className="kb-overview-action" onClick={() => onAction('discovery')}>
            <SearchOutlined />
            <span>搜索候选文献</span>
          </button>
          <button className="kb-overview-action" onClick={() => onAction('qa')}>
            <ExperimentOutlined />
            <span>知识库问答</span>
          </button>
          <button className="kb-overview-action" onClick={() => onAction('readme')}>
            <EditOutlined />
            <span>编辑 README</span>
          </button>
        </div>
      </div>
    </div>
  )
}
