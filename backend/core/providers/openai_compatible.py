from __future__ import annotations

from typing import Any, Iterable

from openai import OpenAI

from .base import ProviderError, format_provider_error


class OpenAICompatibleProvider:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        client: OpenAI | None = None,
    ):
        self._client = client or OpenAI(api_key=api_key, base_url=base_url, timeout=300.0)

    def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float,
        max_tokens: int,
        system: str | None = None,
    ) -> str:
        api_messages: list[dict[str, str]] = []
        if system:
            api_messages.append({"role": "system", "content": system})
        api_messages.extend(messages)

        try:
            response = self._client.chat.completions.create(
                model=model,
                messages=api_messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as e:
            raise ProviderError(f"OpenAI-compatible chat failed: {format_provider_error(e)}") from e

        content = response.choices[0].message.content or ""
        if not content.strip():
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
        api_messages: list[dict[str, str]] = []
        if system:
            api_messages.append({"role": "system", "content": system})
        api_messages.extend(messages)

        try:
            stream = self._client.chat.completions.create(
                model=model,
                messages=api_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
        except Exception as e:
            raise ProviderError(f"OpenAI-compatible stream failed: {format_provider_error(e)}") from e

        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

    def embed(
        self,
        texts: list[str],
        *,
        model: str,
        dimensions: int | None = None,
    ) -> list[list[float]]:
        if not texts:
            return []

        kwargs: dict[str, Any] = {"model": model, "input": texts}
        if dimensions is not None:
            kwargs["dimensions"] = dimensions

        try:
            response = self._client.embeddings.create(**kwargs)
        except Exception as e:
            raise ProviderError(f"Embedding failed: {format_provider_error(e)}") from e

        return [item.embedding for item in response.data]

    def health_check(self) -> bool:
        try:
            self._client.models.list()
            return True
        except Exception:
            return False
