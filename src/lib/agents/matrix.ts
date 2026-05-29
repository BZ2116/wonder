import { BaseAgent } from './base'

export interface MatrixInput {
  readingCards: Array<{ fileName: string; readingCard: string }>
  researchBackground: string
}

export interface MatrixOutput {
  matrix: string
}

const SYSTEM_PROMPT = `
You are a rigorous Chinese research comparison agent.
Your task is to produce a structured cross-comparison (横向对比) table from multiple research reading cards.
Requirements:
1. Do not fabricate information not in the reading cards.
2. Mark missing information as "文中未明确说明".
3. Output in Chinese.
4. Use markdown table format.
5. Be concise but complete.
`

function matrixPrompt(readingCards: Array<{ fileName: string; readingCard: string }>, researchBackground: string): string {
  const cardsText = readingCards
    .map(({ fileName, readingCard }) => `### File: ${fileName}\n\n${readingCard}`)
    .join('\n\n---\n\n')

  return `
Research Background:
${researchBackground}

The following are reading cards from ${readingCards.length} different research materials.
Please compare them and produce a structured cross-comparison table.

Reading Cards:
${cardsText}

Output strictly in this format:

# 文献横向对比矩阵

## 对比总表

| 论文 | 研究主题 | 核心方法 | 数据集 | 主要结论 | 局限性 |
|------|----------|----------|--------|----------|--------|
| (file name) | ... | ... | ... | ... | ... |

## 差异分析

Summarize the key differences and commonalities across these materials in 3-5 bullet points.

## 研究空白

Based on the comparison, identify 2-3 potential research gaps or opportunities.
`
}

export class MatrixAgent extends BaseAgent<MatrixInput, MatrixOutput> {
  async run(input: MatrixInput, onChunk?: (text: string) => void): Promise<MatrixOutput> {
    const matrix = await this.call(
      SYSTEM_PROMPT,
      matrixPrompt(input.readingCards, input.researchBackground),
      onChunk,
    )
    return { matrix }
  }
}
