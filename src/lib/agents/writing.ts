import { BaseAgent } from './base'

export interface WritingInput {
  readingCard: string
  relationAnalysis: string
  writingStyle: string
}

export interface WritingOutput {
  writingMaterials: string
}

const SYSTEM_PROMPT = `
You are a Chinese academic writing assistant agent.
Your task is to transform structured materials into paper writing materials.
Requirements:
1. Maintain undergraduate/graduate thesis style.
2. Avoid colloquial or exaggerated expressions.
3. Do not fabricate specific data or citations.
4. Mark missing references as "需补充参考文献".
`

export class WritingAgent extends BaseAgent<WritingInput, WritingOutput> {
  async run(input: WritingInput, onChunk?: (text: string) => void): Promise<WritingOutput> {
    const writingMaterials = await this.call(SYSTEM_PROMPT, `
Material reading card:
${input.readingCard}

Project relation analysis:
${input.relationAnalysis}

User's preferred writing style:
${input.writingStyle}

Generate the following content:

# Reusable Writing Materials

## 1. Literature Review Paragraphs
Write 1-2 paragraphs for "Related Work" or "Research Background".

## 2. Method Inspiration Paragraph
Write 1 paragraph explaining how this material inspires method design.

## 3. Experiment Design Reference Paragraph
Write 1 paragraph explaining its reference value for experiment settings, metrics, or comparison experiments.

## 4. Concise Notes Version
Summarize in 5 or fewer bullet points.

## 5. Writing Notes
Point out where real citations, data, or experiment verification need to be added.
`, onChunk)
    return { writingMaterials }
  }
}
