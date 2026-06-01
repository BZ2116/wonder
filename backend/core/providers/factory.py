from __future__ import annotations

from typing import Any

from .anthropic import AnthropicProvider
from .base import EmbeddingProvider, ProviderConfigError
from .openai_compatible import OpenAICompatibleProvider


_PROVIDER_MAP: dict[str, type] = {
    "anthropic": AnthropicProvider,
    "openai_compatible": OpenAICompatibleProvider,
    "OpenAI": OpenAICompatibleProvider,
}


def _normalize_config(config: dict[str, Any]) -> dict[str, Any]:
    """Normalize legacy and new config shapes into a common form."""
    provider = config.get("provider", "")
    api_key = config.get("api_key") or config.get("apiKey", "")
    base_url = config.get("base_url") or config.get("baseUrl", "")
    model = config.get("model") or config.get("model_name", "")
    return {
        "provider": provider,
        "api_key": api_key,
        "base_url": base_url,
        "model": model,
    }


def create_chat_provider(config: dict[str, Any]) -> Any:
    cfg = _normalize_config(config)
    provider_name = cfg["provider"]
    api_key = cfg["api_key"]
    base_url = cfg["base_url"]

    if not api_key:
        raise ProviderConfigError(f"API key is required for provider '{provider_name}'.")

    cls = _PROVIDER_MAP.get(provider_name)
    if cls is None:
        known = ", ".join(sorted(_PROVIDER_MAP.keys()))
        raise ProviderConfigError(
            f"Unknown provider '{provider_name}'. Known providers: {known}."
        )
    return cls(api_key=api_key, base_url=base_url)


def create_embedding_provider(config: dict[str, Any]) -> Any:
    cfg = _normalize_config(config)
    provider_name = cfg["provider"]
    api_key = cfg["api_key"]
    base_url = cfg["base_url"]

    if not api_key:
        raise ProviderConfigError(f"API key is required for provider '{provider_name}'.")

    cls = _PROVIDER_MAP.get(provider_name)
    if cls is None:
        known = ", ".join(sorted(_PROVIDER_MAP.keys()))
        raise ProviderConfigError(
            f"Unknown provider '{provider_name}'. Known providers: {known}."
        )
    return cls(api_key=api_key, base_url=base_url)
