import { Tag, Typography, Button, List, Alert, Space } from 'antd'
import {
  FileTextOutlined,
  BookOutlined,
  EditOutlined,
  NumberOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
  BulbOutlined,
  WarningOutlined,
  StarOutlined,
  ReadOutlined,
  AimOutlined,
  SolutionOutlined,
  OrderedListOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AnalysisResult as AnalysisResultType } from '../types/analysis'

/* ─── Markdown renderer for AI-generated academic content ─── */
function Markdown({ children }: { children: unknown }) {
  const text = typeof children === 'string' ? children : children == null ? '' : String(children)
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}

interface AnalysisResultProps {
  result: AnalysisResultType
  knowledgeBaseId?: string
  onAddToKB?: () => void
  fileName?: string
}

const ACTION_LABELS: Record<string, { text: string; color: string; icon: React.ReactNode }> = {
  add: { text: '收录', color: 'green', icon: <CheckCircleOutlined /> },
  deep_read: { text: '精读', color: 'blue', icon: <ReadOutlined /> },
  skim: { text: '略读', color: 'default', icon: <FileTextOutlined /> },
  track_citations: { text: '追踪引用', color: 'orange', icon: <StarOutlined /> },
  add_to_other_kb: { text: '加入其他知识库', color: 'purple', icon: <BookOutlined /> },
  ignore: { text: '忽略', color: 'default', icon: <WarningOutlined /> },
}

const RELATION_LABELS: Record<string, { text: string; color: string }> = {
  supplement: { text: '补充', color: 'green' },
  duplicate: { text: '重复', color: 'red' },
  conflict: { text: '冲突', color: 'orange' },
  extension: { text: '扩展', color: 'blue' },
  method_reference: { text: '方法参考', color: 'cyan' },
  unrelated: { text: '无关', color: 'default' },
}

const VERDICT_LABELS: Record<string, { text: string; color: string }> = {
  must_read: { text: '必读', color: 'green' },
  deep_read: { text: '精读', color: 'blue' },
  skim: { text: '略读', color: 'default' },
  ignore: { text: '忽略', color: 'red' },
}

const BEST_USE_LABELS: Record<string, string> = {
  literature_review: '文献综述',
  method_reference: '方法参考',
  experiment_baseline: '实验对照',
  background: '背景材料',
  not_useful: '暂不使用',
}

function CompactList({ items }: { items?: string[] }) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : []
  if (safeItems.length === 0) return null
  return (
    <List
      size="small"
      dataSource={safeItems}
      renderItem={(item: string) => (
        <List.Item style={{ padding: '4px 0', border: 'none', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
          {item}
        </List.Item>
      )}
    />
  )
}

function getFitScoreColor(score: number | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'var(--danger, #8B2C1F)'
  if (score >= 70) return 'var(--success, #4A6B4A)'
  if (score >= 40) return 'var(--warning, #B8860B)'
  return 'var(--danger, #8B2C1F)'
}

function getFitScoreLabel(score: number | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return '未知'
  if (score >= 80) return '高度适配'
  if (score >= 60) return '较为相关'
  if (score >= 40) return '部分相关'
  if (score >= 20) return '弱相关'
  return '基本无关'
}

function getFitScoreBg(score: number | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'rgba(139, 44, 31, 0.06)'
  if (score >= 70) return 'rgba(74, 107, 74, 0.06)'
  if (score >= 40) return 'rgba(184, 134, 11, 0.06)'
  return 'rgba(139, 44, 31, 0.06)'
}

/* ─── Section wrapper ─── */
function Section({ icon, title, children, accent }: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-light)',
        background: accent || 'rgba(91, 127, 110, 0.03)',
      }}>
        <span style={{ color: 'var(--accent)', fontSize: 14, display: 'flex' }}>{icon}</span>
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 600,
          color: 'var(--ink-dense)',
          fontSize: 14,
        }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {children}
      </div>
    </div>
  )
}

export default function AnalysisResult({ result, knowledgeBaseId, onAddToKB, fileName }: AnalysisResultProps) {
  const fitScore = result.knowledgeBaseFitScore
  const action = result.recommendedAction
  const actionInfo = action ? ACTION_LABELS[action] : null
  const relation = result.relationToExistingDocs
  const relationInfo = relation ? RELATION_LABELS[relation.type] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ─── Paper Title Header ─── */}
      {(result.paperTitle || fileName) && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-card)',
          padding: '16px 20px',
        }}>
          {result.paperTitle && (
            <div style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 700,
              fontSize: 16,
              color: 'var(--ink-dense)',
              lineHeight: 1.5,
            }}>
              {result.paperTitle}
            </div>
          )}
          {fileName && (
            <div style={{
              fontSize: 12,
              color: 'var(--ink-caption)',
              marginTop: result.paperTitle ? 4 : 0,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <FileTextOutlined style={{ fontSize: 11 }} />
              {fileName}
            </div>
          )}
        </div>
      )}

      {/* ─── Research Decision ─── */}
      {result.decisionBrief && (
        <Section icon={<AimOutlined />} title="研究决策">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Tag color={VERDICT_LABELS[result.decisionBrief.verdict]?.color || 'default'}>
                {VERDICT_LABELS[result.decisionBrief.verdict]?.text || result.decisionBrief.verdict}
              </Tag>
              <Tag>{BEST_USE_LABELS[result.decisionBrief.bestUse] || result.decisionBrief.bestUse}</Tag>
              {typeof result.decisionBrief.confidence === 'number' && (
                <Tag color="blue">置信度 {result.decisionBrief.confidence}/100</Tag>
              )}
            </div>
            {result.decisionBrief.whyItMatters.length > 0 && (
              <div>
                <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-caption)' }}>
                  为什么重要
                </Typography.Text>
                <CompactList items={result.decisionBrief.whyItMatters} />
              </div>
            )}
            {result.decisionBrief.nextAction && (
              <Alert
                type="info"
                showIcon
                message={result.decisionBrief.nextAction}
                style={{ margin: 0 }}
              />
            )}
          </div>
        </Section>
      )}

      {/* ─── Knowledge Relation ─── */}
      {(typeof result.knowledgeIncrementScore === 'number' ||
        typeof result.evidenceStrengthScore === 'number' ||
        typeof result.actionabilityScore === 'number' ||
        result.decisionBrief?.noveltyPoints.length ||
        result.decisionBrief?.overlapPoints.length ||
        result.decisionBrief?.conflictOrRiskPoints.length) && (
        <Section icon={<BulbOutlined />} title="知识关系">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Space wrap>
              {typeof result.knowledgeIncrementScore === 'number' && <Tag color="green">知识增量 {result.knowledgeIncrementScore}</Tag>}
              {typeof result.evidenceStrengthScore === 'number' && <Tag color="blue">证据强度 {result.evidenceStrengthScore}</Tag>}
              {typeof result.actionabilityScore === 'number' && <Tag color="purple">行动价值 {result.actionabilityScore}</Tag>}
            </Space>
            {result.decisionBrief?.noveltyPoints.length ? (
              <div>
                <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-caption)' }}>新增价值</Typography.Text>
                <CompactList items={result.decisionBrief.noveltyPoints} />
              </div>
            ) : null}
            {result.decisionBrief?.overlapPoints.length ? (
              <div>
                <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-caption)' }}>重复或已覆盖</Typography.Text>
                <CompactList items={result.decisionBrief.overlapPoints} />
              </div>
            ) : null}
            {result.decisionBrief?.conflictOrRiskPoints.length ? (
              <div>
                <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-caption)' }}>冲突与风险</Typography.Text>
                <CompactList items={result.decisionBrief.conflictOrRiskPoints} />
              </div>
            ) : null}
          </div>
        </Section>
      )}

      {/* ─── Key Takeaways ─── */}
      {result.decisionBrief?.keyTakeaways.length ? (
        <Section icon={<StarOutlined />} title="关键收获">
          <CompactList items={result.decisionBrief.keyTakeaways} />
        </Section>
      ) : null}

      {/* ─── Fit Score Hero ─── */}
      {typeof fitScore === 'number' && Number.isFinite(fitScore) && (
        <div style={{
          background: getFitScoreBg(fitScore),
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-card)',
          padding: '24px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 28,
        }}>
          {/* Score gauge */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: 100,
          }}>
            <div style={{
              width: 92,
              height: 92,
              borderRadius: '50%',
              border: `3px solid ${getFitScoreColor(fitScore)}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-card)',
              boxShadow: `0 0 0 6px ${getFitScoreBg(fitScore)}`,
            }}>
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 34,
                fontWeight: 700,
                lineHeight: 1,
                color: getFitScoreColor(fitScore),
              }}>
                {fitScore}
              </div>
              <div style={{
                fontSize: 10,
                color: 'var(--ink-faint)',
                marginTop: 2,
                fontWeight: 500,
              }}>
                / 100
              </div>
            </div>
            <div style={{
              marginTop: 8,
              fontSize: 12,
              fontWeight: 600,
              color: getFitScoreColor(fitScore),
              letterSpacing: '0.02em',
            }}>
              {getFitScoreLabel(fitScore)}
            </div>
          </div>

          {/* Score details */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <AimOutlined style={{ color: 'var(--accent)', fontSize: 14 }} />
              <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--ink-dense)', fontSize: 14 }}>
                适配度评估
              </span>
              {actionInfo && (
                <Tag
                  color={actionInfo.color}
                  style={{ fontSize: 12, padding: '1px 8px', marginLeft: 'auto' }}
                  icon={actionInfo.icon}
                >
                  {actionInfo.text}
                </Tag>
              )}
            </div>
            {result.fitReason && typeof result.fitReason === 'string' && (
              <Markdown>{result.fitReason}</Markdown>
            )}
            {relation && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                {relationInfo && <Tag color={relationInfo.color}>{relationInfo.text}</Tag>}
                <span style={{ fontSize: 12, color: 'var(--ink-caption)' }}>与已有文献的关系</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Summary ─── */}
      {result.summary && typeof result.summary === 'string' && (
        <Section icon={<FileTextOutlined />} title="摘要">
          <Markdown>{result.summary}</Markdown>
        </Section>
      )}

      {/* ─── Reading Card ─── */}
      {result.readingCard && typeof result.readingCard === 'string' && (
        <ReadingCard content={result.readingCard} />
      )}

      {/* ─── Novelty ─── */}
      {result.noveltyForKnowledgeBase && typeof result.noveltyForKnowledgeBase === 'string' && (
        <Section icon={<BulbOutlined />} title="对知识库的新贡献" accent="rgba(91, 127, 110, 0.06)">
          <Markdown>{result.noveltyForKnowledgeBase}</Markdown>
        </Section>
      )}

      {/* ─── Suggested Placement ─── */}
      {result.suggestedPlacement && (
        <Section icon={<AppstoreOutlined />} title="建议归类">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-caption)' }}>子方向：</span>
              <span style={{ fontSize: 13, color: 'var(--ink-dense)', fontWeight: 500 }}>{result.suggestedPlacement.subDirection}</span>
            </div>
            {Array.isArray(result.suggestedPlacement.tags) && result.suggestedPlacement.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.suggestedPlacement.tags.map(tag => (
                  <Tag key={tag} style={{ margin: 0 }}>{tag}</Tag>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ─── Writing Materials ─── */}
      {result.writingMaterials && typeof result.writingMaterials === 'string' && (
        <Section icon={<EditOutlined />} title="写作素材">
          <Markdown>{result.writingMaterials}</Markdown>
        </Section>
      )}

      {/* Reusable writing material extracted from structured fields */}
      {result.writingAssets && typeof result.writingAssets === 'object' && (
        <Section icon={<SolutionOutlined />} title="可复用写作素材">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.isArray(result.writingAssets.usableClaims) && result.writingAssets.usableClaims.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-caption)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  可用论点
                </div>
                <List
                  size="small"
                  dataSource={result.writingAssets.usableClaims}
                  renderItem={(item: string) => (
                    <List.Item style={{ padding: '4px 0', border: 'none', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
                      {item}
                    </List.Item>
                  )}
                />
              </div>
            )}
            {result.writingAssets.possibleLiteratureReviewUse && typeof result.writingAssets.possibleLiteratureReviewUse === 'string' && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-caption)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  文献综述用途
                </div>
                <Markdown>{result.writingAssets.possibleLiteratureReviewUse}</Markdown>
              </div>
            )}
            {result.writingAssets.limitationsOrCritique && typeof result.writingAssets.limitationsOrCritique === 'string' && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-caption)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  局限与批评
                </div>
                <Markdown>{result.writingAssets.limitationsOrCritique}</Markdown>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ─── Todo List ─── */}
      {result.todoList && typeof result.todoList === 'string' && (
        <Section icon={<OrderedListOutlined />} title="待办事项">
          <Markdown>{result.todoList}</Markdown>
        </Section>
      )}

      {/* ─── Relation Analysis ─── */}
      {result.relationAnalysis && typeof result.relationAnalysis === 'string' && (
        <Section icon={<BookOutlined />} title="关联分析">
          <Markdown>{result.relationAnalysis}</Markdown>
        </Section>
      )}

      {/* ─── README Suggestions ─── */}
      {Array.isArray(result.readmeUpdateSuggestions) && result.readmeUpdateSuggestions.length > 0 && (
        <Section icon={<NumberOutlined />} title="README 更新建议">
          <List
            size="small"
            dataSource={result.readmeUpdateSuggestions}
            renderItem={(item: { section: string; suggestion: string; reason: string }) => (
              <List.Item style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px 0' }}>
                <div style={{ marginBottom: 4 }}>
                  <Tag color="blue">{item.section}</Tag>
                </div>
                <Typography.Text style={{ fontSize: 13.5 }}>{item.suggestion}</Typography.Text>
                {item.reason && (
                  <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 2 }}>
                    {item.reason}
                  </Typography.Text>
                )}
              </List.Item>
            )}
          />
        </Section>
      )}

      {/* ─── Add to KB button ─── */}
      {knowledgeBaseId && onAddToKB && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '8px 0',
        }}>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleOutlined />}
            onClick={onAddToKB}
            style={{
              height: 44,
              paddingInline: 32,
              fontFamily: 'var(--font-serif)',
              fontWeight: 600,
              fontSize: 14,
              borderRadius: 'var(--radius-md)',
            }}
          >
            确认收录到知识库
          </Button>
        </div>
      )}
    </div>
  )
}

/* ─── Reading Card sub-component ─── */

interface ReadingCardProps {
  content: unknown
}

type ContentKind = 'core' | 'method' | 'innovation' | 'limitation'

interface ParsedSection {
  title: string
  body: string
  kind: ContentKind
}

const KIND_META: Record<ContentKind, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  core: { label: '核心发现', icon: <StarOutlined />, color: '#5B7F6E', bg: 'rgba(91,127,110,0.05)' },
  method: { label: '方法与数据', icon: <ExperimentOutlined />, color: '#6B7FA0', bg: 'rgba(107,127,160,0.05)' },
  innovation: { label: '创新点', icon: <BulbOutlined />, color: '#B8860B', bg: 'rgba(184,134,11,0.05)' },
  limitation: { label: '局限性', icon: <WarningOutlined />, color: '#A07060', bg: 'rgba(160,112,96,0.05)' },
}

function classifySection(title: string): ContentKind {
  const t = title.toLowerCase()
  if (t.includes('conclusion') || t.includes('结论') || t.includes('finding') ||
      t.includes('summary') || t.includes('摘要') || t.includes('topic') || t.includes('核心') || t.includes('核心痛点') ||
      t.includes('core pain') || t.includes('one-line'))
    return 'core'
  if (t.includes('method') || t.includes('workflow') || t.includes('方法') ||
      t.includes('dataset') || t.includes('experiment') || t.includes('数据') ||
      t.includes('metric') || t.includes('setting'))
    return 'method'
  if (t.includes('innovation') || t.includes('创新') || t.includes('novel') ||
      t.includes('reference') || t.includes('贡献') || t.includes('key point'))
    return 'innovation'
  if (t.includes('limitation') || t.includes('局限') || t.includes('issue') ||
      t.includes('problem') || t.includes('不足'))
    return 'limitation'
  return 'core'
}

function stripNumbering(title: string): string {
  return title.replace(/^\d+[\.\)、]\s*/, '').trim()
}

function truncateBody(body: string, maxLen: number): string {
  const text = body.replace(/\n{3,}/g, '\n\n').trim()
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).replace(/\n\S*$/, '') + '…'
}

function parseReadingCard(content: string): ParsedSection[] {
  const lines = content.split('\n')
  const raw: { title: string; lines: string[] }[] = []
  let current: { title: string; lines: string[] } | null = null

  for (const line of lines) {
    const match = line.match(/^#{1,3}\s+(?:\d+[\.\)、]\s*)?(.+)/)
    if (match) {
      if (current) raw.push(current)
      current = { title: match[1].trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    } else if (line.trim()) {
      current = { title: '概要', lines: [line] }
    }
  }
  if (current) raw.push(current)

  // Deduplicate: if topic/summary section is a prefix of another section, drop it
  const sections: ParsedSection[] = []
  for (const r of raw) {
    const body = r.lines.join('\n').trim()
    if (!body) continue
    const title = stripNumbering(r.title)
    sections.push({ title, body, kind: classifySection(r.title) })
  }

  // Drop "topic summary" if other sections exist (redundant with Summary section)
  if (sections.length > 1) {
    const first = sections[0]
    if (first.kind === 'core' && (first.title.toLowerCase().includes('topic') || first.title.includes('概要'))) {
      sections.shift()
    }
  }

  return sections
}

function SectionCard({ section, accent }: { section: ParsedSection; accent: boolean }) {
  const meta = KIND_META[section.kind]
  return (
    <div style={{
      background: accent ? meta.bg : 'transparent',
      borderRadius: 'var(--radius-md)',
      padding: accent ? '14px 16px' : '10px 0',
      borderLeft: `3px solid ${accent ? meta.color : 'var(--border-light)'}`,
      paddingLeft: accent ? 16 : 14,
      transition: 'all var(--duration-fast)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ color: meta.color, fontSize: 13, display: 'flex' }}>{meta.icon}</span>
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 600,
          fontSize: 13,
          color: 'var(--ink-dense)',
        }}>
          {section.title}
        </span>
        {accent && (
          <Tag style={{ marginLeft: 'auto', fontSize: 10, padding: '0 5px', lineHeight: '18px' }} color={meta.color}>
            {meta.label}
          </Tag>
        )}
      </div>
      <Markdown>{truncateBody(section.body, 500)}</Markdown>
    </div>
  )
}

function ReadingCard({ content }: ReadingCardProps) {
  const text = typeof content === 'string' ? content : content == null ? '' : String(content)
  const sections = parseReadingCard(text)

  if (sections.length === 0) {
    return (
      <Section icon={<ReadOutlined />} title="阅读卡片">
        <Markdown>{truncateBody(text, 800)}</Markdown>
      </Section>
    )
  }

  // Find the "one-line summary" section to use as a callout
  const oneLiner = sections.find(s =>
    s.title.toLowerCase().includes('one-line') || s.title.includes('一句话')
  )
  const mainSections = sections.filter(s => s !== oneLiner)

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-light)',
        background: 'rgba(91, 127, 110, 0.03)',
      }}>
        <ReadOutlined style={{ color: 'var(--accent)', fontSize: 14 }} />
        <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, color: 'var(--ink-dense)', fontSize: 14 }}>
          阅读卡片
        </span>
      </div>

      {/* One-line summary callout */}
      {oneLiner && (
        <div style={{
          margin: '16px 20px 0',
          padding: '12px 16px',
          background: 'rgba(91, 127, 110, 0.06)',
          borderRadius: 'var(--radius-md)',
          borderLeft: '3px solid var(--accent)',
        }}>
          <Markdown>{truncateBody(oneLiner.body, 200)}</Markdown>
        </div>
      )}

      {/* Main sections */}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mainSections.map((section, i) => (
          <SectionCard key={i} section={section} accent={i === 0} />
        ))}
      </div>
    </div>
  )
}
