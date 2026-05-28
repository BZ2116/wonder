from typing import List
import openai
from openai import OpenAI


class EmbeddingError(Exception):
    """Embedding API 调用异常"""
    pass


EMBEDDING_PRESETS = {
    "OpenAI": {
        "base_url": "https://api.openai.com/v1",
        "models": ["text-embedding-3-small", "text-embedding-3-large"],
        "dimensions": {"text-embedding-3-small": 1536, "text-embedding-3-large": 3072}
    },
    "MiniMax": {
        "base_url": "https://api.minimaxi.com/v1",
        "models": ["text-embedding-003"],
        "dimensions": {"text-embedding-003": 1536}
    }
}

class EmbeddingClient:
    def __init__(self, provider: str, api_key: str, base_url: str,
                 model_name: str, dimensions: int = 1536):
        if not api_key:
            raise ValueError("Embedding API key is required")
        self.provider = provider
        self.model_name = model_name
        self.dimensions = dimensions
        self.client = OpenAI(api_key=api_key, base_url=base_url)

    def embed(self, texts: List[str]) -> List[List[float]]:
        """批量获取文本向量"""
        if not texts:
            return []
        try:
            response = self.client.embeddings.create(
                model=self.model_name,
                input=texts
            )
            return [item.embedding for item in response.data]
        except openai.RateLimitError as e:
            raise EmbeddingError(f"Embedding API rate limit exceeded: {e}") from e
        except openai.APIError as e:
            raise EmbeddingError(f"Embedding API error: {e}") from e

    def embed_single(self, text: str) -> List[float]:
        """单条文本向量化"""
        return self.embed([text])[0]

    @classmethod
    def from_config(cls, config: dict) -> "EmbeddingClient":
        """从配置字典创建客户端"""
        return cls(
            provider=config.get("provider", "OpenAI"),
            api_key=config.get("api_key", ""),
            base_url=config.get("base_url", "https://api.openai.com/v1"),
            model_name=config.get("model_name", "text-embedding-3-small"),
            dimensions=config.get("dimensions", 1536)
        )
