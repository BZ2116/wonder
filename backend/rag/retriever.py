from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from backend.core.embedding import EmbeddingClient
from backend.core.storage import StorageManager


@dataclass
class RetrievalResult:
    summaries: List[str]
    chunks: List[str]
    context: str
    source_doc_ids: List[str]
    source_refs: List[dict] = None
    retrieval_confidence: float = 0.0

    def __post_init__(self):
        if self.source_refs is None:
            self.source_refs = []


class RAGRetriever:
    def __init__(self, storage: StorageManager, embedding: EmbeddingClient):
        self.storage = storage
        self.embedding = embedding

    def _query_single_collection(
        self,
        query_embedding: List[float],
        collection_name: Optional[str],
        knowledge_base_id: Optional[str],
        doc_ids: Optional[List[str]],
        top_k_docs: int,
        top_k_chunks: int,
    ) -> tuple:
        """Query a single collection and return (summaries_result, chunks_result)."""
        summary_filters: List[Dict[str, Any]] = [{"chunk_type": "summary"}]
        if knowledge_base_id:
            summary_filters.append({"knowledge_base_id": knowledge_base_id})
        if doc_ids:
            summary_filters.append({"doc_id": {"$in": doc_ids}})
        where_filter = summary_filters[0] if len(summary_filters) == 1 else {"$and": summary_filters}

        summaries_result = self.storage.query_collection(
            query_embeddings=[query_embedding],
            n_results=top_k_docs,
            where=where_filter,
            collection_name=collection_name,
        )

        summary_metas = summaries_result.get("metadatas", [[]])[0] if summaries_result.get("metadatas") else []
        matched_doc_ids = list(dict.fromkeys(m["doc_id"] for m in summary_metas if "doc_id" in m))

        if matched_doc_ids:
            content_filters: List[Dict[str, Any]] = [
                {"chunk_type": "content"},
                {"doc_id": {"$in": matched_doc_ids}},
            ]
            if knowledge_base_id:
                content_filters.insert(1, {"knowledge_base_id": knowledge_base_id})
            content_where = {"$and": content_filters}
            chunks_result = self.storage.query_collection(
                query_embeddings=[query_embedding],
                n_results=top_k_chunks,
                where=content_where,
                collection_name=collection_name,
            )
        elif doc_ids:
            # Strict doc_ids fallback: query content directly using the provided doc_ids
            # even when summary query returned no matches (profile/summary miss case)
            content_filters: List[Dict[str, Any]] = [
                {"chunk_type": "content"},
                {"doc_id": {"$in": doc_ids}},
            ]
            if knowledge_base_id:
                content_filters.insert(1, {"knowledge_base_id": knowledge_base_id})
            content_where = {"$and": content_filters}
            chunks_result = self.storage.query_collection(
                query_embeddings=[query_embedding],
                n_results=top_k_chunks,
                where=content_where,
                collection_name=collection_name,
            )
        else:
            chunks_result = {"documents": [[]], "metadatas": [[]]}

        return summaries_result, chunks_result, matched_doc_ids

    def retrieve(
        self,
        query: str,
        knowledge_base_id: Optional[str] = None,
        doc_ids: Optional[List[str]] = None,
        top_k_docs: int = 3,
        top_k_chunks: int = 5,
        max_context_tokens: int = 8000,
        collection_names: Optional[List[str]] = None,
    ) -> RetrievalResult:
        if not query or not query.strip():
            raise ValueError("query must not be empty")
        query_embedding = self.embedding.embed_single(query)

        if collection_names:
            # Query multiple collections and merge results
            all_summaries_docs: List[str] = []
            all_summaries_metas: List[Dict] = []
            all_summaries_dists: List[float] = []
            all_chunks_docs: List[str] = []
            all_chunks_metas: List[Dict] = []
            all_chunks_dists: List[float] = []
            all_matched_doc_ids: List[str] = []

            for cname in collection_names:
                s_result, c_result, m_ids = self._query_single_collection(
                    query_embedding, cname, knowledge_base_id, doc_ids,
                    top_k_docs, top_k_chunks,
                )
                all_matched_doc_ids.extend(m_ids)

                s_docs = s_result.get("documents", [[]])[0] if s_result.get("documents") else []
                s_metas = s_result.get("metadatas", [[]])[0] if s_result.get("metadatas") else []
                s_dists = s_result.get("distances", [[]])[0] if s_result.get("distances") else []
                all_summaries_docs.extend(s_docs)
                all_summaries_metas.extend(s_metas)
                all_summaries_dists.extend(s_dists)

                c_docs = c_result.get("documents", [[]])[0] if c_result.get("documents") else []
                c_metas = c_result.get("metadatas", [[]])[0] if c_result.get("metadatas") else []
                c_dists = c_result.get("distances", [[]])[0] if c_result.get("distances") else []
                all_chunks_docs.extend(c_docs)
                all_chunks_metas.extend(c_metas)
                all_chunks_dists.extend(c_dists)

            # Sort by distance (lower = more similar) and keep top_k
            if all_summaries_dists:
                summary_order = sorted(range(len(all_summaries_dists)), key=lambda i: all_summaries_dists[i])
                summary_order = summary_order[:top_k_docs]
                summaries_result = {
                    "documents": [[all_summaries_docs[i] for i in summary_order]],
                    "metadatas": [[all_summaries_metas[i] for i in summary_order]],
                    "distances": [[all_summaries_dists[i] for i in summary_order]],
                }
            else:
                summaries_result = {"documents": [[]], "metadatas": [[]], "distances": [[]]}

            if all_chunks_dists:
                chunk_order = sorted(range(len(all_chunks_dists)), key=lambda i: all_chunks_dists[i])
                chunk_order = chunk_order[:top_k_chunks]
                chunks_result = {
                    "documents": [[all_chunks_docs[i] for i in chunk_order]],
                    "metadatas": [[all_chunks_metas[i] for i in chunk_order]],
                    "distances": [[all_chunks_dists[i] for i in chunk_order]],
                }
            else:
                chunks_result = {"documents": [[]], "metadatas": [[]], "distances": [[]]}

            # Extract doc_ids from top-k sorted summaries only
            matched_doc_ids = list(dict.fromkeys(
                all_summaries_metas[i].get("doc_id", "")
                for i in summary_order
                if "doc_id" in all_summaries_metas[i]
            )) if all_summaries_dists else []
        else:
            # Single collection (backward compatible)
            summaries_result, chunks_result, matched_doc_ids = self._query_single_collection(
                query_embedding, None, knowledge_base_id, doc_ids,
                top_k_docs, top_k_chunks,
            )

        context = self._build_context(summaries_result, chunks_result, max_context_tokens)

        # Build structured source_refs
        source_refs = self._dedupe_refs(self._build_source_refs(summaries_result, chunks_result))

        # Compute retrieval_confidence as average score of summary refs
        summary_scores = [
            ref["score"] for ref in source_refs
            if ref["chunk_type"] == "summary" and ref.get("score") is not None
        ]
        retrieval_confidence = sum(summary_scores) / len(summary_scores) if summary_scores else 0.0

        return RetrievalResult(
            summaries=summaries_result.get("documents", [[]])[0] if summaries_result.get("documents") else [],
            chunks=chunks_result.get("documents", [[]])[0] if chunks_result.get("documents") else [],
            context=context,
            source_doc_ids=matched_doc_ids,
            source_refs=source_refs,
            retrieval_confidence=retrieval_confidence,
        )

    @staticmethod
    def _build_source_refs(summaries: Dict, chunks: Dict) -> List[dict]:
        """Build structured source_refs from retrieval results."""
        refs: List[dict] = []

        summary_docs = summaries.get("documents", [[]])[0] if summaries.get("documents") else []
        summary_metas = summaries.get("metadatas", [[]])[0] if summaries.get("metadatas") else []
        summary_dists = summaries.get("distances", [[]])[0] if summaries.get("distances") else []

        for i, doc in enumerate(summary_docs):
            meta = summary_metas[i] if i < len(summary_metas) else {}
            dist = summary_dists[i] if i < len(summary_dists) else None
            refs.append({
                "doc_id": meta.get("doc_id", ""),
                "file_name": meta.get("file_name", "unknown"),
                "chunk_id": meta.get("chunk_id"),
                "chunk_index": meta.get("chunk_index"),
                "chunk_type": meta.get("chunk_type", "summary"),
                "content": doc,
                "score": 1 - dist / 2 if dist is not None else None,
            })

        chunk_docs = chunks.get("documents", [[]])[0] if chunks.get("documents") else []
        chunk_metas = chunks.get("metadatas", [[]])[0] if chunks.get("metadatas") else []
        chunk_dists = chunks.get("distances", [[]])[0] if chunks.get("distances") else []

        for i, doc in enumerate(chunk_docs):
            meta = chunk_metas[i] if i < len(chunk_metas) else {}
            dist = chunk_dists[i] if i < len(chunk_dists) else None
            refs.append({
                "doc_id": meta.get("doc_id", ""),
                "file_name": meta.get("file_name", "unknown"),
                "chunk_id": meta.get("chunk_id"),
                "chunk_index": meta.get("chunk_index"),
                "chunk_type": meta.get("chunk_type", "content"),
                "content": doc,
                "score": 1 - dist / 2 if dist is not None else None,
            })

        return refs

    @staticmethod
    def _dedupe_refs(refs: List[dict]) -> List[dict]:
        seen = set()
        deduped = []
        for ref in refs:
            key = (
                ref.get("doc_id"),
                ref.get("chunk_type"),
                ref.get("chunk_id"),
                ref.get("chunk_index"),
                (ref.get("content") or "")[:120],
            )
            if key in seen:
                continue
            seen.add(key)
            deduped.append(ref)
        return deduped

    def _build_context(self, summaries: Dict, chunks: Dict,
                       max_tokens: int) -> str:
        """组装检索上下文，控制 token 数"""
        parts = []
        current_tokens = 0

        summary_docs = summaries.get("documents", [[]])[0] if summaries.get("documents") else []
        summary_metas = summaries.get("metadatas", [[]])[0] if summaries.get("metadatas") else []

        # 添加摘要
        for i, doc in enumerate(summary_docs):
            doc_tokens = len(doc)  # 保守估计：每个字符 1 token
            if current_tokens + doc_tokens > max_tokens:
                break
            file_name = summary_metas[i].get("file_name", "unknown") if i < len(summary_metas) else "unknown"
            parts.append(f"[文档摘要] {file_name}:\n{doc}")
            current_tokens += doc_tokens

        chunk_docs = chunks.get("documents", [[]])[0] if chunks.get("documents") else []
        chunk_metas = chunks.get("metadatas", [[]])[0] if chunks.get("metadatas") else []

        # 添加内容分块
        for i, doc in enumerate(chunk_docs):
            doc_tokens = len(doc)
            if current_tokens + doc_tokens > max_tokens:
                break
            file_name = chunk_metas[i].get("file_name", "unknown") if i < len(chunk_metas) else "unknown"
            parts.append(f"[相关内容] {file_name}:\n{doc}")
            current_tokens += doc_tokens

        return "\n\n---\n\n".join(parts)

    def search(self, query: str, doc_ids: Optional[List[str]] = None,
               top_k: int = 10, collection_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """简单搜索，返回相关分块"""
        query_embedding = self.embedding.embed_single(query)

        where_filter: Dict[str, Any] = {}
        if doc_ids:
            where_filter["doc_id"] = {"$in": doc_ids}

        result = self.storage.query_collection(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where_filter if where_filter else None,
            collection_name=collection_name,
        )

        results = []
        docs = result.get("documents", [[]])[0] if result.get("documents") else []
        metas = result.get("metadatas", [[]])[0] if result.get("metadatas") else []
        dists = result.get("distances", [[]])[0] if result.get("distances") else []
        if docs:
            for i, doc in enumerate(docs):
                metadata = metas[i] if i < len(metas) else {}
                distance = dists[i] if i < len(dists) else None
                results.append({
                    "content": doc,
                    "metadata": metadata,
                    "score": 1 - distance / 2 if distance is not None else None
                })

        return results
