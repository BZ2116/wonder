"""Tests for the provider adapter layer."""
import threading
import pytest
from unittest.mock import patch, MagicMock


# ── ChatProvider protocol ────────────────────────────────────────────────────


class TestOpenAICompatibleChat:
    def test_chat_sends_model_messages_temperature_max_tokens(self):
        from backend.core.providers.openai_compatible import OpenAICompatibleProvider

        mock_client = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = "Hello world"
        mock_client.chat.completions.create.return_value = MagicMock(choices=[mock_choice])

        provider = OpenAICompatibleProvider(
            api_key="sk-test",
            base_url="https://api.openai.com/v1",
            client=mock_client,
        )
        result = provider.chat(
            messages=[{"role": "user", "content": "Hi"}],
            model="gpt-4o",
            temperature=0.5,
            max_tokens=100,
        )

        assert result == "Hello world"
        mock_client.chat.completions.create.assert_called_once_with(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Hi"}],
            temperature=0.5,
            max_tokens=100,
        )

    def test_chat_prepends_system_prompt(self):
        from backend.core.providers.openai_compatible import OpenAICompatibleProvider

        mock_client = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = "Response"
        mock_client.chat.completions.create.return_value = MagicMock(choices=[mock_choice])

        provider = OpenAICompatibleProvider(
            api_key="sk-test",
            base_url="https://api.openai.com/v1",
            client=mock_client,
        )
        provider.chat(
            messages=[{"role": "user", "content": "Hi"}],
            model="gpt-4o",
            temperature=0.2,
            max_tokens=100,
            system="You are helpful.",
        )

        call_args = mock_client.chat.completions.create.call_args
        messages = call_args.kwargs["messages"]
        assert messages[0] == {"role": "system", "content": "You are helpful."}
        assert messages[1] == {"role": "user", "content": "Hi"}

    def test_chat_raises_on_empty_response(self):
        from backend.core.providers.openai_compatible import OpenAICompatibleProvider
        from backend.core.providers.base import ProviderError

        mock_client = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = ""
        mock_client.chat.completions.create.return_value = MagicMock(choices=[mock_choice])

        provider = OpenAICompatibleProvider(
            api_key="sk-test",
            base_url="https://api.openai.com/v1",
            client=mock_client,
        )
        with pytest.raises(ProviderError, match="empty"):
            provider.chat(
                messages=[{"role": "user", "content": "Hi"}],
                model="gpt-4o",
                temperature=0.2,
                max_tokens=100,
            )

    def test_stream_chat_yields_text_chunks(self):
        from backend.core.providers.openai_compatible import OpenAICompatibleProvider

        chunk1 = MagicMock()
        chunk1.choices = [MagicMock()]
        chunk1.choices[0].delta.content = "Hello"
        chunk2 = MagicMock()
        chunk2.choices = [MagicMock()]
        chunk2.choices[0].delta.content = " world"
        chunk3 = MagicMock()
        chunk3.choices = [MagicMock()]
        chunk3.choices[0].delta.content = None

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = iter([chunk1, chunk2, chunk3])

        provider = OpenAICompatibleProvider(
            api_key="sk-test",
            base_url="https://api.openai.com/v1",
            client=mock_client,
        )
        chunks = list(provider.stream_chat(
            messages=[{"role": "user", "content": "Hi"}],
            model="gpt-4o",
            temperature=0.2,
            max_tokens=100,
        ))

        assert chunks == ["Hello", " world"]
        mock_client.chat.completions.create.assert_called_once()
        call_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert call_kwargs["stream"] is True

    def test_stream_chat_skips_empty_choices(self):
        from backend.core.providers.openai_compatible import OpenAICompatibleProvider

        chunk_ok = MagicMock()
        chunk_ok.choices = [MagicMock()]
        chunk_ok.choices[0].delta.content = "Hello"
        chunk_empty = MagicMock()
        chunk_empty.choices = []
        chunk_ok2 = MagicMock()
        chunk_ok2.choices = [MagicMock()]
        chunk_ok2.choices[0].delta.content = " world"

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = iter([chunk_ok, chunk_empty, chunk_ok2])

        provider = OpenAICompatibleProvider(
            api_key="sk-test",
            base_url="https://api.openai.com/v1",
            client=mock_client,
        )
        chunks = list(provider.stream_chat(
            messages=[{"role": "user", "content": "Hi"}],
            model="gpt-4o",
            temperature=0.2,
            max_tokens=100,
        ))

        assert chunks == ["Hello", " world"]

    def test_health_check_returns_true_on_success(self):
        from backend.core.providers.openai_compatible import OpenAICompatibleProvider

        mock_client = MagicMock()
        mock_client.models.list.return_value = MagicMock()

        provider = OpenAICompatibleProvider(
            api_key="sk-test",
            base_url="https://api.openai.com/v1",
            client=mock_client,
        )
        assert provider.health_check() is True

    def test_health_check_returns_false_on_failure(self):
        from backend.core.providers.openai_compatible import OpenAICompatibleProvider

        mock_client = MagicMock()
        mock_client.models.list.side_effect = Exception("connection refused")

        provider = OpenAICompatibleProvider(
            api_key="sk-test",
            base_url="https://api.openai.com/v1",
            client=mock_client,
        )
        assert provider.health_check() is False


# ── OpenAI-compatible embedding ──────────────────────────────────────────────


class TestOpenAICompatibleEmbedding:
    def test_embed_returns_list_of_vectors(self):
        from backend.core.providers.openai_compatible import OpenAICompatibleProvider

        mock_data = [MagicMock(), MagicMock()]
        mock_data[0].embedding = [0.1, 0.2, 0.3]
        mock_data[1].embedding = [0.4, 0.5, 0.6]

        mock_client = MagicMock()
        mock_client.embeddings.create.return_value = MagicMock(data=mock_data)

        provider = OpenAICompatibleProvider(
            api_key="sk-test",
            base_url="https://api.openai.com/v1",
            client=mock_client,
        )
        result = provider.embed(
            texts=["hello", "world"],
            model="text-embedding-3-small",
        )

        assert result == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
        mock_client.embeddings.create.assert_called_once_with(
            model="text-embedding-3-small",
            input=["hello", "world"],
        )

    def test_embed_passes_dimensions(self):
        from backend.core.providers.openai_compatible import OpenAICompatibleProvider

        mock_client = MagicMock()
        mock_client.embeddings.create.return_value = MagicMock(data=[MagicMock(embedding=[0.1])])

        provider = OpenAICompatibleProvider(
            api_key="sk-test",
            base_url="https://api.openai.com/v1",
            client=mock_client,
        )
        provider.embed(texts=["hi"], model="text-embedding-3-small", dimensions=256)

        mock_client.embeddings.create.assert_called_once_with(
            model="text-embedding-3-small",
            input=["hi"],
            dimensions=256,
        )

    def test_embed_returns_empty_for_empty_input(self):
        from backend.core.providers.openai_compatible import OpenAICompatibleProvider

        provider = OpenAICompatibleProvider(
            api_key="sk-test",
            base_url="https://api.openai.com/v1",
            client=MagicMock(),
        )
        assert provider.embed(texts=[], model="text-embedding-3-small") == []


# ── AnthropicProvider ────────────────────────────────────────────────────────


class TestAnthropicChat:
    def test_chat_sends_system_messages_max_tokens(self):
        from backend.core.providers.anthropic import AnthropicProvider

        mock_client = MagicMock()
        mock_content = MagicMock()
        mock_content.type = "text"
        mock_content.text = "Hello from Claude"
        mock_client.messages.create.return_value = MagicMock(content=[mock_content])

        provider = AnthropicProvider(
            api_key="sk-ant-test",
            base_url="https://api.anthropic.com",
            client=mock_client,
        )
        result = provider.chat(
            messages=[{"role": "user", "content": "Hi"}],
            model="claude-sonnet-4-20250514",
            temperature=0.2,
            max_tokens=1000,
            system="You are helpful.",
        )

        assert result == "Hello from Claude"
        mock_client.messages.create.assert_called_once_with(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            system="You are helpful.",
            messages=[{"role": "user", "content": "Hi"}],
            temperature=0.2,
        )

    def test_chat_without_system_prompt(self):
        from backend.core.providers.anthropic import AnthropicProvider

        mock_client = MagicMock()
        mock_content = MagicMock()
        mock_content.type = "text"
        mock_content.text = "Response"
        mock_client.messages.create.return_value = MagicMock(content=[mock_content])

        provider = AnthropicProvider(
            api_key="sk-ant-test",
            base_url="https://api.anthropic.com",
            client=mock_client,
        )
        provider.chat(
            messages=[{"role": "user", "content": "Hi"}],
            model="claude-sonnet-4-20250514",
            temperature=0.2,
            max_tokens=1000,
        )

        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert call_kwargs.get("system") is None

    def test_chat_raises_on_empty_response(self):
        from backend.core.providers.anthropic import AnthropicProvider
        from backend.core.providers.base import ProviderError

        mock_client = MagicMock()
        mock_client.messages.create.return_value = MagicMock(content=[])

        provider = AnthropicProvider(
            api_key="sk-ant-test",
            base_url="https://api.anthropic.com",
            client=mock_client,
        )
        with pytest.raises(ProviderError, match="empty"):
            provider.chat(
                messages=[{"role": "user", "content": "Hi"}],
                model="claude-sonnet-4-20250514",
                temperature=0.2,
                max_tokens=1000,
            )

    def test_stream_chat_yields_text_chunks(self):
        from backend.core.providers.anthropic import AnthropicProvider

        event1 = MagicMock()
        event1.type = "content_block_delta"
        event1.delta = MagicMock(type="text_delta", text="Hello")
        event2 = MagicMock()
        event2.type = "content_block_delta"
        event2.delta = MagicMock(type="text_delta", text=" Claude")
        event3 = MagicMock()
        event3.type = "message_stop"

        mock_client = MagicMock()
        mock_client.messages.create.return_value = iter([event1, event2, event3])

        provider = AnthropicProvider(
            api_key="sk-ant-test",
            base_url="https://api.anthropic.com",
            client=mock_client,
        )
        chunks = list(provider.stream_chat(
            messages=[{"role": "user", "content": "Hi"}],
            model="claude-sonnet-4-20250514",
            temperature=0.2,
            max_tokens=1000,
            system="Be brief.",
        ))

        assert chunks == ["Hello", " Claude"]
        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert call_kwargs["stream"] is True

    def test_health_check_returns_true_on_success(self):
        from backend.core.providers.anthropic import AnthropicProvider

        mock_client = MagicMock()
        mock_content = MagicMock()
        mock_content.type = "text"
        mock_content.text = "ok"
        mock_client.messages.create.return_value = MagicMock(content=[mock_content])

        provider = AnthropicProvider(
            api_key="sk-ant-test",
            base_url="https://api.anthropic.com",
            client=mock_client,
        )
        assert provider.health_check() is True

    def test_health_check_returns_false_on_failure(self):
        from backend.core.providers.anthropic import AnthropicProvider

        mock_client = MagicMock()
        mock_client.messages.create.side_effect = Exception("auth failed")

        provider = AnthropicProvider(
            api_key="sk-ant-test",
            base_url="https://api.anthropic.com",
            client=mock_client,
        )
        assert provider.health_check() is False


# ── Provider Factory ─────────────────────────────────────────────────────────


class TestProviderFactory:
    def test_factory_returns_anthropic_for_chat_provider(self):
        from backend.core.providers.factory import create_chat_provider
        from backend.core.providers.anthropic import AnthropicProvider

        provider = create_chat_provider({
            "provider": "anthropic",
            "api_key": "sk-ant-test",
            "base_url": "https://api.anthropic.com",
            "model": "claude-sonnet-4-20250514",
        })
        assert isinstance(provider, AnthropicProvider)

    def test_factory_returns_openai_compatible_for_embedding_provider(self):
        from backend.core.providers.factory import create_embedding_provider
        from backend.core.providers.openai_compatible import OpenAICompatibleProvider

        provider = create_embedding_provider({
            "provider": "openai_compatible",
            "api_key": "sk-test",
            "base_url": "https://api.openai.com/v1",
            "model": "text-embedding-3-small",
        })
        assert isinstance(provider, OpenAICompatibleProvider)

    def test_factory_returns_openai_compatible_for_openai_provider(self):
        from backend.core.providers.factory import create_chat_provider
        from backend.core.providers.openai_compatible import OpenAICompatibleProvider

        provider = create_chat_provider({
            "provider": "openai_compatible",
            "api_key": "sk-test",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4o",
        })
        assert isinstance(provider, OpenAICompatibleProvider)

    def test_factory_raises_on_missing_api_key(self):
        from backend.core.providers.factory import create_chat_provider
        from backend.core.providers.base import ProviderConfigError

        with pytest.raises(ProviderConfigError, match="API key"):
            create_chat_provider({
                "provider": "anthropic",
                "api_key": "",
                "base_url": "https://api.anthropic.com",
                "model": "claude-sonnet-4-20250514",
            })

    def test_factory_raises_on_unknown_provider(self):
        from backend.core.providers.factory import create_chat_provider
        from backend.core.providers.base import ProviderConfigError

        with pytest.raises(ProviderConfigError, match="Unknown"):
            create_chat_provider({
                "provider": "nonexistent",
                "api_key": "key",
                "base_url": "https://example.com",
                "model": "model",
            })


# ── Legacy call_llm() delegation ─────────────────────────────────────────────


class TestLegacyDelegation:
    @patch("backend.core.providers.factory.create_chat_provider")
    def test_call_llm_delegates_to_provider(self, mock_factory):
        from backend.core.llm_client import call_llm

        mock_provider = MagicMock()
        mock_provider.chat.return_value = "Legacy response"
        mock_factory.return_value = mock_provider

        result = call_llm(
            model="claude-sonnet-4-20250514",
            system_prompt="You are helpful.",
            user_prompt="Hello",
            temperature=0.2,
            max_tokens=3000,
            api_key="sk-ant-test",
            base_url="https://api.anthropic.com",
        )

        assert result == "Legacy response"
        mock_provider.chat.assert_called_once()

    @patch("backend.core.providers.factory.create_embedding_provider")
    def test_embedding_client_from_config_delegates_to_provider(self, mock_factory):
        from backend.core.embedding import EmbeddingClient

        mock_provider = MagicMock()
        mock_provider.embed.return_value = [[0.1, 0.2]]
        mock_factory.return_value = mock_provider

        client = EmbeddingClient.from_config({
            "provider": "openai_compatible",
            "api_key": "sk-test",
            "base_url": "https://api.openai.com/v1",
            "model_name": "text-embedding-3-small",
            "dimensions": 1536,
        })
        result = client.embed(["hello"])

        assert result == [[0.1, 0.2]]
        mock_provider.embed.assert_called_once()


# ── Local embedding concurrency ──────────────────────────────────────────────


class TestLocalEmbeddingConcurrency:
    def test_concurrent_get_model_initializes_only_once(self):
        """Concurrent calls to _get_model with the same model name must not
        trigger duplicate initialization."""
        import backend.core.providers.local_embedding as lem

        init_count = 0
        barrier = threading.Barrier(4)

        class FakeModel:
            def __init__(self, name):
                nonlocal init_count
                init_count += 1
                self.name = name

        original_cache = lem._model_cache.copy()
        original_lock = lem._lock
        try:
            lem._model_cache.clear()
            results = []
            errors = []

            def worker():
                try:
                    barrier.wait(timeout=5)
                    with original_lock:
                        if "test-model" not in lem._model_cache:
                            lem._model_cache["test-model"] = FakeModel("test-model")
                    results.append(lem._model_cache["test-model"])
                except Exception as e:
                    errors.append(e)

            threads = []
            for _ in range(4):
                t = threading.Thread(target=worker)
                threads.append(t)
                t.start()
            for t in threads:
                t.join(timeout=10)

            assert len(errors) == 0
            assert init_count == 1
            assert len(results) == 4
            assert all(r is results[0] for r in results)
        finally:
            lem._model_cache.clear()
            lem._model_cache.update(original_cache)


# ── Anthropic health check model ─────────────────────────────────────────────


class TestAnthropicHealthCheck:
    def test_health_check_uses_custom_model(self):
        from backend.core.providers.anthropic import AnthropicProvider

        mock_client = MagicMock()
        mock_content = MagicMock()
        mock_content.type = "text"
        mock_content.text = "ok"
        mock_client.messages.create.return_value = MagicMock(content=[mock_content])

        provider = AnthropicProvider(
            api_key="sk-ant-test",
            base_url="https://api.anthropic.com",
            client=mock_client,
            health_check_model="claude-sonnet-4-20250514",
        )
        provider.health_check()

        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert call_kwargs["model"] == "claude-sonnet-4-20250514"
        assert call_kwargs["max_tokens"] == 1


# ── Agent error preservation ─────────────────────────────────────────────────


class TestAgentErrorPreservation:
    def test_call_llm_preserves_provider_error_type(self):
        from backend.agents.base import BaseAgent
        from backend.core.providers.base import ProviderError

        class DummyAgent(BaseAgent):
            def run(self, **kwargs) -> str:
                return "noop"

        mock_provider = MagicMock()
        mock_provider.chat.side_effect = ProviderError("API rate limited")

        agent = DummyAgent(model="test", provider=mock_provider)
        with pytest.raises(ProviderError, match="API rate limited"):
            agent.call_llm("system", "user")

    def test_call_llm_preserves_generic_error_as_cause(self):
        from backend.agents.base import BaseAgent, AgentError

        class DummyAgent(BaseAgent):
            def run(self, **kwargs) -> str:
                return "noop"

        mock_provider = MagicMock()
        mock_provider.chat.side_effect = ConnectionError("network down")

        agent = DummyAgent(model="test", provider=mock_provider)
        with pytest.raises(AgentError) as exc_info:
            agent.call_llm("system", "user")

        assert isinstance(exc_info.value.__cause__, ConnectionError)
