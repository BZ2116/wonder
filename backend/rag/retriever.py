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
        doc_ids: Optional[List[str]] = None,
        top_k_docs: int = 3,
        top_k_chunks: int = 5,
        max_context_tokens: int = 8000
    ) -> RetrievalResult:
        """两层检索：先查摘要定位文档，再查内容分块"""
        # 1. 查询 embedding
        query_embedding = self.embedding.embed_single(query)

        # 2. 第一层：摘要检索
        where_filter: Dict[str, Any] = {"chunk_type": "summary"}
        if doc_ids:
            where_filter["doc_id"] = {"$in": doc_ids}

        summaries_result = self.storage.query_collection(
            query_embeddings=[query_embedding],
            n_results=top_k_docs,
            where=where_filter
        )

        # 3. 第二层：内容检索
        summary_metas = summaries_result.get("metadatas", [[]])[0] if summaries_result.get("metadatas") else []
        if summary_metas:
            matched_doc_ids = list(set(
                m["doc_id"] for m in summary_metas
            ))
            content_where = {
                "chunk_type": "content",
                "doc_id": {"$in": matched_doc_ids}
            }

            chunks_result = self.storage.query_collection(
                query_embeddings=[query_embedding],
                n_results=top_k_chunks,
                where=content_where
            )
        else:
            chunks_result = {"documents": [[]], "metadatas": [[]]}
            matched_doc_ids = []

        # 4. 组装上下文
        context = self._build_context(
            summaries_result, chunks_result, max_context_tokens
        )

        return RetrievalResult(
            summaries=summaries_result.get("documents", [[]])[0] if summaries_result.get("documents") else [],
            chunks=chunks_result.get("documents", [[]])[0] if chunks_result.get("documents") else [],
            context=context,
            source_doc_ids=matched_doc_ids
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
