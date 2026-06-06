import { describe, it, expect } from 'vitest'
import { normalizeAnalysisResult } from '../normalize'

describe('normalizeAnalysisResult', () => {
  it('returns null for null/undefined input', () => {
    expect(normalizeAnalysisResult(null)).toBeNull()
    expect(normalizeAnalysisResult(undefined)).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(normalizeAnalysisResult('string')).toBeNull()
    expect(normalizeAnalysisResult(42)).toBeNull()
    expect(normalizeAnalysisResult(true)).toBeNull()
  })

  it('returns null for arrays', () => {
    expect(normalizeAnalysisResult([])).toBeNull()
    expect(normalizeAnalysisResult([1, 2, 3])).toBeNull()
  })

  it('returns null for objects without recognizable fields', () => {
    expect(normalizeAnalysisResult({ foo: 'bar' })).toBeNull()
  })

  describe('nested format', () => {
    it('extracts fields from literature/relation/writing structure', () => {
      const input = {
        literature: {
          summary: 'Test summary',
          readingCard: 'Card content',
          fitScore: 0.85,
          fitReason: 'Good fit',
          action: 'add',
          tags: ['ai', 'ml'],
          matchScore: 0.9,
          matchReason: 'Match reason',
        },
        relation: {
          relationAnalysis: 'Related to doc X',
          relationToExistingDocs: { type: 'supplement', reason: 'r', relatedDocumentIds: ['1'] },
        },
        writing: {
          writingAssets: {
            usableClaims: ['claim1'],
            methodReferences: ['ref1'],
            theoryReferences: ['theory1'],
            possibleLiteratureReviewUse: 'use',
            limitationsOrCritique: 'limitation',
          },
          writingMaterials: 'materials',
        },
        readmeSuggestions: [{ section: 'sec', suggestion: 'sug', reason: 'rea' }],
        paperTitle: 'My Paper',
        todo_list: 'todo item',
      }

      const result = normalizeAnalysisResult(input)
      expect(result).not.toBeNull()
      expect(result!.summary).toBe('Test summary')
      expect(result!.readingCard).toBe('Card content')
      expect(result!.knowledgeBaseFitScore).toBe(0.85)
      expect(result!.fitReason).toBe('Good fit')
      expect(result!.recommendedAction).toBe('add')
      expect(result!.tags).toEqual(['ai', 'ml'])
      expect(result!.matchScore).toBe(0.9)
      expect(result!.matchReason).toBe('Match reason')
      expect(result!.relationAnalysis).toBe('Related to doc X')
      expect(result!.relationToExistingDocs).toEqual({ type: 'supplement', reason: 'r', relatedDocumentIds: ['1'] })
      expect(result!.writingAssets).toEqual({
        usableClaims: ['claim1'],
        methodReferences: ['ref1'],
        theoryReferences: ['theory1'],
        possibleLiteratureReviewUse: 'use',
        limitationsOrCritique: 'limitation',
      })
      expect(result!.writingMaterials).toBe('materials')
      expect(result!.readmeUpdateSuggestions).toEqual([{ section: 'sec', suggestion: 'sug', reason: 'rea' }])
      expect(result!.paperTitle).toBe('My Paper')
      expect(result!.todoList).toBe('todo item')
    })

    it('handles missing relation/writing gracefully', () => {
      const input = { literature: { summary: 's', readingCard: 'c' } }
      const result = normalizeAnalysisResult(input)
      expect(result).not.toBeNull()
      expect(result!.summary).toBe('s')
      expect(result!.relationToExistingDocs).toBeUndefined()
      expect(result!.writingAssets).toBeUndefined()
    })
  })

  describe('flat snake_case format', () => {
    it('converts snake_case fields to camelCase', () => {
      const input = {
        summary: 'Test summary',
        reading_card: 'Card content',
        fit_score: 0.75,
        fit_reason: 'Reason',
        relation_type: 'supplement',
        relation_analysis: 'analysis',
        writing_materials: 'materials',
        todo_list: 'todo',
        novelty_for_kb: 'novel',
        recommended_action: 'deep_read',
        suggested_placement: { sub_direction: 'sub', tags: ['t1'] },
        readme_suggestions: [{ section: 's', suggestion: 'sg', reason: 'r' }],
        writing_assets: {
          usable_claims: ['c1'],
          method_references: ['m1'],
          theory_references: ['t1'],
          possible_literature_review_use: 'use',
          limitations_or_critique: 'crit',
        },
        tags: ['tag1'],
        paper_title: 'Paper Title',
      }

      const result = normalizeAnalysisResult(input)
      expect(result).not.toBeNull()
      expect(result!.summary).toBe('Test summary')
      expect(result!.readingCard).toBe('Card content')
      expect(result!.knowledgeBaseFitScore).toBe(0.75)
      expect(result!.fitReason).toBe('Reason')
      expect(result!.relationToExistingDocs).toEqual({
        type: 'supplement',
        reason: 'Reason',
        relatedDocumentIds: [],
      })
      expect(result!.relationAnalysis).toBe('analysis')
      expect(result!.writingMaterials).toBe('materials')
      expect(result!.todoList).toBe('todo')
      expect(result!.noveltyForKnowledgeBase).toBe('novel')
      expect(result!.recommendedAction).toBe('deep_read')
      expect(result!.suggestedPlacement).toEqual({ subDirection: 'sub', tags: ['t1'] })
      expect(result!.readmeUpdateSuggestions).toEqual([{ section: 's', suggestion: 'sg', reason: 'r' }])
      expect(result!.writingAssets).toEqual({
        usableClaims: ['c1'],
        methodReferences: ['m1'],
        theoryReferences: ['t1'],
        possibleLiteratureReviewUse: 'use',
        limitationsOrCritique: 'crit',
      })
      expect(result!.tags).toEqual(['tag1'])
      expect(result!.paperTitle).toBe('Paper Title')
    })
  })

  describe('flat camelCase format', () => {
    it('passes through camelCase fields', () => {
      const input = {
        summary: 'Test summary',
        readingCard: 'Card content',
        knowledgeBaseFitScore: 0.9,
        fitReason: 'Reason',
        relationType: 'duplicate',
        relationAnalysis: 'analysis',
        writingMaterials: 'materials',
        todoList: 'todo',
        noveltyForKnowledgeBase: 'novel',
        recommendedAction: 'add',
        suggestedPlacement: { subDirection: 'sub', tags: ['t1'] },
        readmeUpdateSuggestions: [{ section: 's', suggestion: 'sg', reason: 'r' }],
        writingAssets: {
          usableClaims: ['c1'],
          methodReferences: ['m1'],
          theoryReferences: ['t1'],
          possibleLiteratureReviewUse: 'use',
          limitationsOrCritique: 'crit',
        },
        tags: ['tag1'],
        paperTitle: 'Paper Title',
      }

      const result = normalizeAnalysisResult(input)
      expect(result).not.toBeNull()
      expect(result!.summary).toBe('Test summary')
      expect(result!.readingCard).toBe('Card content')
      expect(result!.knowledgeBaseFitScore).toBe(0.9)
      expect(result!.fitReason).toBe('Reason')
      expect(result!.relationToExistingDocs).toEqual({
        type: 'duplicate',
        reason: 'Reason',
        relatedDocumentIds: [],
      })
      expect(result!.relationAnalysis).toBe('analysis')
      expect(result!.writingMaterials).toBe('materials')
      expect(result!.todoList).toBe('todo')
      expect(result!.noveltyForKnowledgeBase).toBe('novel')
      expect(result!.recommendedAction).toBe('add')
      expect(result!.suggestedPlacement).toEqual({ subDirection: 'sub', tags: ['t1'] })
      expect(result!.readmeUpdateSuggestions).toEqual([{ section: 's', suggestion: 'sg', reason: 'r' }])
      expect(result!.writingAssets).toEqual({
        usableClaims: ['c1'],
        methodReferences: ['m1'],
        theoryReferences: ['t1'],
        possibleLiteratureReviewUse: 'use',
        limitationsOrCritique: 'crit',
      })
      expect(result!.tags).toEqual(['tag1'])
      expect(result!.paperTitle).toBe('Paper Title')
    })
  })

  describe('minimal input', () => {
    it('handles object with only summary', () => {
      const result = normalizeAnalysisResult({ summary: 'Just a summary' })
      expect(result).not.toBeNull()
      expect(result!.summary).toBe('Just a summary')
      expect(result!.readingCard).toBe('')
    })

    it('handles object with only reading_card', () => {
      const result = normalizeAnalysisResult({ reading_card: 'card only' })
      expect(result).not.toBeNull()
      expect(result!.readingCard).toBe('card only')
      expect(result!.summary).toBe('')
    })

    it('handles object with only readingCard', () => {
      const result = normalizeAnalysisResult({ readingCard: 'camelCard' })
      expect(result).not.toBeNull()
      expect(result!.readingCard).toBe('camelCard')
    })
  })

  describe('runtime safety', () => {
    it('converts unexpected scalar fields and drops unsafe arrays', () => {
      const result = normalizeAnalysisResult({
        summary: { text: 'object summary' },
        readingCard: ['card', 'parts'],
        fit_score: '72',
        suggestedPlacement: { subDirection: { name: 'systems' }, tags: ['ai', { value: 'rag' }, null] },
        readmeUpdateSuggestions: [
          { section: { name: 'Scope' }, suggestion: ['Add boundary'], reason: null },
          'bad item',
        ],
        writingAssets: {
          usableClaims: ['claim', { nested: true }],
          possibleLiteratureReviewUse: { use: 'review' },
        },
      })

      expect(result).not.toBeNull()
      expect(result!.summary).toBe('{"text":"object summary"}')
      expect(result!.readingCard).toBe('["card","parts"]')
      expect(result!.knowledgeBaseFitScore).toBe(72)
      expect(result!.suggestedPlacement).toEqual({
        subDirection: '{"name":"systems"}',
        tags: ['ai'],
      })
      expect(result!.readmeUpdateSuggestions).toEqual([
        { section: '{"name":"Scope"}', suggestion: '["Add boundary"]', reason: '' },
      ])
      expect(result!.writingAssets?.usableClaims).toEqual(['claim'])
      expect(result!.writingAssets?.possibleLiteratureReviewUse).toBe('{"use":"review"}')
    })
  })

  describe('priority of snake_case vs camelCase', () => {
    it('prefers snake_case over camelCase for reading_card', () => {
      const result = normalizeAnalysisResult({ reading_card: 'snake', readingCard: 'camel' })
      expect(result!.readingCard).toBe('snake')
    })

    it('prefers snake_case over camelCase for fit_score', () => {
      const result = normalizeAnalysisResult({ summary: 's', fit_score: 1, knowledgeBaseFitScore: 2 })
      expect(result!.knowledgeBaseFitScore).toBe(1)
    })
  })

  describe('decision brief and focused signals', () => {
    it('normalizes decision brief and focused signals from snake_case analysis results', () => {
      const result = normalizeAnalysisResult({
        summary: 'summary',
        reading_card: 'card',
        decision_brief: {
          verdict: 'deep_read',
          confidence: 82,
          best_use: 'method_reference',
          why_it_matters: ['method matters'],
          key_takeaways: ['takeaway'],
          novelty_points: ['novel'],
          overlap_points: ['overlap'],
          conflict_or_risk_points: ['risk'],
          next_action: 'read method section',
        },
        focused_signals: [{
          text: 'Reusable method',
          signal_type: 'method',
          section_type: 'method',
          chunk_index: 1,
          evidence_hint: 'method module',
        }],
        knowledge_increment_score: 74,
        evidence_strength_score: 68,
        actionability_score: 88,
      })

      expect(result?.decisionBrief).toEqual({
        verdict: 'deep_read',
        confidence: 82,
        bestUse: 'method_reference',
        whyItMatters: ['method matters'],
        keyTakeaways: ['takeaway'],
        noveltyPoints: ['novel'],
        overlapPoints: ['overlap'],
        conflictOrRiskPoints: ['risk'],
        nextAction: 'read method section',
      })
      expect(result?.focusedSignals).toEqual([{
        text: 'Reusable method',
        signalType: 'method',
        sectionType: 'method',
        chunkIndex: 1,
        evidenceHint: 'method module',
      }])
      expect(result?.knowledgeIncrementScore).toBe(74)
      expect(result?.evidenceStrengthScore).toBe(68)
      expect(result?.actionabilityScore).toBe(88)
    })

    it('normalizes decision brief from camelCase SSE results', () => {
      const result = normalizeAnalysisResult({
        summary: 'summary',
        readingCard: 'card',
        decisionBrief: {
          verdict: 'skim',
          confidence: 55,
          bestUse: 'background',
          whyItMatters: ['background only'],
          keyTakeaways: [],
          noveltyPoints: [],
          overlapPoints: ['already covered'],
          conflictOrRiskPoints: [],
          nextAction: 'record short note',
        },
        knowledgeIncrementScore: 25,
        evidenceStrengthScore: 40,
        actionabilityScore: 50,
      })

      expect(result?.decisionBrief?.verdict).toBe('skim')
      expect(result?.decisionBrief?.bestUse).toBe('background')
      expect(result?.knowledgeIncrementScore).toBe(25)
    })
  })
})
