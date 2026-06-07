import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, Typography, Input, Button, List, Modal, Select, Space, Empty, Popconfirm, Tag, message, Spin, Alert } from 'antd'
import {
  SendOutlined, DeleteOutlined, ExperimentOutlined,
  PlusOutlined, MessageOutlined, BookOutlined, FileTextOutlined,
  GlobalOutlined, LoadingOutlined, RobotOutlined, CloseOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useQAStore } from '../stores/qa'
import { useConfigStore } from '../stores/config'
import ChatMessage from '../components/ChatMessage'
import ApiGuard from '../components/ApiGuard'
import KBSelector from '../components/KBSelector'
import type { ResearchCardDraft, KnowledgeType } from '../types/research-card'

const SCOPE_OPTIONS = [
  { label: '知识库', value: 'knowledge_base', icon: <BookOutlined /> },
  { label: '指定文档', value: 'document', icon: <FileTextOutlined /> },
  { label: '全部', value: 'all', icon: <GlobalOutlined /> },
]

const KNOWLEDGE_TYPE_OPTIONS: { label: string; value: KnowledgeType }[] = [
  { label: '方法', value: 'method' },
  { label: '理论', value: 'theory' },
  { label: '发现', value: 'finding' },
  { label: '研究问题', value: 'research_question' },
  { label: '研究空白', value: 'gap' },
  { label: '局限性', value: 'limitation' },
  { label: '写作素材', value: 'writing_material' },
  { label: '其他', value: 'other' },
]

export default function QA() {
  const [input, setInput] = useState('')
  const [showNewSession, setShowNewSession] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newScopeType, setNewScopeType] = useState('knowledge_base')
  const [newScopeIds, setNewScopeIds] = useState<string[]>([])
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionActive, setMentionActive] = useState(false)
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<any>(null)

  const [cardModalOpen, setCardModalOpen] = useState(false)
  const [cardDraft, setCardDraft] = useState<ResearchCardDraft | null>(null)
  const [cardDraftLoading, setCardDraftLoading] = useState(false)
  const [cardSaving, setCardSaving] = useState(false)

  const {
    sessions, sessionsLoading, sessionId, sessionScope, messages, loading,
    mentionedDocs, mentionSearchResults, mentionSearchLoading,
    loadSessions, createSession, openSession, deleteSession, sendMessage, clear,
    searchMentions, addMention, removeMention,
    draftResearchCard, saveResearchCard,
  } = useQAStore()
  const { config } = useConfigStore()

  const currentKbId = sessionScope.type === 'knowledge_base' ? sessionScope.ids[0] : undefined

  useEffect(() => { loadSessions() }, [loadSessions])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  // Debounced mention search
  useEffect(() => {
    if (!mentionActive) {
      setShowMentionPicker(false)
      return
    }
    setShowMentionPicker(true)
    const timer = setTimeout(() => {
      searchMentions(mentionQuery, { knowledgeBaseId: currentKbId })
    }, 200)
    return () => clearTimeout(timer)
  }, [mentionActive, mentionQuery, currentKbId, searchMentions])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInput(value)

    // Detect @ mention trigger
    const atIndex = value.lastIndexOf('@')
    if (atIndex >= 0) {
      const afterAt = value.slice(atIndex + 1)
      // Only trigger if there's no space between @ and query (or query is empty)
      if (!afterAt.includes(' ')) {
        setMentionActive(true)
        setMentionQuery(afterAt)
        return
      }
    }
    setMentionActive(false)
    setMentionQuery('')
    setShowMentionPicker(false)
  }, [])

  const handleSelectMention = useCallback((doc: { id: string; fileName: string; title?: string | null }) => {
    addMention(doc)
    // Remove @query from input
    const atIndex = input.lastIndexOf('@')
    if (atIndex >= 0) {
      setInput(input.slice(0, atIndex))
    }
    setMentionActive(false)
    setMentionQuery('')
    setShowMentionPicker(false)
    inputRef.current?.focus()
  }, [input, addMention])

  const handleSend = async () => {
    if (!input.trim() || !sessionId) return
    const question = input.trim()
    const mentionedDocIds = mentionedDocs.map(d => d.id)
    setInput('')
    try {
      await sendMessage(question, mentionedDocIds.length > 0 ? mentionedDocIds : undefined)
      setMentionActive(false)
      setMentionQuery('')
    } catch (err) {
      setInput(question)
      message.error(err instanceof Error ? err.message : '发送失败，请检查网络或 API 配置')
    }
  }

  const handleCreateSession = async () => {
    if (!newTitle.trim()) return
    try {
      await createSession(newTitle.trim(), newScopeType, newScopeIds)
      setShowNewSession(false)
      setNewTitle('')
      setNewScopeType('knowledge_base')
      setNewScopeIds([])
    } catch {
      message.error('创建会话失败，请重试')
    }
  }

  const handleDraftCard = async (messageId: string) => {
    try {
      setCardDraftLoading(true)
      const draft = await draftResearchCard(messageId, currentKbId)
      setCardDraft(draft)
      setCardModalOpen(true)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '生成卡片草稿失败')
    } finally {
      setCardDraftLoading(false)
    }
  }

  const handleSaveCard = async () => {
    if (!cardDraft || !currentKbId) {
      message.error('请先选择知识库会话再保存卡片')
      return
    }
    try {
      setCardSaving(true)
      await saveResearchCard({ ...cardDraft, knowledgeBaseId: currentKbId })
      message.success('已沉淀为研究卡片')
      setCardModalOpen(false)
      setCardDraft(null)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存卡片失败')
    } finally {
      setCardSaving(false)
    }
  }

  const updateCardDraft = <K extends keyof ResearchCardDraft>(key: K, value: ResearchCardDraft[K]) => {
    if (cardDraft) {
      setCardDraft({ ...cardDraft, [key]: value })
    }
  }

  const scopeLabel = (type: string) => {
    switch (type) {
      case 'knowledge_base': return <Tag icon={<BookOutlined />} color="blue">知识库</Tag>
      case 'document': return <Tag icon={<FileTextOutlined />} color="cyan">文档</Tag>
      default: return <Tag icon={<GlobalOutlined />} color="default">全部</Tag>
    }
  }

  return (
    <ApiGuard require="both">
    <div className="wonder-page wonder-stagger">
      <div className="wonder-page-header">
        <Typography.Title level={4}>追溯问答</Typography.Title>
        <Typography.Text type="secondary">基于知识库的智能研究助手</Typography.Text>
      </div>

      <div className="wonder-qa-layout">
        {/* Session sidebar */}
        <Card
          size="small"
          className="wonder-qa-sessions"
          title={<span style={{ fontSize: 14 }}>会话列表</span>}
          extra={
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setShowNewSession(true)}
            />
          }
          bodyStyle={{ padding: 0, flex: 1, overflow: 'hidden' }}
        >
          <div className="wonder-qa-session-list">
          {sessionsLoading && sessions.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-ghost)' }}>加载中...</div>
          ) : sessions.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ color: 'var(--ink-faint)', fontSize: 13 }}>暂无会话</span>}
              style={{ padding: '24px 0' }}
            />
          ) : (
            <List
              dataSource={sessions}
              renderItem={item => (
                <List.Item
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    background: sessionId === item.id ? 'var(--accent-ghost)' : undefined,
                    borderBottom: '1px solid var(--border-light)',
                  }}
                  onClick={() => openSession(item.id)}
                  actions={[
                    <Popconfirm
                      key="del"
                      title="确定删除此会话？"
                      onConfirm={(e) => { e?.stopPropagation(); deleteSession(item.id) }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<MessageOutlined style={{ color: sessionId === item.id ? 'var(--accent)' : 'var(--ink-ghost)' }} />}
                    title={<span style={{ fontSize: 13, fontWeight: sessionId === item.id ? 600 : 400 }}>{item.title}</span>}
                    description={scopeLabel(item.scope_type)}
                  />
                </List.Item>
              )}
            />
          )}
          </div>
        </Card>

        {/* Chat area */}
        <div className="wonder-qa-main">
          {!sessionId ? (
            <Card className="wonder-qa-empty-card">
              <Empty
                image={<ExperimentOutlined style={{ fontSize: 48, color: 'var(--ink-ghost)' }} />}
                description={
                  <span style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-serif)' }}>
                    创建或选择一个会话开始问答
                  </span>
                }
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowNewSession(true)}>
                  新建会话
                </Button>
              </Empty>
            </Card>
          ) : (
            <>
              <Card className="wonder-qa-messages-card">
                <div
                  ref={listRef}
                  className="wonder-qa-message-list"
                >
                  {messages.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--ink-ghost)' }}>
                      <ExperimentOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
                      <Typography.Text style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-serif)', fontSize: 15 }}>
                        输入问题开始对话
                      </Typography.Text>
                    </div>
                  )}
                  {messages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      role={msg.role}
                      content={msg.content}
                      avatar={msg.role === 'user' ? config?.avatar : undefined}
                      sources={msg.sources}
                      onSaveResearchCard={msg.role === 'assistant' ? () => handleDraftCard(msg.id) : undefined}
                    />
                  ))}
                  {loading && (
                    <div className="wonder-chat-msg wonder-chat-msg--assistant">
                      <div className="wonder-chat-avatar wonder-chat-avatar--bot">
                        <RobotOutlined />
                      </div>
                      <div className="wonder-chat-bubble-wrap">
                        <div className="wonder-chat-bubble wonder-chat-bubble--assistant">
                          <LoadingOutlined /> 正在思考...
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="wonder-qa-input-card">
                {/* Mention chips */}
                {mentionedDocs.length > 0 && (
                  <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {mentionedDocs.map(doc => (
                      <Tag
                        key={doc.id}
                        closable
                        onClose={() => removeMention(doc.id)}
                        closeIcon={<CloseOutlined />}
                        color="blue"
                      >
                        {doc.fileName}
                      </Tag>
                    ))}
                  </div>
                )}

                {/* Mention picker dropdown */}
                {showMentionPicker && (
                  <div style={{
                    position: 'relative',
                    marginBottom: 8,
                  }}>
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      zIndex: 10,
                      background: 'var(--bg-card, #fff)',
                      border: '1px solid var(--border-light, #d9d9d9)',
                      borderRadius: 6,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      maxHeight: 200,
                      overflowY: 'auto',
                    }}>
                      {mentionSearchLoading ? (
                        <div style={{ padding: 12, textAlign: 'center' }}>
                          <Spin size="small" />
                        </div>
                      ) : mentionSearchResults.length > 0 ? (
                        mentionSearchResults.map(doc => (
                          <div
                            key={doc.id}
                            onClick={() => handleSelectMention(doc)}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--border-light, #f0f0f0)',
                              fontSize: 13,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-ghost, #e6f4ff)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <FileTextOutlined style={{ color: 'var(--ink-ghost)', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <Typography.Text strong style={{ fontSize: 13 }} ellipsis>
                                  {doc.title || doc.fileName}
                                </Typography.Text>
                                {doc.title && (
                                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }} ellipsis>
                                    {doc.fileName}
                                  </Typography.Text>
                                )}
                                {(doc.authors || doc.year || doc.venue) && (
                                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                    {Array.isArray(doc.authors) ? doc.authors.join(', ') : doc.authors}
                                    {doc.authors && doc.year ? ', ' : ''}
                                    {doc.year}
                                    {doc.venue ? ` (${doc.venue})` : ''}
                                  </Typography.Text>
                                )}
                              </div>
                              {doc.metadataStatus && doc.metadataStatus !== 'complete' && (
                                <Tag color="warning" style={{ fontSize: 11, margin: 0 }}>
                                  {doc.metadataStatus === 'missing' ? '元数据缺失' : doc.metadataStatus === 'partial' ? '元数据不完整' : doc.metadataStatus}
                                </Tag>
                              )}
                              {doc.indexedStatus && doc.indexedStatus !== 'indexed' && (
                                <Tag color="warning" style={{ fontSize: 11, margin: 0 }}>
                                  {doc.indexedStatus === 'indexing' ? '索引中' : doc.indexedStatus === 'failed' ? '索引失败' : doc.indexedStatus}
                                </Tag>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: 12, textAlign: 'center', color: 'var(--ink-ghost)', fontSize: 13 }}>
                          未找到匹配的文档
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    ref={inputRef}
                    placeholder="输入问题... (输入 @ 引用文档)"
                    value={input}
                    onChange={handleInputChange}
                    onPressEnter={handleSend}
                    disabled={loading}
                    size="large"
                    style={{ flex: 1 }}
                  />
                  <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={loading} size="large" />
                </div>
                <div style={{ marginTop: 8, textAlign: 'right' }}>
                  <Button size="small" icon={<DeleteOutlined />} onClick={clear} type="text" style={{ color: 'var(--ink-faint)' }}>
                    关闭会话
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* New session modal */}
      <Modal
        title="新建会话"
        open={showNewSession}
        onOk={handleCreateSession}
        onCancel={() => setShowNewSession(false)}
        okButtonProps={{ disabled: !newTitle.trim() }}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>会话标题</Typography.Text>
            <Input
              placeholder="例如：RAG 方法调研"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onPressEnter={handleCreateSession}
            />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>作用域</Typography.Text>
            <Select
              value={newScopeType}
              onChange={setNewScopeType}
              options={SCOPE_OPTIONS}
              style={{ width: '100%' }}
            />
          </div>
          {newScopeType === 'knowledge_base' && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>选择知识库</Typography.Text>
              <KBSelector
                value={newScopeIds[0] || null}
                onChange={(v) => setNewScopeIds(v ? [v] : [])}
                style={{ width: '100%' }}
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Research card draft modal */}
      <Modal
        title="沉淀为研究卡片"
        open={cardModalOpen}
        onCancel={() => { setCardModalOpen(false); setCardDraft(null) }}
        onOk={handleSaveCard}
        okText="保存卡片"
        cancelText="取消"
        okButtonProps={{ loading: cardSaving, disabled: !cardDraft }}
        width={640}
      >
        {cardDraftLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="正在生成卡片草稿..." />
          </div>
        ) : cardDraft ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
            {cardDraft.noPaperEvidence && (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                message="此回答无文献支撑，内容可能需要进一步验证"
              />
            )}

            <div>
              <Typography.Text type="secondary" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>核心主张（每行一条）</Typography.Text>
              <Input.TextArea
                rows={3}
                value={cardDraft.coreClaims.join('\n')}
                onChange={e => updateCardDraft('coreClaims', e.target.value.split('\n').filter(Boolean))}
              />
            </div>

            <div>
              <Typography.Text type="secondary" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>知识类型</Typography.Text>
              <Select
                value={cardDraft.knowledgeType}
                onChange={v => updateCardDraft('knowledgeType', v)}
                options={KNOWLEDGE_TYPE_OPTIONS}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <Typography.Text type="secondary" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>标签</Typography.Text>
              <Select
                mode="tags"
                value={cardDraft.tags}
                onChange={v => updateCardDraft('tags', v)}
                placeholder="输入标签后回车"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <Typography.Text type="secondary" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>子方向</Typography.Text>
              <Input
                value={cardDraft.subDirection ?? ''}
                onChange={e => updateCardDraft('subDirection', e.target.value || null)}
                placeholder="可选"
              />
            </div>

            <div>
              <Typography.Text type="secondary" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>验证备注</Typography.Text>
              <Input.TextArea
                rows={2}
                value={cardDraft.validationNotes}
                onChange={e => updateCardDraft('validationNotes', e.target.value)}
              />
            </div>

            <div>
              <Typography.Text type="secondary" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>使用场景</Typography.Text>
              <Select
                mode="tags"
                value={cardDraft.useCases}
                onChange={v => updateCardDraft('useCases', v)}
                placeholder="输入使用场景后回车"
                style={{ width: '100%' }}
              />
            </div>

            {cardDraft.evidenceRefs.length > 0 && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>证据来源</Typography.Text>
                <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--border-light, #d9d9d9)', borderRadius: 6, padding: '4px 0' }}>
                  {cardDraft.evidenceRefs.map((ref, idx) => (
                    <div key={ref.id || idx} style={{ padding: '4px 12px', fontSize: 12, borderBottom: idx < cardDraft.evidenceRefs.length - 1 ? '1px solid var(--border-light, #f0f0f0)' : 'none' }}>
                      <FileTextOutlined style={{ marginRight: 4, color: 'var(--ink-ghost)' }} />
                      {ref.fileName ?? '未知文件'}
                      {ref.chunkIndex != null && <span style={{ color: 'var(--ink-ghost)', marginLeft: 4 }}>#{ref.chunkIndex}</span>}
                      {ref.score != null && <span style={{ color: 'var(--ink-ghost)', marginLeft: 4 }}>{(ref.score * 100).toFixed(0)}%</span>}
                      {ref.snippet && <span style={{ color: 'var(--ink-faint)', marginLeft: 4 }}>- {ref.snippet.slice(0, 80)}{ref.snippet.length > 80 ? '...' : ''}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
    </ApiGuard>
  )
}
