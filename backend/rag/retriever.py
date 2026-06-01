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


class RAGRetriever:
    def __init__(self, storage: StorageManager, embedding: EmbeddingClient):
        self.storage = storage
        self.embedding = embedding

    def retrieve(
        self,
        query: str,
        knowledge_base_id: Optional[str] = None,
        doc_ids: Optional[List[str]] = None,
        top_k_docs: int = 3,
        top_k_chunks: int = 5,
        max_context_tokens: int = 8000
    ) -> RetrievalResult:
        if not query or not query.strip():
            raise ValueError("query must not be empty")
        query_embedding = self.embedding.embed_single(query)

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
            )
        else:
            chunks_result = {"documents": [[]], "metadatas": [[]]}

        context = self._build_context(summaries_result, chunks_result, max_context_tokens)

        return RetrievalResult(
            summaries=summaries_result.get("documents", [[]])[0] if summaries_result.get("documents") else [],
            chunks=chunks_result.get("documents", [[]])[0] if chunks_result.get("documents") else [],
            context=context,
            source_doc_ids=matched_doc_ids,
        )

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
               top_k: int = 10) -> List[Dict[str, Any]]:
        """简单搜索，返回相关分块"""
        query_embedding = self.embedding.embed_single(query)

        where_filter: Dict[str, Any] = {}
        if doc_ids:
            where_filter["doc_id"] = {"$in": doc_ids}

        result = self.storage.query_collection(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where_filter if where_filter else None
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
