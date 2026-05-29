import { BaseAgent } from './base'

export interface RelationInput {
  readingCard: string
  researchBackground: string
}

export interface RelationOutput {
  relationAnalysis: string
}

const SYSTEM_PROMPT = `
You are a Chinese research project relation analysis agent.
Your task is to evaluate how a material relates to a user's current research or learning project.
Requirements:
1. Be concrete and avoid forced relevance.
2. Output in Chinese.
3. Distinguish directly usable content from only background reference value.
`

export class ProjectRelationAgent extends BaseAgent<RelationInput, RelationOutput> {
  async run(input: RelationInput, onChunk?: (text: string) => void): Promise<RelationOutput> {
    const relationAnalysis = await this.call(SYSTEM_PROMPT, `
User's current research/learning background:
${input.researchBackground}

Material reading card:
${input.readingCard}

Generate project relation analysis in this format:

# Project Relation Analysis

## 1. Relevance Score
Rate 0-5 and explain why.
- 0: Basically irrelevant
- 1: Weakly relevant
- 2: Some reference value
- 3: Moderately relevant
- 4: Highly relevant
- 5: Directly usable in current project

## 2. Content for Literature Review
What content is suitable for research background or related work.

## 3. Content for Method Design
What ideas, modules, workflows, metrics, or experiment settings can be transferred.

## 4. Content for Experiment Comparison
Whether it can serve as baseline, comparison method, metric reference, or ablation study reference.

## 5. Differences from Current Project
Explain differences between this material and user's project to avoid forced application.

## 6. Key Points for Citation/Recording
List bullet points reusable for paper writing, proposal, or defense.
`, onChunk)
    return { relationAnalysis }
  }
}
