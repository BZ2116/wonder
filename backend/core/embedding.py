from typing import List

from .providers.base import ProviderError


class EmbeddingError(Exception):
    pass


EMBEDDING_PRESETS = {
    "OpenAI": {
        "base_url": "https://api.openai.com/v1",
        "models": ["text-embedding-3-small", "text-embedding-3-large"],
        "dimensions": {"text-embedding-3-small": 1536, "text-embedding-3-large": 3072},
    },
    "MiniMax": {
        "base_url": "https://api.minimaxi.com/v1",
        "models": ["text-embedding-003"],
        "dimensions": {"text-embedding-003": 1536},
    },
}


class EmbeddingClient:
    def __init__(self, provider, model_name: str, dimensions: int = 1536):
        self._provider = provider
        self.model_name = model_name
        self.dimensions = dimensions

    def embed(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        try:
            return self._provider.embed(texts, model=self.model_name, dimensions=self.dimensions)
        except ProviderError as e:
            raise EmbeddingError(str(e)) from e

    def embed_single(self, text: str) -> List[float]:
        return self.embed([text])[0]

    @classmethod
    def from_config(cls, config: dict) -> "EmbeddingClient":
        from .providers.factory import create_embedding_provider

        provider = create_embedding_provider(config)
        return cls(
            provider=provider,
            model_name=config.get("model_name", config.get("model", "text-embedding-3-small")),
            dimensions=config.get("dimensions", 1536),
        )
