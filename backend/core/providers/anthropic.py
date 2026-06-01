from __future__ import annotations

from typing import Iterable

from anthropic import Anthropic

from .base import ProviderError, format_provider_error


class AnthropicProvider:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        client: Anthropic | None = None,
    ):
        self._client = client or Anthropic(api_key=api_key, base_url=base_url)

    def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float,
        max_tokens: int,
        system: str | None = None,
    ) -> str:
        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
            "temperature": temperature,
        }
        if system is not None:
            kwargs["system"] = system

        try:
            response = self._client.messages.create(**kwargs)
        except Exception as e:
            raise ProviderError(f"Anthropic chat failed: {format_provider_error(e)}") from e

        text_parts = [
            block.text for block in response.content if block.type == "text" and block.text
        ]
        content = "\n".join(text_parts).strip()
        if not content:
            raise ProviderError("Model returned empty response.")
        return content

    def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float,
        max_tokens: int,
        system: str | None = None,
    ) -> Iterable[str]:
        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        if system is not None:
            kwargs["system"] = system

        try:
            stream = self._client.messages.create(**kwargs)
        except Exception as e:
            raise ProviderError(f"Anthropic stream failed: {format_provider_error(e)}") from e

        for event in stream:
            if event.type == "content_block_delta" and event.delta.type == "text_delta":
                yield event.delta.text

    def health_check(self) -> bool:
        try:
            self._client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1,
                messages=[{"role": "user", "content": "hi"}],
            )
            return True
        except Exception:
            return False
