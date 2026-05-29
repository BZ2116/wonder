import { BaseAgent } from './base'

export interface MatchingInput {
  readingCard: string
  researchBackground: string
}

export interface MatchingOutput {
  matchingAnalysis: string
}

const SYSTEM_PROMPT = `
You are a Chinese research direction matching agent.
Your task is to analyze how a research paper relates to the user's specific research background and interests.
Requirements:
1. Analyze relevance from multiple dimensions.
2. Be specific and actionable.
3. Output in Chinese.
4. Do not fabricate information not in the reading card.
`

export class MatchingAgent extends BaseAgent<MatchingInput, MatchingOutput> {
  async run(input: MatchingInput, onChunk?: (text: string) => void): Promise<MatchingOutput> {
    const matchingAnalysis = await this.call(SYSTEM_PROMPT, `
User's research background:
${input.researchBackground}

Research reading card:
${input.readingCard}

Please analyze the match between this paper and the user's research direction.

Output format:

# 研究方向匹配分析

## 1. 相关性评分
给出 1-5 分的相关性评分，并说明理由。

## 2. 研究主题契合度
分析该论文的研究主题与用户研究方向的契合程度。

## 3. 方法论借鉴价值
该论文的方法论对用户研究有何借鉴意义。

## 4. 潜在合作点
列出 2-3 个可以与用户研究结合的具体方向。

## 5. 建议
给出是否值得深入阅读的建议，以及阅读优先级。
`, onChunk)
    return { matchingAnalysis }
  }
}
