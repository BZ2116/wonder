import os
import sqlite3
from datetime import datetime
from typing import List, Optional, Dict, Any
import chromadb


class StorageManager:
    def __init__(self, chroma_path: str, sqlite_path: str):
        self.chroma_path = chroma_path
        self.sqlite_path = sqlite_path

        # 创建目录
        os.makedirs(chroma_path, exist_ok=True)
        os.makedirs(os.path.dirname(sqlite_path) or ".", exist_ok=True)

        # 初始化 ChromaDB
        self.chroma_client = chromadb.PersistentClient(path=chroma_path)
        self.collection = self.chroma_client.get_or_create_collection(
            name="documents",
            metadata={"hnsw:space": "cosine"}
        )

        # 初始化 SQLite
        self.db = sqlite3.connect(sqlite_path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self._init_tables()

    def _init_tables(self):
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                file_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                summary TEXT,
                reading_card TEXT,
                relation_analysis TEXT,
                writing_materials TEXT,
                todo_list TEXT,
                chunk_count INTEGER,
                total_tokens INTEGER
            )
        """)
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS document_tags (
                doc_id TEXT,
                tag TEXT,
                PRIMARY KEY (doc_id, tag),
                FOREIGN KEY (doc_id) REFERENCES documents(id)
            )
        """)
        self.db.commit()

    def insert_document(self, doc_id: str, file_name: str, file_path: str,
                        summary: str, reading_card: str, relation_analysis: str,
                        writing_materials: str, todo_list: str,
                        chunk_count: int, total_tokens: int):
        """插入文档元数据"""
        self.db.execute("""
            INSERT INTO documents (id, file_name, file_path, created_at, summary,
                                   reading_card, relation_analysis, writing_materials,
                                   todo_list, chunk_count, total_tokens)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (doc_id, file_name, file_path, datetime.now(), summary,
              reading_card, relation_analysis, writing_materials,
              todo_list, chunk_count, total_tokens))
        self.db.commit()

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """获取文档详情"""
        row = self.db.execute(
            "SELECT * FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_documents(self) -> List[Dict[str, Any]]:
        """获取文档列表"""
        rows = self.db.execute(
            "SELECT id, file_name, created_at, summary, chunk_count, total_tokens FROM documents ORDER BY created_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]

    def delete_document(self, doc_id: str):
        """删除文档元数据及向量"""
        self.delete_from_collection(doc_id)
        self.db.execute("DELETE FROM document_tags WHERE doc_id = ?", (doc_id,))
        self.db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        self.db.commit()

    def add_to_collection(self, ids: List[str], embeddings: List[List[float]],
                          metadatas: List[Dict[str, Any]], documents: List[str]):
        """添加向量到 ChromaDB"""
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents
        )

    def query_collection(self, query_embeddings: List[List[float]],
                         n_results: int = 10,
                         where: Optional[Dict] = None) -> Dict[str, Any]:
        """查询 ChromaDB"""
        kwargs = {
            "query_embeddings": query_embeddings,
            "n_results": n_results
        }
        if where:
            kwargs["where"] = where
        return self.collection.query(**kwargs)

    def delete_from_collection(self, doc_id: str):
        """从 ChromaDB 删除文档的所有分块"""
        self.collection.delete(where={"doc_id": doc_id})

    def close(self):
        """关闭连接"""
        self.db.close()
