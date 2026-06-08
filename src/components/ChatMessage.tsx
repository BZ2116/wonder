import { UserOutlined, RobotOutlined, FileTextOutlined, SaveOutlined, ExperimentOutlined } from '@ant-design/icons'
import { Tag, Button } from 'antd'
import type { QASources, EvidenceStatus, AnswerMode } from '../stores/qa'

interface Props {
  role: 'user' | 'assistant'
  content: string
  avatar?: string
  sources?: QASources
  onSaveResearchCard?: () => void
}

const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, { label: string; color: string }> = {
  none: { label: '未命中知识库', color: 'default' },
  weak: { label: '弱相关', color: 'warning' },
  reliable: { label: '证据可靠', color: 'success' },
}

const ANSWER_MODE_LABELS: Record<AnswerMode, { label: string; color: string }> = {
  general: { label: '通用回答', color: 'default' },
  rag_enhanced: { label: '知识库增强', color: 'blue' },
  mentioned_docs: { label: '指定论文', color: 'green' },
  compare_docs: { label: '多论文对比', color: 'purple' },
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  card: '研究卡片',
  profile: '文献信息',
  summary: '论文摘要',
  content: '正文片段',
}

export default function ChatMessage({ role, content, avatar, sources, onSaveResearchCard }: Props) {
  const isUser = role === 'user'

  const avatarEl = isUser ? (
    <div className="wonder-chat-avatar">
      {avatar ? <img src={avatar} alt="头像" /> : <UserOutlined />}
    </div>
  ) : (
    <div className="wonder-chat-avatar wonder-chat-avatar--bot">
      <RobotOutlined />
    </div>
  )

  const modeInfo = sources?.answerMode ? ANSWER_MODE_LABELS[sources.answerMode] : null
  const evidenceInfo = sources?.evidenceStatus ? EVIDENCE_STATUS_LABELS[sources.evidenceStatus] : null
  const hasRefs = sources?.refs && sources.refs.length > 0
  const isWeakEvidence = sources?.evidenceStatus === 'weak' && hasRefs
  const isNoEvidence = sources?.evidenceStatus === 'none'
  const isReliableEvidence = sources?.evidenceStatus === 'reliable'

  // Determine title area text
  const refsTitle = isWeakEvidence ? '可能相关材料' : isReliableEvidence ? '引用来源' : '引用来源'

  return (
    <div className={`wonder-chat-msg ${isUser ? 'wonder-chat-msg--user' : 'wonder-chat-msg--assistant'}`}>
      {!isUser && avatarEl}
      <div className="wonder-chat-bubble-wrap">
        <div className={`wonder-chat-bubble ${isUser ? 'wonder-chat-bubble--user' : 'wonder-chat-bubble--assistant'}`}>
          {content}
        </div>
        {!isUser && (
          <div className="wonder-chat-sources">
            {modeInfo && (
              <div style={{ marginBottom: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Tag color={modeInfo.color} style={{ fontSize: 12 }}>{modeInfo.label}</Tag>
                {evidenceInfo && (
                  <Tag color={evidenceInfo.color} style={{ fontSize: 12 }}>{evidenceInfo.label}</Tag>
                )}
              </div>
            )}
            {isNoEvidence ? (
              <div className="wonder-chat-source">
                <div className="wonder-chat-source__text" style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                  未引用知识库来源
                </div>
              </div>
            ) : hasRefs ? (
              <>
                {!isNoEvidence && (
                  <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--ink-ghost)' }}>
                    {refsTitle}
                  </div>
                )}
                {sources.refs!.slice(0, 5).map((ref, index) => (
                  <div key={ref.chunk_id || index} className="wonder-chat-source">
                    <div className="wonder-chat-source__label">
                      {ref.chunk_type === 'card' ? (
                        <ExperimentOutlined style={{ marginRight: 4 }} />
                      ) : (
                        <FileTextOutlined style={{ marginRight: 4 }} />
                      )}
                      {ref.file_name}
                      {SOURCE_TYPE_LABELS[ref.chunk_type] && (
                        <Tag style={{ marginLeft: 6, fontSize: 11 }}>{SOURCE_TYPE_LABELS[ref.chunk_type]}</Tag>
                      )}
                      {ref.chunk_index != null && (
                        <span style={{ color: 'var(--ink-ghost)', marginLeft: 6 }}>
                          #{ref.chunk_index}
                        </span>
                      )}
                      {ref.score != null && (
                        <span style={{ color: 'var(--ink-ghost)', marginLeft: 6, fontSize: 11 }}>
                          {(ref.score * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    {(() => {
                      const metaBits = [
                        ref.paperTitle,
                        ref.sectionTitle,
                        ref.pageStart ? `pp. ${ref.pageStart}${ref.pageEnd && ref.pageEnd !== ref.pageStart ? `-${ref.pageEnd}` : ''}` : '',
                        ref.labels?.length ? ref.labels.join(', ') : '',
                      ].filter(Boolean)
                      if (metaBits.length === 0) return null
                      return (
                        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2, paddingLeft: 20 }}>
                          {metaBits.join(' · ')}
                        </div>
                      )
                    })()}
                    {(ref.terms_en || ref.terms_zh) && (
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2, paddingLeft: 20, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {ref.terms_zh && <span>{ref.terms_zh}</span>}
                        {ref.terms_en && <span style={{ color: 'var(--ink-ghost)' }}>({ref.terms_en})</span>}
                      </div>
                    )}
                    {ref.zh_semantic_summary && (
                      <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2, paddingLeft: 20, fontStyle: 'italic' }}>
                        {ref.zh_semantic_summary}
                      </div>
                    )}
                    <div className="wonder-chat-source__text">
                      {ref.content.length > 200 ? ref.content.slice(0, 200) + '...' : ref.content}
                    </div>
                  </div>
                ))}
              </>
            ) : sources?.chunks?.length ? (
              sources.chunks.slice(0, 3).map((chunk, index) => (
                <div key={index} className="wonder-chat-source">
                  <div className="wonder-chat-source__label">Source {index + 1}</div>
                  <div className="wonder-chat-source__text">{chunk}</div>
                </div>
              ))
            ) : sources ? (
              <div className="wonder-chat-source">
                <div className="wonder-chat-source__text" style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                  {sources.answerMode === 'general' ? '未引用知识库来源' : '无匹配的已索引来源'}
                </div>
              </div>
            ) : (
              <div className="wonder-chat-source">
                <div className="wonder-chat-source__text" style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                  来源未检索
                </div>
              </div>
            )}
          </div>
        )}
        {!isUser && onSaveResearchCard && (
          <div style={{ marginTop: 6 }}>
            <Button type="link" size="small" icon={<SaveOutlined />} onClick={onSaveResearchCard}>
              沉淀为卡片
            </Button>
          </div>
        )}
      </div>
      {isUser && avatarEl}
    </div>
  )
}
