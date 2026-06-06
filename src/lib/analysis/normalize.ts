import type { AnalysisResult } from '../../types/analysis'

/* ─── Runtime-safe helpers ─── */

function asString(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v
  if (v == null) return fallback
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return fallback
    }
  }
  return String(v)
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return []
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Normalize raw analysis data to the canonical camelCase AnalysisResult type.
 * Supports three input shapes:
 *   1. Nested: { literature, relation, writing, readmeSuggestions }
 *   2. Flat snake_case (Python backend direct output)
 *   3. Flat camelCase (SSE complete event / old records)
 * Returns null for invalid or unrecognizable input.
 */
export function normalizeAnalysisResult(input: unknown): AnalysisResult | null {
  if (!isObject(input)) return null

  const raw = input

  // 1. Legacy nested format
  if (isObject(raw.literature)) {
    const lit = raw.literature
    const rel = isObject(raw.relation) ? raw.relation : {}
    const wri = isObject(raw.writing) ? raw.writing : {}

    const writingAssets = isObject(wri.writingAssets) ? normalizeWritingAssets(wri.writingAssets) : undefined

    return {
      summary: asString(lit.summary),
      paperTitle: asString(raw.paperTitle) || asString(raw.paper_title) || undefined,
      readingCard: asString(lit.readingCard),
      knowledgeBaseFitScore: asNumber(lit.fitScore),
      fitReason: asString(lit.fitReason) || undefined,
      recommendedAction: (asString(lit.action) || undefined) as AnalysisResult['recommendedAction'],
      tags: asStringArray(lit.tags),
      relationToExistingDocs: normalizeRelation(rel.relationToExistingDocs),
      relationAnalysis: asString(rel.relationAnalysis) || undefined,
      writingAssets,
      writingMaterials: asString(wri.writingMaterials) || undefined,
      readmeUpdateSuggestions: normalizeReadmeSuggestions(raw.readmeSuggestions),
      todoList: asString(raw.todo_list) || asString(lit.todoList) || undefined,
      matchScore: asNumber(lit.matchScore),
      matchReason: asString(lit.matchReason) || undefined,
      decisionBrief: normalizeDecisionBrief(raw.decisionBrief) || normalizeDecisionBrief(raw.decision_brief),
      focusedSignals: normalizeFocusedSignals(raw.focusedSignals) || normalizeFocusedSignals(raw.focused_signals),
      knowledgeIncrementScore: asNumber(raw.knowledgeIncrementScore) ?? asNumber(raw.knowledge_increment_score),
      evidenceStrengthScore: asNumber(raw.evidenceStrengthScore) ?? asNumber(raw.evidence_strength_score),
      actionabilityScore: asNumber(raw.actionabilityScore) ?? asNumber(raw.actionability_score),
    }
  }

  // Must have at least one recognizable flat field
  if (!('reading_card' in raw) && !('readingCard' in raw) && !('summary' in raw)) {
    return null
  }

  // 2 & 3. Flat format — snake_case and camelCase
  const fitScore = asNumber(raw.fit_score) ?? asNumber(raw.knowledgeBaseFitScore)
  const fitReason = asString(raw.fit_reason) || asString(raw.fitReason) || undefined
  const relationType = asString(raw.relation_type) || asString(raw.relationType) || undefined

  return {
    summary: asString(raw.summary),
    paperTitle: asString(raw.paperTitle) || asString(raw.paper_title) || undefined,
    readingCard: asString(raw.reading_card) || asString(raw.readingCard),
    knowledgeBaseFitScore: fitScore,
    fitReason,
    relationToExistingDocs: normalizeRelation(raw.relationToExistingDocs)
      || (relationType ? {
        type: relationType as AnalysisResult['relationToExistingDocs'] extends { type: infer T } ? T : never,
        reason: fitReason || '',
        relatedDocumentIds: [],
      } : undefined),
    relationAnalysis: asString(raw.relation_analysis) || asString(raw.relationAnalysis) || undefined,
    writingMaterials: asString(raw.writing_materials) || asString(raw.writingMaterials) || undefined,
    todoList: asString(raw.todo_list) || asString(raw.todoList) || undefined,
    matchScore: fitScore,
    matchReason: fitReason,
    tags: asStringArray(raw.tags),
    recommendedAction: (asString(raw.recommended_action) || asString(raw.recommendedAction) || undefined) as AnalysisResult['recommendedAction'],
    suggestedPlacement: normalizePlacement(raw.suggestedPlacement) || normalizePlacement(raw.suggested_placement),
    noveltyForKnowledgeBase: asString(raw.noveltyForKnowledgeBase) || asString(raw.novelty_for_kb) || undefined,
    readmeUpdateSuggestions: normalizeReadmeSuggestions(raw.readmeUpdateSuggestions)
      || normalizeReadmeSuggestions(raw.readme_suggestions),
    writingAssets: normalizeWritingAssets(raw.writingAssets) || normalizeWritingAssets(raw.writing_assets),
    decisionBrief: normalizeDecisionBrief(raw.decisionBrief) || normalizeDecisionBrief(raw.decision_brief),
    focusedSignals: normalizeFocusedSignals(raw.focusedSignals) || normalizeFocusedSignals(raw.focused_signals),
    knowledgeIncrementScore: asNumber(raw.knowledgeIncrementScore) ?? asNumber(raw.knowledge_increment_score),
    evidenceStrengthScore: asNumber(raw.evidenceStrengthScore) ?? asNumber(raw.evidence_strength_score),
    actionabilityScore: asNumber(raw.actionabilityScore) ?? asNumber(raw.actionability_score),
  }
}

/* ─── Sub-normalizers ─── */

function normalizeWritingAssets(raw: unknown): AnalysisResult['writingAssets'] | undefined {
  if (!isObject(raw)) return undefined
  return {
    usableClaims: asStringArray(raw.usable_claims ?? raw.usableClaims),
    methodReferences: asStringArray(raw.method_references ?? raw.methodReferences),
    theoryReferences: asStringArray(raw.theory_references ?? raw.theoryReferences),
    possibleLiteratureReviewUse: asString(raw.possible_literature_review_use ?? raw.possibleLiteratureReviewUse),
    limitationsOrCritique: asString(raw.limitations_or_critique ?? raw.limitationsOrCritique),
  }
}

function normalizePlacement(raw: unknown): AnalysisResult['suggestedPlacement'] | undefined {
  if (!isObject(raw)) return undefined
  return {
    subDirection: asString(raw.sub_direction ?? raw.subDirection),
    tags: asStringArray(raw.tags),
  }
}

function normalizeDecisionBrief(raw: unknown): AnalysisResult['decisionBrief'] | undefined {
  if (!isObject(raw)) return undefined
  const verdict = asString(raw.verdict)
  const bestUse = asString(raw.best_use ?? raw.bestUse)
  if (!verdict || !bestUse) return undefined
  return {
    verdict: verdict as NonNullable<AnalysisResult['decisionBrief']>['verdict'],
    confidence: asNumber(raw.confidence),
    bestUse: bestUse as NonNullable<AnalysisResult['decisionBrief']>['bestUse'],
    whyItMatters: asStringArray(raw.why_it_matters ?? raw.whyItMatters),
    keyTakeaways: asStringArray(raw.key_takeaways ?? raw.keyTakeaways),
    noveltyPoints: asStringArray(raw.novelty_points ?? raw.noveltyPoints),
    overlapPoints: asStringArray(raw.overlap_points ?? raw.overlapPoints),
    conflictOrRiskPoints: asStringArray(raw.conflict_or_risk_points ?? raw.conflictOrRiskPoints),
    nextAction: asString(raw.next_action ?? raw.nextAction),
  }
}

function normalizeFocusedSignals(raw: unknown): AnalysisResult['focusedSignals'] | undefined {
  if (!Array.isArray(raw)) return undefined
  const signals = raw
    .filter(isObject)
    .map(item => ({
      text: asString(item.text),
      signalType: asString(item.signal_type ?? item.signalType),
      sectionType: asString(item.section_type ?? item.sectionType) || 'unknown',
      chunkIndex: asNumber(item.chunk_index ?? item.chunkIndex),
      evidenceHint: asString(item.evidence_hint ?? item.evidenceHint) || undefined,
    }))
    .filter(item => item.text)
  return signals.length > 0 ? signals : undefined
}

function normalizeRelation(raw: unknown): AnalysisResult['relationToExistingDocs'] | undefined {
  if (!isObject(raw)) return undefined
  const type = asString(raw.type)
  if (!type) return undefined
  return {
    type: type as AnalysisResult['relationToExistingDocs'] extends { type: infer T } ? T : never,
    reason: asString(raw.reason),
    relatedDocumentIds: asStringArray(raw.relatedDocumentIds),
  }
}

function normalizeReadmeSuggestions(raw: unknown): AnalysisResult['readmeUpdateSuggestions'] | undefined {
  if (!Array.isArray(raw)) return undefined
  const items = raw
    .filter(isObject)
    .map(item => ({
      section: asString(item.section),
      suggestion: asString(item.suggestion),
      reason: asString(item.reason),
    }))
    .filter(item => item.section || item.suggestion)
  return items.length > 0 ? items : undefined
}
