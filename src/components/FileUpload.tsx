import { InboxOutlined } from '@ant-design/icons'
import { Upload, message } from 'antd'
import type { UploadProps } from 'antd'

interface Props {
  onFileContent: (fileName: string, fileType: string, content: string) => void
}

export default function FileUpload({ onFileContent }: Props) {
  const props: UploadProps = {
    accept: '.pdf,.docx,.txt,.md',
    beforeUpload: async (file) => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'txt' || ext === 'md') {
        const text = await file.text()
        onFileContent(file.name, ext, text)
      } else if (ext === 'pdf') {
        const text = `[PDF file: ${file.name}] - parsing not yet integrated`
        onFileContent(file.name, 'pdf', text)
      } else if (ext === 'docx') {
        const text = `[DOCX file: ${file.name}] - parsing not yet integrated`
        onFileContent(file.name, 'docx', text)
      } else {
        message.error('不支持的文件格式')
      }
      return false
    },
    showUploadList: false,
  }

  return (
    <Upload.Dragger {...props} style={{ padding: '40px 0' }}>
      <p className="ant-upload-drag-icon"><InboxOutlined /></p>
      <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
      <p className="ant-upload-hint">支持 PDF、DOCX、TXT、Markdown 格式</p>
    </Upload.Dragger>
  )
}
