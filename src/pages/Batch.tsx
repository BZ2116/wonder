import { useEffect, useRef } from 'react'
import { Card, Typography, Button, Progress, Empty, Tag, Space, Table, message } from 'antd'
import {
  InboxOutlined, PlayCircleOutlined, FileTextOutlined,
  CheckCircleOutlined, LoadingOutlined, CloseCircleOutlined,
  StopOutlined, CloseOutlined, CopyOutlined, DownloadOutlined,
} from '@ant-design/icons'
import ApiGuard from '../components/ApiGuard'
import { useBatchStore, type BatchItemStatus } from '../stores/batch'
import { api } from '../services/api'
import {
  extractMatrixRow, exportMatrixCSV, exportMatrixMarkdown,
  MATRIX_DIMENSIONS, DIMENSION_LABELS,
  type MatrixRow,
} from '../lib/batch/matrix'

export default function Batch() {
  const {
    runId, runName, items, running,
    matrixRows, matrixLoading,
    createRun, startExecution, cancelItem, cancelAll, reset,
    setMatrixRows, setMatrixLoading,
  } = useBatchStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<File[]>([])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    filesRef.current = Array.from(files)
    const defaultName = `批量分析 ${new Date().toLocaleString('zh-CN')}`
    createRun(defaultName, filesRef.current).catch(err => {
      message.error(`创建批次失败: ${err.message}`)
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files.length === 0) return
    filesRef.current = Array.from(files)
    const defaultName = `批量分析 ${new Date().toLocaleString('zh-CN')}`
    createRun(defaultName, filesRef.current).catch(err => {
      message.error(`创建批次失败: ${err.message}`)
    })
  }

  const handleStart = () => {
    setMatrixRows([])
    startExecution().catch(err => {
      message.error(`执行失败: ${err.message}`)
    })
  }

  // Build matrix when all items finish
  const buildMatrix = async () => {
    const doneItems = items.filter(i => i.status === 'done' && i.historyId)
    if (doneItems.length === 0) return

    setMatrixLoading(true)
    try {
      const rows: MatrixRow[] = []
      for (const item of doneItems) {
        try {
          const history = await api.get<{ result: string }>(`/api/history/${item.historyId}`)
          const analysisResult = JSON.parse(history.result)
          rows.push(extractMatrixRow(item.documentId || item.id, item.fileName, analysisResult))
        } catch {
          rows.push(extractMatrixRow(item.id, item.fileName, {}))
        }
      }
      setMatrixRows(rows)
    } finally {
      setMatrixLoading(false)
    }
  }

  // Auto-build matrix when execution finishes
  const allFinished = !running && items.length > 0 && items.every(i => ['done', 'error', 'cancelled'].includes(i.status))
  const hasDoneItems = items.some(i => i.status === 'done')

  useEffect(() => {
    if (allFinished && hasDoneItems && matrixRows.length === 0) {
      buildMatrix()
    }
  }, [allFinished, hasDoneItems, matrixRows.length, items])

  const handleCopyMarkdown = () => {
    const md = exportMatrixMarkdown(matrixRows)
    navigator.clipboard.writeText(md).then(() => {
      message.success('已复制到剪贴板')
    })
  }

  const handleExportCSV = () => {
    const csv = exportMatrixCSV(matrixRows)
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `batch-matrix-${runId?.slice(0, 8) || 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const doneCount = items.filter(i => i.status === 'done').length
  const totalCount = items.length
  const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  const statusIcon = (status: BatchItemStatus) => {
    switch (status) {
      case 'pending': return <FileTextOutlined style={{ color: 'var(--ink-ghost)' }} />
      case 'parsing': return <LoadingOutlined style={{ color: 'var(--accent)' }} />
      case 'analyzing': return <LoadingOutlined style={{ color: 'var(--accent)' }} />
      case 'done': return <CheckCircleOutlined style={{ color: 'var(--success)' }} />
      case 'error': return <CloseCircleOutlined style={{ color: 'var(--danger)' }} />
      case 'cancelled': return <CloseOutlined style={{ color: 'var(--ink-faint)' }} />
    }
  }

  const statusTag = (status: BatchItemStatus) => {
    const map: Record<BatchItemStatus, { color: string; text: string }> = {
      pending: { color: 'default', text: '待处理' },
      parsing: { color: 'processing', text: '解析中' },
      analyzing: { color: 'processing', text: '分析中' },
      done: { color: 'success', text: '已完成' },
      error: { color: 'error', text: '失败' },
      cancelled: { color: 'default', text: '已取消' },
    }
    const { color, text } = map[status]
    return <Tag color={color}>{text}</Tag>
  }

  // Table columns for the matrix
  const matrixColumns = [
    {
      title: '文档',
      dataIndex: 'fileName',
      key: 'fileName',
      width: 160,
      ellipsis: true,
    },
    ...MATRIX_DIMENSIONS.map(dim => ({
      title: DIMENSION_LABELS[dim],
      dataIndex: dim,
      key: dim,
      width: 200,
      ellipsis: true,
    })),
  ]

  return (
    <ApiGuard require="analysis">
    <div className="wonder-page wonder-stagger">
      <div className="wonder-page-header">
        <Typography.Title level={4}>批量矩阵</Typography.Title>
        <Typography.Text type="secondary">同时分析多个文档，生成对比矩阵</Typography.Text>
      </div>

      {/* File drop zone — shown when no run is active */}
      {!runId && (
        <div
          className="wonder-upload-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <div className="wonder-upload-icon"><InboxOutlined /></div>
          <div className="wonder-upload-text">拖拽多个文件到此处，或点击选择</div>
          <div className="wonder-upload-hint">支持 PDF、DOCX、TXT、Markdown 格式</div>
        </div>
      )}

      {/* Execution panel */}
      {runId && items.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Space>
              <Typography.Text style={{ color: 'var(--ink-caption)', fontSize: 13 }}>
                {runName}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                共 {totalCount} 个文件，已完成 {doneCount} 个
              </Typography.Text>
            </Space>
            <Space>
              {running && (
                <Button
                  icon={<StopOutlined />}
                  onClick={cancelAll}
                  danger
                >
                  全部取消
                </Button>
              )}
              {!running && items.every(i => i.status !== 'pending') && (
                <Button onClick={reset}>
                  新建批次
                </Button>
              )}
              {!running && items.some(i => i.status === 'pending') && (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={handleStart}
                >
                  开始分析
                </Button>
              )}
            </Space>
          </div>

          {running && (
            <Progress
              percent={percent}
              status="active"
              style={{ marginBottom: 16 }}
              format={() => `${doneCount}/${totalCount}`}
            />
          )}

          <div>
            {items.map((item) => (
              <div key={item.id} style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 12px',
                borderBottom: '1px solid var(--border-light)',
                gap: 12,
              }}>
                {statusIcon(item.status)}
                <span style={{ flex: 1, color: 'var(--ink-secondary)', fontSize: 14 }}>
                  {item.fileName}
                </span>
                {item.error && (
                  <Typography.Text type="danger" style={{ fontSize: 12, maxWidth: 200 }} ellipsis>
                    {item.error}
                  </Typography.Text>
                )}
                {statusTag(item.status)}
                {(item.status === 'parsing' || item.status === 'analyzing') && (
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={() => cancelItem(item.id)}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Matrix view */}
      {allFinished && hasDoneItems && (
        <Card
          style={{ marginTop: 16 }}
          title="对比矩阵"
          extra={
            <Space>
              <Button
                icon={<CopyOutlined />}
                onClick={handleCopyMarkdown}
                disabled={matrixRows.length === 0}
              >
                复制 Markdown
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExportCSV}
                disabled={matrixRows.length === 0}
              >
                导出 CSV
              </Button>
            </Space>
          }
        >
          {matrixLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <LoadingOutlined style={{ fontSize: 24 }} />
              <div style={{ marginTop: 8, color: 'var(--ink-caption)' }}>正在生成矩阵...</div>
            </div>
          ) : matrixRows.length > 0 ? (
            <Table
              dataSource={matrixRows}
              columns={matrixColumns}
              rowKey="documentId"
              scroll={{ x: 'max-content' }}
              size="small"
              pagination={false}
            />
          ) : (
            <Empty description="无法生成矩阵" />
          )}
        </Card>
      )}

      {items.length === 0 && !runId && (
        <Empty
          description={
            <span style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-serif)' }}>
              拖拽文件到上方区域开始批量分析
            </span>
          }
          style={{ marginTop: 40 }}
        />
      )}
    </div>
    </ApiGuard>
  )
}
