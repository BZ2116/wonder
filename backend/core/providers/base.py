from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Protocol, runtime_checkable


@dataclass
class ChatMessage:
    role: str
    content: str


class ProviderError(RuntimeError):
    pass


class ProviderConfigError(ProviderError):
    pass


def format_provider_error(error: Exception) -> str:
    message = str(error).strip() or error.__class__.__name__
    lowered = message.lower()

    if "connection error" in lowered or error.__class__.__name__ == "APIConnectionError":
        return "Connection error. Check your network and API endpoint."

    message = re.sub(r"<[^>]+>", " ", message)
    message = re.sub(r"\s+", " ", message).strip()
    if len(message) > 500:
        message = f"{message[:500]}..."
    return message


@runtime_checkable
class ChatProvider(Protocol):
    def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float,
        max_tokens: int,
        system: str | None = None,
    ) -> str:
        ...

    def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str,
        temperature: float,
        max_tokens: int,
        system: str | None = None,
    ) -> Iterable[str]:
        ...

    def health_check(self) -> bool:
        ...


@runtime_checkable
class EmbeddingProvider(Protocol):
    def embed(
        self,
        texts: list[str],
        *,
        model: str,
        dimensions: int | None = None,
    ) -> list[list[float]]:
        ...

    def health_check(self) -> bool:
        ...
