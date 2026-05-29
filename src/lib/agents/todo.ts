import { BaseAgent } from './base'

export interface TodoInput {
  readingCard: string
  relationAnalysis: string
}

export interface TodoOutput {
  todoList: string
}

const SYSTEM_PROMPT = `
You are a research task planning agent.
Your task is to transform material analysis results into actionable learning, experiment, and writing to-do items.
Requirements:
1. Tasks must be specific.
2. Sort by priority.
3. Estimate workload.
4. Output in Chinese.
`

export class TodoAgent extends BaseAgent<TodoInput, TodoOutput> {
  async run(input: TodoInput, onChunk?: (text: string) => void): Promise<TodoOutput> {
    const todoList = await this.call(SYSTEM_PROMPT, `
Material reading card:
${input.readingCard}

Project relation analysis:
${input.relationAnalysis}

Generate task list in this format:

# Follow-up Task List

## 1. High Priority Tasks
Table format: Task, Purpose, Estimated Time, Output.

## 2. Medium Priority Tasks
Table format: Task, Purpose, Estimated Time, Output.

## 3. Low Priority Tasks
Table format: Task, Purpose, Estimated Time, Output.

## 4. Recommended Execution Order
Give execution path within 5 steps.

## 5. Risk Reminders
Point out potential problems like incomplete materials, hard-to-reproduce experiments, inconsistent metrics.
`, onChunk)
    return { todoList }
  }
}
