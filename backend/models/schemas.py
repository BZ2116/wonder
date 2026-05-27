from typing import List, Optional
from pydantic import BaseModel


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
    research: dict
    watch: dict
    analysis: dict
