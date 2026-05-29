import { BaseAgent } from './base'

export interface LiteratureInput {
  textChunks: string[]
}

export interface LiteratureOutput {
  readingCard: string
}

const SYSTEM_PROMPT = `
You are a rigorous Chinese research material analysis agent.
Your task is to extract structured information from papers, technical documents, or experiment records.
Requirements:
1. Do not fabricate information not in the original text.
2. Mark uncertain content as "文中未明确说明".
3. Output in Chinese.
4. Do not output lengthy reasoning, only structured results.
`

export class LiteratureParserAgent extends BaseAgent<LiteratureInput, LiteratureOutput> {
  async run(input: LiteratureInput, onChunk?: (text: string) => void): Promise<LiteratureOutput> {
    const partialSummaries: string[] = []

    for (const [index, chunk] of input.textChunks.entries()) {
      const result = await this.call(SYSTEM_PROMPT, fragmentPrompt(chunk), text => {
        onChunk?.(`[文献分块 ${index + 1}/${input.textChunks.length}] ${text}`)
      })
      partialSummaries.push(result)
    }

    const readingCard = await this.call(SYSTEM_PROMPT, mergePrompt(partialSummaries), onChunk)
    return { readingCard }
  }
}

function fragmentPrompt(chunk: string): string {
  return `
Please read the following material fragment and extract structured information.

Fragment:
${chunk}

Output format:

## Fragment Core Information
- Research Background:
- Core Problem:
- Method/System Design:
- Dataset/Experiment Objects:
- Metrics/Evaluation:
- Key Conclusions:
- Reusable Content:
- Uncertain/Missing Information:
`
}

function mergePrompt(partialSummaries: string[]): string {
  return `
The following are analysis results from different fragments of the same material.
Please deduplicate, integrate, and reorganize into a complete research reading card.

Fragment Analysis Results:
${partialSummaries.join('\n')}

Output strictly in this format:

# Research Material Reading Card

## 1. Topic Summary
Summarize what this material researches or discusses in 3-5 sentences.

## 2. Core Pain Points
Explain the key problems this material tries to solve.

## 3. Method/System Workflow
Describe the technical route, model structure, algorithm logic, or system design in order.

## 4. Datasets, Experiment Settings & Metrics
Organize data sources, experiment settings, evaluation metrics, and comparison objects.

## 5. Main Conclusions
List 3-6 conclusions.

## 6. Innovations or Reference Points
Explain what reusable value this material has for research, course projects, paper writing, or code implementation.

## 7. Limitations & Potential Issues
Point out possible shortcomings in methods, experiments, or arguments.

## 8. One-line Summary
Summarize the value of this material in one sentence.
`
}
