export type DocumentLifecycleStatus =
  | 'uploaded'
  | 'parsed'
  | 'analyzing'
  | 'analyzed'
  | 'indexing'
  | 'indexed'
  | 'index_failed'
  | 'failed'

export interface LLMConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

export interface AppConfig {
  provider?: string
  baseUrl?: string
  apiKey?: string
  model?: string
  embeddingProvider?: string
  embeddingBaseUrl?: string
  embeddingApiKey?: string
  embeddingModel?: string
  nickname?: string
  avatar?: string
  globalUserProfile?: string
}

export interface KnowledgeBase {
  id: string
  name: string
  description: string
  readme: string
  created_at: string
  updated_at: string
  documentCount?: number
  tags?: string[]
  pendingSuggestionCount?: number
}

export interface DocumentKnowledgeBase {
  document_id: string
  knowledge_base_id: string
  sub_direction: string | null
  tags: string | null
  fit_score: number | null
  recommended_action: string | null
  created_at: string
}

export interface ReadmeSuggestion {
  id: string
  knowledge_base_id: string
  document_id: string | null
  section: string
  suggestion: string
  reason: string | null
  status: string
  created_at: string
}

export type AnalysisVerdict = 'must_read' | 'deep_read' | 'skim' | 'ignore'

export type AnalysisBestUse =
  | 'literature_review'
  | 'method_reference'
  | 'experiment_baseline'
  | 'background'
  | 'not_useful'

export interface DecisionBrief {
  verdict: AnalysisVerdict
  confidence?: number
  bestUse: AnalysisBestUse
  whyItMatters: string[]
  keyTakeaways: string[]
  noveltyPoints: string[]
  overlapPoints: string[]
  conflictOrRiskPoints: string[]
  nextAction: string
}

export interface FocusedSignal {
  text: string
  signalType: string
  sectionType: string
  chunkIndex?: number
  evidenceHint?: string
}

export interface AnalysisResult {
  summary: string
  paperTitle?: string
  readingCard: string
  knowledgeBaseFitScore?: number
  fitReason?: string
  suggestedPlacement?: {
    subDirection: string
    tags: string[]
  }
  relationToExistingDocs?: {
    type: 'supplement' | 'duplicate' | 'conflict' | 'extension' | 'method_reference' | 'unrelated'
    reason: string
    relatedDocumentIds: string[]
  }
  noveltyForKnowledgeBase?: string
  recommendedAction?: 'add' | 'deep_read' | 'skim' | 'track_citations' | 'add_to_other_kb' | 'ignore'
  writingAssets?: {
    usableClaims: string[]
    methodReferences: string[]
    theoryReferences: string[]
    possibleLiteratureReviewUse: string
    limitationsOrCritique: string
  }
  readmeUpdateSuggestions?: {
    section: string
    suggestion: string
    reason: string
  }[]
  decisionBrief?: DecisionBrief
  focusedSignals?: FocusedSignal[]
  knowledgeIncrementScore?: number
  evidenceStrengthScore?: number
  actionabilityScore?: number
  // Legacy fields for backward compatibility
  tags?: string[]
  matchScore?: number
  matchReason?: string
  relationAnalysis?: string
  writingMaterials?: string
  todoList?: string
}
