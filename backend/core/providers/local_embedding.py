from __future__ import annotations

import threading
from collections import OrderedDict
from typing import Any

from .base import ProviderError, format_provider_error

_MAX_CACHE_SIZE = 2

# Lazy import to avoid loading torch at module level
_model_cache: OrderedDict[str, Any] = OrderedDict()
_lock = threading.Lock()


def _get_model(model_name: str):
    """Lazy-load and cache the sentence-transformers model (LRU, max 2)."""
    if model_name not in _model_cache:
        with _lock:
            # Double-check after acquiring lock
            if model_name not in _model_cache:
                try:
                    from sentence_transformers import SentenceTransformer
                except ImportError:
                    raise ProviderError(
                        "sentence-transformers is not installed. "
                        "Run: pip install sentence-transformers"
                    )
                try:
                    model = SentenceTransformer(model_name)
                except Exception as e:
                    raise ProviderError(
                        f"Failed to load local model '{model_name}': {format_provider_error(e)}"
                    ) from e
                _model_cache[model_name] = model
                # Evict oldest entry if cache exceeds max size
                while len(_model_cache) > _MAX_CACHE_SIZE:
                    _model_cache.popitem(last=False)
    else:
        # Move accessed entry to end (most recently used)
        with _lock:
            _model_cache.move_to_end(model_name)
    return _model_cache[model_name]


class LocalEmbeddingProvider:
    """Embedding provider that runs BGE (or other sentence-transformers) models locally."""

    def __init__(self, model_name: str = "BAAI/bge-small-zh-v1.5"):
        self._model_name = model_name

    def embed(
        self,
        texts: list[str],
        *,
        model: str,
        dimensions: int | None = None,
    ) -> list[list[float]]:
        if not texts:
            return []
        try:
            m = _get_model(model or self._model_name)
            embeddings = m.encode(texts, normalize_embeddings=True)
            return [emb.tolist() for emb in embeddings]
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(
                f"Local embedding failed: {format_provider_error(e)}"
            ) from e

    def health_check(self) -> bool:
        try:
            _get_model(self._model_name)
            return True
        except Exception:
            return False
