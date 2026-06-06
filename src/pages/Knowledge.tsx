import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Typography, Button, Card, Empty, Modal, Form, Input, Popconfirm, message, List, Tag, Spin } from 'antd'
import {
  PlusOutlined, BookOutlined, DeleteOutlined, EditOutlined,
  FileTextOutlined, SettingOutlined, ArrowLeftOutlined,
  CheckCircleOutlined, SyncOutlined, CloseCircleOutlined, MinusCircleOutlined,
  ReloadOutlined, WarningOutlined,
} from '@ant-design/icons'
import { useKnowledgeStore } from '../stores/knowledge'
import ApiGuard from '../components/ApiGuard'
import ResearchCardList from '../components/ResearchCardList'
import { getIndexStatusInfo, getVectorIndexDetailText } from '../lib/knowledge/index-status'

export default function Knowledge() {
  const navigate = useNavigate()
  const {
    knowledgeBases, kbLoading, loadKnowledgeBases,
    createKnowledgeBase, updateKnowledgeBase, deleteKnowledgeBase,
    selectedKBId, selectKB,
    kbDocuments, kbDocsLoading, loadKBDocuments,
    readmeSuggestions, loadReadmeSuggestions, acceptSuggestion, rejectSuggestion,
    reindexDocument,
    removeDocumentFromKB,
    loadResearchCards,
  } = useKnowledgeStore()

  const [createOpen, setCreateOpen] = useState(false)
  const [editReadmeOpen, setEditReadmeOpen] = useState(false)
  const [editNameOpen, setEditNameOpen] = useState(false)
  const [form] = Form.useForm()
  const [readmeForm] = Form.useForm()
  const [nameForm] = Form.useForm()

  useEffect(() => { loadKnowledgeBases() }, [loadKnowledgeBases])

  const selectedKB = knowledgeBases.find(kb => kb.id === selectedKBId)

  useEffect(() => {
    if (selectedKBId) {
      loadKBDocuments(selectedKBId)
      loadReadmeSuggestions(selectedKBId)
      loadResearchCards(selectedKBId)
    }
  }, [selectedKBId, loadKBDocuments, loadReadmeSuggestions, loadResearchCards])

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      await createKnowledgeBase(values.name, values.description, values.readme)
      setCreateOpen(false)
      form.resetFields()
      message.success('知识库创建成功')
    } catch {
      // validation error
    }
  }

  const handleEditReadme = async () => {
    try {
      const values = await readmeForm.validateFields()
      if (selectedKBId) {
        await updateKnowledgeBase(selectedKBId, { readme: values.readme })
        setEditReadmeOpen(false)
        message.success('README 已更新')
      }
    } catch {
      // validation error
    }
  }

  const handleEditName = async () => {
    try {
      const values = await nameForm.validateFields()
      if (selectedKBId) {
        await updateKnowledgeBase(selectedKBId, { name: values.name, description: values.description })
        setEditNameOpen(false)
        message.success('知识库信息已更新')
      }
    } catch {
      // validation error
    }
  }

  // KB list view
  if (!selectedKBId) {
    return (
      <ApiGuard require="analysis">
        <div className="wonder-page wonder-stagger">
          <div className="wonder-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Typography.Title level={4}>知识库</Typography.Title>
              <Typography.Text type="secondary">按研究方向管理你的文献</Typography.Text>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建知识库
            </Button>
          </div>

          {kbLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin /></div>
          ) : knowledgeBases.length === 0 ? (
            <Empty
              description={
                <span style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-serif)' }}>
                  还没有知识库，创建一个开始吧
                </span>
              }
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建知识库
              </Button>
            </Empty>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {knowledgeBases.map(kb => (
                <Card
                  key={kb.id}
                  hoverable
                  onClick={() => selectKB(kb.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <BookOutlined style={{ fontSize: 24, color: 'var(--accent)', marginTop: 4 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Typography.Title level={5} style={{ marginBottom: 4 }} ellipsis>
                        {kb.name}
                      </Typography.Title>
                      <Typography.Text type="secondary" style={{ fontSize: 13 }} ellipsis>
                        {kb.description || '暂无描述'}
                      </Typography.Text>
                      <div style={{ marginTop: 8 }}>
                        <Tag>{(kb as { documentCount?: number }).documentCount ?? 0} 篇文档</Tag>
                        <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                          {new Date(kb.created_at).toLocaleDateString('zh-CN')}
                        </Typography.Text>
                      </div>
                    </div>
                    <Popconfirm
                      title="确认删除此知识库？"
                      description="文档不会被删除，仅移除知识库"
                      onConfirm={(e) => { e?.stopPropagation(); deleteKnowledgeBase(kb.id) }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>
                  </div>
                </Card>
              ))}
            </div>
          )}

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

  // KB workspace view
  return (
    <ApiGuard require="analysis">
      <div className="wonder-page wonder-stagger">
        <div className="wonder-page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => selectKB(null)} />
            <Typography.Title level={4} style={{ marginBottom: 0 }}>{selectedKB?.name}</Typography.Title>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => {
              nameForm.setFieldsValue({ name: selectedKB?.name, description: selectedKB?.description })
              setEditNameOpen(true)
            }} />
          </div>
          {selectedKB?.description && (
            <Typography.Text type="secondary">{selectedKB.description}</Typography.Text>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'stretch' }}>
          {/* README */}
          <Card
            size="small"
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
            title={<><BookOutlined /> README</>}
            extra={<Button size="small" icon={<EditOutlined />} onClick={() => {
              readmeForm.setFieldsValue({ readme: selectedKB?.readme })
              setEditReadmeOpen(true)
            }}>编辑</Button>}
            bodyStyle={{ flex: 1, overflow: 'hidden' }}
          >
            <div style={{ flex: 1, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 13 }}>
              {selectedKB?.readme || '暂无 README'}
            </div>
          </Card>

          {/* README Suggestions */}
          <Card
            size="small"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', maxHeight: 480 }}
            title={<><SettingOutlined /> README 建议</>}
            extra={readmeSuggestions.length > 0 ? <Tag color="orange">{readmeSuggestions.length}</Tag> : null}
            bodyStyle={{ flex: 1, overflow: 'hidden' }}
          >
            <div style={{ flex: 1, overflow: 'auto', maxHeight: 420 }}>
              {readmeSuggestions.length === 0 ? (
                <Empty description="暂无待处理的建议" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <List
                  size="small"
                  dataSource={readmeSuggestions as { id: string; section: string; suggestion: string; reason: string }[]}
                  renderItem={item => (
                    <List.Item
                      actions={[
                        <Button key="accept" type="link" size="small" onClick={() => acceptSuggestion(item.id)}>采纳</Button>,
                        <Button key="reject" type="link" size="small" danger onClick={() => rejectSuggestion(item.id)}>忽略</Button>,
                      ]}
                    >
                      <div>
                        <Tag color="blue">{item.section}</Tag>
                        <span>{item.suggestion}</span>
                        <br />
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.reason}</Typography.Text>
                      </div>
                    </List.Item>
                  )}
                />
              )}
            </div>
          </Card>
        </div>

        {/* Research Cards */}
        <ResearchCardList />

        {/* Documents */}
        <Card
          size="small"
          title={<><FileTextOutlined /> 文档列表</>}
          extra={<Tag>{kbDocuments.length} 篇</Tag>}
        >
          {kbDocsLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
          ) : kbDocuments.length === 0 ? (
            <Empty description="该知识库暂无文档" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <List
              size="small"
              dataSource={kbDocuments as { id: string; file_name: string; title?: string | null; summary?: string; fit_score?: number; recommended_action?: string; created_at: string; index_status?: string | null; index_error?: string | null; metadata_status?: string | null; year?: number | null; reading_card?: string | null; collection_name?: string | null; chunk_count?: number | null; embedding_model?: string | null; indexed_at?: string | null }[]}
              renderItem={doc => {
                const indexStatus = doc.index_status || 'not_indexed'
                const indexTagMap: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
                  indexed: { color: 'success', icon: <CheckCircleOutlined />, label: '已索引' },
                  indexing: { color: 'processing', icon: <SyncOutlined spin />, label: '索引中' },
                  index_failed: { color: 'error', icon: <CloseCircleOutlined />, label: '索引失败' },
                  not_indexed: { color: 'default', icon: <MinusCircleOutlined />, label: '未索引' },
                }
                const tagInfo = getIndexStatusInfo(indexStatus)
                const tagIconMap: Record<typeof tagInfo.kind, React.ReactNode> = {
                  indexed: <CheckCircleOutlined />,
                  indexing: <SyncOutlined spin />,
                  failed: <CloseCircleOutlined />,
                  stale: <ReloadOutlined />,
                  not_indexed: <MinusCircleOutlined />,
                }

                const metadataStatus = doc.metadata_status || 'missing'
                const metadataTagMap: Record<string, { color: string; label: string }> = {
                  complete: { color: 'green', label: '元数据完整' },
                  partial: { color: 'orange', label: '元数据部分' },
                  missing: { color: 'default', label: '元数据缺失' },
                }
                const metaTagInfo = metadataTagMap[metadataStatus] || metadataTagMap.missing

                // Parse reading card for fallback title
                let parsedReadingCardPaperTitle: string | undefined
                try { parsedReadingCardPaperTitle = JSON.parse(doc.reading_card || '{}').paperTitle } catch { /* ignore */ }

                const displayTitle = doc.title || parsedReadingCardPaperTitle || doc.file_name

                return (
                <List.Item
                  onClick={() => navigate(`/document/${doc.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Typography.Text strong ellipsis style={{ color: 'var(--accent)', maxWidth: '60%' }}>
                        {displayTitle}
                      </Typography.Text>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                        <Tag color={tagInfo.color} icon={tagIconMap[tagInfo.kind]}>{tagInfo.label}</Tag>
                        {indexStatus !== 'indexing' && selectedKBId && (
                          <Button
                            type="text"
                            size="small"
                            icon={<ReloadOutlined />}
                            onClick={() => reindexDocument(selectedKBId!, doc.id)}
                            title="重建索引"
                          />
                        )}
                        {selectedKBId && (
                          <Popconfirm
                            title="确认移除此文档？"
                            description="文档本身不会被删除，仅从当前知识库移除"
                            onConfirm={() => removeDocumentFromKB(selectedKBId!, doc.id)}
                            okText="移除"
                            cancelText="取消"
                          >
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              title="从知识库移除"
                            />
                          </Popconfirm>
                        )}
                      </div>
                    </div>
                    {doc.summary && (
                      <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0, marginTop: 4 }}>
                        {doc.summary}
                      </Typography.Paragraph>
                    )}
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Tag color={metaTagInfo.color} style={{ fontSize: 11 }}>
                        {metadataStatus === 'missing' && <WarningOutlined style={{ marginRight: 2 }} />}
                        {metaTagInfo.label}
                      </Tag>
                      {metadataStatus === 'missing' && (
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          元数据缺失，可回填
                        </Typography.Text>
                      )}
                      {doc.year && <Tag style={{ fontSize: 11 }}>{doc.year}</Tag>}
                      {doc.fit_score != null && <Tag color="blue">匹配 {doc.fit_score}</Tag>}
                      {doc.recommended_action && <Tag style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.recommended_action}</Tag>}
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                      </Typography.Text>
                    </div>
                    <Typography.Text
                      type={tagInfo.kind === 'failed' ? 'danger' : 'secondary'}
                      style={{ display: 'block', fontSize: 11, marginTop: 4 }}
                    >
                      {getVectorIndexDetailText(doc)}
                    </Typography.Text>
                  </div>
                </List.Item>
                )
              }}
            />
          )}
        </Card>

        <Modal
          title="编辑 README"
          open={editReadmeOpen}
          onOk={handleEditReadme}
          onCancel={() => setEditReadmeOpen(false)}
          okText="保存"
          cancelText="取消"
          width={600}
        >
          <Form form={readmeForm} layout="vertical">
            <Form.Item name="readme">
              <Input.TextArea rows={15} style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }} />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="编辑知识库信息"
          open={editNameOpen}
          onOk={handleEditName}
          onCancel={() => setEditNameOpen(false)}
          okText="保存"
          cancelText="取消"
        >
          <Form form={nameForm} layout="vertical">
            <Form.Item name="name" label="名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </ApiGuard>
  )
}
