import re
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from backend.core.embedding import EmbeddingClient
from backend.core.storage import StorageManager
from backend.rag.paper_chunker import build_embedding_text
from backend.rag.paper_types import PaperChunk, chroma_safe_metadata, enrichment_embedding_text


def build_document_profile_text(
    *,
    file_name: str,
    paper_title: str | None,
    authors: list[str] | None,
    year: int | None,
    venue: str | None,
    abstract: str | None,
    summary: str,
    tags: list[str] | None,
) -> str:
    parts = [
        f"Title: {paper_title or file_name}",
        f"File: {file_name}",
    ]
    if authors:
        parts.append("Authors: " + ", ".join(authors))
    if year:
        parts.append(f"Year: {year}")
    if venue:
        parts.append(f"Venue: {venue}")
    if tags:
        parts.append("Tags: " + ", ".join(tags))
    if abstract:
        parts.append("Abstract:\n" + abstract)
    if summary:
        parts.append("Analysis Summary:\n" + summary)
    return "\n\n".join(parts)


def build_collection_name(provider: str, model: str, dimensions: int) -> str:
    """构建 Chroma collection 名称，格式: documents__{provider}__{model}__{dimensions}"""
    def normalize(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return f"documents__{normalize(provider)}__{normalize(model)}__{dimensions}"


class DocumentIndexer:
    def __init__(self, storage: StorageManager, embedding: EmbeddingClient):
        self.storage = storage
        self.embedding = embedding

    def index_document(
        self,
        doc_id: str,
        knowledge_base_id: str,
        file_name: str,
        file_path: str,
        chunks: List[str],
        summary: str,
        analysis_result: Dict[str, Any],
        tags: List[str] | None = None,
        index_id: Optional[str] = None,
        collection_name: Optional[str] = None,
        embedding_provider: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_dimensions: Optional[int] = None,
        analysis_version: Optional[str] = None,
        chunk_ids: Optional[List[str]] = None,
        paper_title: Optional[str] = None,
        authors: Optional[List[str]] = None,
        year: Optional[int] = None,
        venue: Optional[str] = None,
        abstract: Optional[str] = None,
        paper_chunks: Optional[List[PaperChunk]] = None,
    ) -> str:
        tags = tags or []
        created_at = datetime.now().isoformat()

        profile_text = build_document_profile_text(
            file_name=file_name,
            paper_title=paper_title,
            authors=authors,
            year=year,
            venue=venue,
            abstract=abstract,
            summary=summary,
            tags=tags,
        )

        if paper_chunks is not None:
            source_documents = [build_embedding_text(paper_title or file_name, chunk) for chunk in paper_chunks]
            enrichment_documents = [
                enrichment_embedding_text(paper_title or file_name, chunk)
                for chunk in paper_chunks
                if chunk.zh_semantic_summary or chunk.zh_key_points or chunk.terms
            ]
            content_documents = source_documents
            texts_to_embed = [profile_text, summary] + source_documents + enrichment_documents
        else:
            content_documents = chunks
            enrichment_documents = []
            texts_to_embed = [profile_text, summary] + content_documents
        embeddings = self.embedding.embed(texts_to_embed)

        # Generate chunk IDs if not provided (profile + summary + content_chunks)
        content_count = len(content_documents)
        if chunk_ids is None:
            chunk_ids = [f"chunk-{uuid.uuid4()}" for _ in range(content_count + 2)]

        # Profile entry (index -1)
        ids = [f"{doc_id}_{knowledge_base_id}_profile"]
        metadatas = [{
            "doc_id": doc_id,
            "knowledge_base_id": knowledge_base_id,
            "file_name": file_name,
            "paper_title": paper_title or "",
            "chunk_type": "profile",
            "chunk_index": -1,
            "tags": ",".join(tags),
            "created_at": created_at,
            "index_id": index_id or "",
            "chunk_id": chunk_ids[0],
            "embedding_model": embedding_model or "",
            "embedding_dimensions": embedding_dimensions or 0,
            "entry_kind": "profile",
        }]
        documents = [profile_text]

        # Summary entry
        ids.append(f"{doc_id}_{knowledge_base_id}_summary")
        metadatas.append({
            "doc_id": doc_id,
            "knowledge_base_id": knowledge_base_id,
            "file_name": file_name,
            "chunk_type": "summary",
            "chunk_index": 0,
            "tags": ",".join(tags),
            "created_at": created_at,
            "index_id": index_id or "",
            "chunk_id": chunk_ids[1],
            "embedding_model": embedding_model or "",
            "embedding_dimensions": embedding_dimensions or 0,
            "entry_kind": "summary",
        })
        documents.append(summary)

        if paper_chunks is not None:
            enrichment_idx = 0
            for i, paper_chunk in enumerate(paper_chunks):
                # Source entry
                ids.append(f"{doc_id}_{knowledge_base_id}_chunk_{i}_source")
                paper_meta = chroma_safe_metadata(paper_chunk)
                metadatas.append({
                    "doc_id": doc_id,
                    "knowledge_base_id": knowledge_base_id,
                    "file_name": file_name,
                    "paper_title": paper_title or "",
                    "tags": ",".join(tags),
                    "created_at": created_at,
                    "index_id": index_id or "",
                    "embedding_model": embedding_model or "",
                    "embedding_dimensions": embedding_dimensions or 0,
                    "entry_kind": "source",
                    **paper_meta,
                })
                documents.append(source_documents[i])

                # Enrichment entry (only if useful) - use enrichment_idx to track position in enrichment_documents
                if paper_chunk.zh_semantic_summary or paper_chunk.zh_key_points or paper_chunk.terms:
                    ids.append(f"{doc_id}_{knowledge_base_id}_chunk_{i}_zh")
                    metadatas.append({
                        "doc_id": doc_id,
                        "knowledge_base_id": knowledge_base_id,
                        "file_name": file_name,
                        "paper_title": paper_title or "",
                        "tags": ",".join(tags),
                        "created_at": created_at,
                        "index_id": index_id or "",
                        "embedding_model": embedding_model or "",
                        "embedding_dimensions": embedding_dimensions or 0,
                        "entry_kind": "zh_enrichment",
                        **paper_meta,
                    })
                    documents.append(enrichment_documents[enrichment_idx])
                    enrichment_idx += 1
        else:
            for i, chunk in enumerate(chunks):
                ids.append(f"{doc_id}_{knowledge_base_id}_chunk_{i}")
                metadatas.append({
                    "doc_id": doc_id,
                    "knowledge_base_id": knowledge_base_id,
                    "file_name": file_name,
                    "paper_title": paper_title or "",
                    "chunk_type": "content",
                    "chunk_index": i,
                    "tags": ",".join(tags),
                    "created_at": created_at,
                    "index_id": index_id or "",
                    "chunk_id": chunk_ids[i + 2],
                    "embedding_model": embedding_model or "",
                    "embedding_dimensions": embedding_dimensions or 0,
                    "entry_kind": "source",
                    "section_type": "",
                    "section_title": "",
                    "page_start": 0,
                    "page_end": 0,
                    "is_reference": False,
                    "prev_chunk_id": "",
                    "next_chunk_id": "",
                })
                documents.append(chunk)

        try:
            self.storage.add_to_collection(
                ids=ids,
                embeddings=embeddings,
                metadatas=metadatas,
                documents=documents,
                collection_name=collection_name,
            )
        except Exception as exc:
            raise RuntimeError(
                f"Failed to persist vector index for doc_id={doc_id} "
                f"knowledge_base_id={knowledge_base_id}: {exc}"
            ) from exc

        return doc_id

    def delete_document(self, doc_id: str, knowledge_base_id: str,
                        collection_name: Optional[str] = None):
        if not knowledge_base_id:
            raise ValueError("knowledge_base_id is required when deleting a document from the vector store")
        self.storage.delete_from_collection(doc_id, knowledge_base_id, collection_name=collection_name)
