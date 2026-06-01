# Provider Agent Task Prompt

You are the Provider Agent for Wonder's AI Core Provider Adapter migration.

## Goal

Implement Python provider adapters so all chat, streaming chat, embedding, and provider health checks can run through one internal interface.

## Required Context

Read:

- `docs/superpowers/specs/2026-06-01-ai-core-provider-adapter-design.md`
- `docs/superpowers/plans/2026-06-01-ai-core-provider-adapter.md`

## Scope

Own the Python provider abstraction.

Primary files:

- Create `backend/core/providers/__init__.py`
- Create `backend/core/providers/base.py`
- Create `backend/core/providers/openai_compatible.py`
- Create `backend/core/providers/anthropic.py`
- Create `backend/core/providers/factory.py`
- Modify `backend/core/llm_client.py`
- Modify `backend/core/embedding.py`
- Test under `backend/tests/`

Do not refactor Python API routes broadly. AI Gateway Agent owns route integration.

## Interface

Implement a small interface like:

```python
from dataclasses import dataclass
from typing import Iterable, Protocol

@dataclass
class ChatMessage:
    role: str
    content: str

class ChatProvider(Protocol):
    def chat(self, messages: list[ChatMessage], *, model: str, temperature: float, max_tokens: int, system: str | None = None) -> str:
        ...

    def stream_chat(self, messages: list[ChatMessage], *, model: str, temperature: float, max_tokens: int, system: str | None = None) -> Iterable[str]:
        ...

    def health_check(self) -> bool:
        ...

class EmbeddingProvider(Protocol):
    def embed(self, texts: list[str], *, model: str, dimensions: int | None = None) -> list[list[float]]:
        ...

    def health_check(self) -> bool:
        ...
```

Keep error messages stable and short. Reuse `format_llm_error()` behavior from `backend/core/llm_client.py`.

## Implementation Steps

- [ ] Write provider interface tests first with mocked HTTP or mocked SDK clients.
- [ ] Create provider base types and shared errors.
- [ ] Implement `OpenAICompatibleProvider` using the `openai` Python SDK for chat completions and embeddings.
- [ ] Implement `AnthropicProvider` using the existing `urllib.request` style or the installed Anthropic SDK.
- [ ] Implement streaming parsing for both providers as iterators yielding text chunks.
- [ ] Implement provider factory from normalized config.
- [ ] Update `backend/core/llm_client.py` to delegate to provider adapters.
- [ ] Update `backend/core/embedding.py` to delegate to provider adapters or share the OpenAI-compatible embedding implementation.
- [ ] Keep legacy function names `call_llm()` and `EmbeddingClient.from_config()` working for callers during migration.

## Suggested Tests

- OpenAI-compatible chat sends `model`, `messages`, `temperature`, and `max_tokens`.
- OpenAI-compatible embedding returns a list of vectors.
- Anthropic chat sends `system`, `messages`, and `max_tokens`.
- Factory returns Anthropic provider for `chat.provider = "anthropic"`.
- Factory returns OpenAI-compatible provider for `embedding.provider = "openai_compatible"`.
- Missing API key raises a clear provider config error.
- Legacy `call_llm()` still returns text through the provider layer.

## Verification Commands

```powershell
python -m pytest backend/tests -q
```

## Acceptance Criteria

- OpenAI-compatible and Anthropic chat providers exist.
- OpenAI-compatible embedding provider exists.
- Factory builds providers from normalized config.
- Legacy Python LLM and embedding entrypoints still work.
- No Node or frontend code is changed in this task.
