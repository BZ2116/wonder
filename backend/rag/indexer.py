import uuid
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
        file_name: str,
        file_path: str,
        chunks: List[str],
        summary: str,
        analysis_result: Dict[str, Any]
    ) -> str:
        """将文档入库"""
        doc_id = str(uuid.uuid4())[:8]

        # 1. 生成 embeddings
        texts_to_embed = [summary] + chunks
        embeddings = self.embedding.embed(texts_to_embed)

        # 2. 构建 ChromaDB 数据
        ids = [f"{doc_id}_summary"]
        metadatas = [{
            "doc_id": doc_id,
            "file_name": file_name,
            "chunk_type": "summary",
            "chunk_index": 0,
            "created_at": datetime.now().isoformat()
        }]
        documents = [summary]

        for i, chunk in enumerate(chunks):
            ids.append(f"{doc_id}_chunk_{i}")
            metadatas.append({
                "doc_id": doc_id,
                "file_name": file_name,
                "chunk_type": "content",
                "chunk_index": i,
                "created_at": datetime.now().isoformat()
            })
            documents.append(chunk)

        # 3. 存入 ChromaDB
        self.storage.add_to_collection(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents
        )

        # 4. 存入 SQLite
        self.storage.insert_document(
            doc_id=doc_id,
            file_name=file_name,
            file_path=file_path,
            summary=summary,
            reading_card=analysis_result.get("reading_card", ""),
            relation_analysis=analysis_result.get("relation_analysis", ""),
            writing_materials=analysis_result.get("writing_materials", ""),
            todo_list=analysis_result.get("todo_list", ""),
            chunk_count=len(chunks),
            total_tokens=sum(len(c) for c in chunks) // 2
        )

        return doc_id

    def delete_document(self, doc_id: str):
        """从知识库删除文档"""
        self.storage.delete_document(doc_id)
