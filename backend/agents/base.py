from abc import ABC, abstractmethod
from typing import Optional, Any

from backend.core.providers.base import format_provider_error, ProviderError


class BaseAgent(ABC):
    def __init__(self, model: str, api_key: str = "", base_url: str = "", provider: Any = None):
        self.model = model
        self.api_key = api_key
        self.base_url = base_url
        self._provider = provider

    def _get_provider(self) -> Any:
        if self._provider is not None:
            return self._provider
        from backend.core.providers.factory import create_chat_provider
        self._provider = create_chat_provider({
            "provider": "anthropic",
            "api_key": self.api_key,
            "base_url": self.base_url,
            "model": self.model,
        })
        return self._provider

    def call_llm(self, system_prompt: str, user_prompt: str, temperature: float = 0.2, max_tokens: int = 3000) -> str:
        provider = self._get_provider()
        try:
            return provider.chat(
                messages=[{"role": "user", "content": user_prompt}],
                model=self.model,
                temperature=temperature,
                max_tokens=max_tokens,
                system=system_prompt,
            )
        except ProviderError as e:
            raise RuntimeError(format_provider_error(e)) from e
        except Exception as e:
            raise RuntimeError(f"LLM call failed: {format_provider_error(e)}") from e

    @abstractmethod
    def run(self, **kwargs) -> str:
        pass
