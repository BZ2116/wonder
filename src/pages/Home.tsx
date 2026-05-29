import { Card, Typography, Result, Button } from 'antd'
import FileUpload from '../components/FileUpload'
import StepProgress from '../components/StepProgress'
import { useAnalysisStore } from '../stores/analysis'
import { useConfigStore } from '../stores/config'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()
  const { config, loadConfig, loaded } = useConfigStore()
  const { steps, running, documentId, analyze, reset } = useAnalysisStore()

  useEffect(() => { loadConfig() }, [loadConfig])

  if (loaded && !config) {
    return (
      <Result
        status="warning"
        title="尚未配置 API"
        subTitle="请先完成初始配置"
        extra={<Button type="primary" onClick={() => navigate('/welcome')}>去配置</Button>}
      />
    )
  }

  const handleFile = (fileName: string, fileType: string, text: string) => {
    reset()
    analyze(fileName, fileType, text)
  }

  return (
    <div>
      <Typography.Title level={4}>文档分析</Typography.Title>
      <Card>
        <FileUpload onFileContent={handleFile} />
      </Card>
      {steps.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <StepProgress steps={steps} />
        </Card>
      )}
      {documentId && (
        <Card style={{ marginTop: 16 }}>
          <Typography.Text>分析完成！文档 ID: {documentId}</Typography.Text>
        </Card>
      )}
    </div>
  )
}
