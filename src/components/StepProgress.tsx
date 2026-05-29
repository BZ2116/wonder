import { Steps } from 'antd'
import { LoadingOutlined, CheckCircleOutlined } from '@ant-design/icons'

interface Step {
  step: string
  status: 'running' | 'done' | 'error'
  label: string
}

interface Props {
  steps: Step[]
}

export default function StepProgress({ steps }: Props) {
  const items = steps.map(s => ({
    title: s.label,
    status: s.status === 'done' ? 'finish' as const : s.status === 'error' ? 'error' as const : 'process' as const,
    icon: s.status === 'running' ? <LoadingOutlined /> : undefined,
  }))

  return <Steps current={steps.length - 1} items={items} />
}
