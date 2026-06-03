from datetime import datetime
from typing import List, Dict, Any
from backend.core.embedding import EmbeddingClient
from backend.core.storage import StorageManager


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
    ) -> str:
        tags = tags or []
        created_at = datetime.now().isoformat()

        texts_to_embed = [summary] + chunks
        embeddings = self.embedding.embed(texts_to_embed)

        ids = [f"{doc_id}_{knowledge_base_id}_summary"]
        metadatas = [{
            "doc_id": doc_id,
            "knowledge_base_id": knowledge_base_id,
            "file_name": file_name,
            "chunk_type": "summary",
            "chunk_index": 0,
            "tags": ",".join(tags),
            "created_at": created_at,
        }]
        documents = [summary]

        for i, chunk in enumerate(chunks):
            ids.append(f"{doc_id}_{knowledge_base_id}_chunk_{i}")
            metadatas.append({
                "doc_id": doc_id,
                "knowledge_base_id": knowledge_base_id,
                "file_name": file_name,
                "chunk_type": "content",
                "chunk_index": i,
                "tags": ",".join(tags),
                "created_at": created_at,
            })
            documents.append(chunk)

        try:
            self.storage.add_to_collection(
                ids=ids,
                embeddings=embeddings,
                metadatas=metadatas,
                documents=documents,
            )
        except Exception as exc:
            raise RuntimeError(
                f"Failed to persist vector index for doc_id={doc_id} "
                f"knowledge_base_id={knowledge_base_id}: {exc}"
            ) from exc

        return doc_id

    def delete_document(self, doc_id: str, knowledge_base_id: str | None = None):
        self.storage.delete_from_collection(doc_id, knowledge_base_id)
