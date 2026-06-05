from typing import Any, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator

EvidenceStatus = Literal["none", "weak", "reliable"]


class AnalysisRequest(BaseModel):
    max_chars: int = 7000
    overlap: int = 500


class AnalysisResponse(BaseModel):
    id: str
    file_name: str
    reading_card: str
    relation_analysis: str
    writing_materials: str
    todo_list: str
    full_report: str
    created_at: str


class HistoryItem(BaseModel):
    id: str
    file_name: str
    created_at: str
    model: str
    summary: str
    tags: List[str] = []


class HistoryListResponse(BaseModel):
    items: List[HistoryItem]
    total: int


class QARequest(BaseModel):
    question: str
    document_id: Optional[str] = None
    conversation_id: Optional[str] = None


class QAResponse(BaseModel):
    answer: str
    conversation_id: str
    sources: List[str] = []


class ConfigModel(BaseModel):
    model: dict
    embedding: dict
    research: dict
    watch: dict
    analysis: dict
    knowledge: dict


# 知识库相关模型
class EmbeddingConfig(BaseModel):
    model_config = {"protected_namespaces": ()}
    provider: str = "Anthropic"
    api_key: str = ""
    base_url: str = "https://api.anthropic.com"
    model_name: str = "text-embedding-3-small"
    dimensions: int = 1536

class KnowledgeConfig(BaseModel):
    enabled: bool = True
    chroma_path: str = "data/chroma"
    auto_index: bool = True
    max_context_tokens: int = 8000


# Normalized config models (camelCase aliases for Node/frontend compatibility)

class ChatConfig(BaseModel):
    model_config = {"protected_namespaces": ()}
    provider: Literal["openai_compatible", "anthropic", "minimax", "custom_openai_compatible"] = "openai_compatible"
    preset: str = ""
    api_key: str = Field(default="", alias="apiKey")
    base_url: str = Field(default="https://api.anthropic.com", alias="baseUrl")
    model: str = "claude-sonnet-4-20250514"
    temperature: float = 0.2
    max_tokens: int = Field(default=4096, alias="maxTokens")


class NormalizedEmbeddingConfig(BaseModel):
    model_config = {"protected_namespaces": ()}
    provider: Literal["openai_compatible", "custom_openai_compatible", "minimax", "local"] = "openai_compatible"
    preset: str = ""
    api_key: str = Field(default="", alias="apiKey")
    base_url: str = Field(default="https://api.openai.com/v1", alias="baseUrl")
    model: str = "text-embedding-3-small"
    dimensions: int = 1536


class NormalizedKnowledgeConfig(BaseModel):
    enabled: bool = True
    auto_index: bool = Field(default=True, alias="autoIndex")
    context_token_limit: int = Field(default=8000, alias="contextTokenLimit")


class NormalizedResearchConfig(BaseModel):
    global_profile: str = Field(default="", alias="globalProfile")


class NormalizedAppConfig(BaseModel):
    chat: ChatConfig = Field(default_factory=ChatConfig)
    embedding: NormalizedEmbeddingConfig = Field(default_factory=NormalizedEmbeddingConfig)
    knowledge: NormalizedKnowledgeConfig = Field(default_factory=NormalizedKnowledgeConfig)
    research: NormalizedResearchConfig = Field(default_factory=NormalizedResearchConfig)
    nickname: Optional[str] = None
    avatar: Optional[str] = None


class KnowledgeQARequest(BaseModel):
    question: str
    knowledge_base_id: Optional[str] = None
    knowledge_base_readme: str = ""
    global_profile: str = ""
    nickname: str = ""
    doc_ids: Optional[List[str]] = None
    mentioned_doc_ids: Optional[List[str]] = None
    top_k_docs: int = 3
    top_k_chunks: int = 5
    conversation_history: Optional[List[dict]] = None
    chat_config: Optional[ChatConfig] = None
    embedding_config: Optional[NormalizedEmbeddingConfig] = None
    collection_names: Optional[List[str]] = None


class SourceRef(BaseModel):
    doc_id: str
    file_name: str
    chunk_id: Optional[str] = None
    chunk_index: Optional[int] = None
    chunk_type: Literal["summary", "content", "card", "profile"] = "content"
    content: str
    score: Optional[float] = None
    # Card-specific fields (optional, only present when chunk_type == "card")
    item_type: Optional[str] = None
    card_id: Optional[str] = None
    linked_doc_ids: Optional[str] = None
    knowledge_type: Optional[str] = None
    tags: Optional[str] = None


class KnowledgeQAResponse(BaseModel):
    answer: str
    source_doc_ids: List[str]
    source_chunks: List[str]
    answer_mode: Optional[Literal["general", "rag_enhanced", "mentioned_docs", "compare_docs"]] = None
    source_refs: Optional[List[SourceRef]] = None
    evidence_status: Optional[EvidenceStatus] = None

class SearchRequest(BaseModel):
    query: str
    doc_ids: Optional[List[str]] = None
    top_k: int = 10

class SearchResponse(BaseModel):
    results: List[dict]

class DocumentListResponse(BaseModel):
    documents: List[dict]
    total: int

class DocumentDetailResponse(BaseModel):
    id: str
    file_name: str
    created_at: str
    summary: str
    reading_card: str
    relation_analysis: str
    writing_materials: str
    todo_list: str
    chunk_count: int
    total_tokens: int


class GatewayAnalysisRequest(BaseModel):
    doc_id: str
    file_name: str
    file_type: str = ""
    text: str
    knowledge_base_id: Optional[str] = None
    knowledge_base_readme: str = ""
    global_profile: str = ""
    max_chars: int = 7000
    overlap: int = 500
    chat_config: Optional[ChatConfig] = None
    pdf_title: Optional[str] = None


class GatewayAnalysisResponse(BaseModel):
    doc_id: str
    file_name: str
    status: Literal["ok", "partial"]
    failed_agents: List[str] = []
    reading_card: str
    relation_analysis: str
    writing_materials: str
    todo_list: str
    summary: str
    tags: List[str] = []
    fit_score: Optional[float] = None
    fit_reason: Optional[str] = None
    relation_type: Optional[str] = None
    placement: Optional[str] = None
    recommended_action: Optional[str] = None
    readme_suggestions: List[dict] = []
    source_chunks: List[str] = []


class KnowledgeIndexRequest(BaseModel):
    doc_id: str
    knowledge_base_id: str
    file_name: str
    file_path: str = ""
    chunks: List[str]
    summary: str
    analysis_result: dict
    tags: List[str] = []
    embedding_config: Optional[NormalizedEmbeddingConfig] = None
    paper_title: Optional[str] = None
    authors: List[str] = []
    year: Optional[int] = None
    venue: Optional[str] = None
    abstract: Optional[str] = None
    keywords: List[str] = []
    metadata_status: Optional[str] = None

    @field_validator("file_path", mode="before")
    @classmethod
    def coerce_null_file_path(cls, value):
        return "" if value is None else value


class ResearchCardIndexRequest(BaseModel):
    card_id: str
    knowledge_base_id: str
    question: str
    core_claims: List[str]
    knowledge_type: str = "other"
    tags: List[str] = []
    sub_direction: str = ""
    use_cases: List[str] = []
    linked_doc_ids: List[str] = []
    validation_notes: str = ""
    embedding_config: Optional[NormalizedEmbeddingConfig] = None


class ResearchCardIndexResponse(BaseModel):
    card_id: str
    message: str


class HealthCheckResponse(BaseModel):
    status: str
    provider: str
    message: str = ""


class ResearchCardSourceRef(BaseModel):
    item_type: Optional[str] = None
    card_id: Optional[str] = None
    doc_id: Optional[str] = None
    document_id: Optional[str] = None
    file_name: Optional[str] = ""
    chunk_id: Optional[str] = None
    chunk_index: Optional[int] = None
    chunk_type: Literal["summary", "content", "card", "profile"] = "content"
    content: str = ""
    snippet: Optional[str] = None
    score: Optional[float] = None


class ResearchCardDraftRequest(BaseModel):
    question: str
    answer: str
    answer_mode: Optional[Literal["general", "rag_enhanced", "mentioned_docs", "compare_docs"]] = None
    source_refs: List[ResearchCardSourceRef] = []
    knowledge_base_id: Optional[str] = None


class ResearchCardDraftResponse(BaseModel):
    question: str
    core_claims: List[str]
    knowledge_type: Literal["method", "theory", "finding", "research_question", "gap", "limitation", "writing_material", "other"]
    tags: List[str] = []
    sub_direction: str = ""
    validation_notes: str = ""
    use_cases: List[str] = []
    linked_doc_ids: List[str] = []
    no_paper_evidence: bool = False
    evidence_refs: List[ResearchCardSourceRef] = []
