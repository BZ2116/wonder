# 扩展 Provider 适配层

本文档说明如何为 Wonder 添加新的 LLM 或 Embedding Provider。

## 架构概览

Provider 适配层位于 `backend/core/providers/`，使用 Python Protocol 定义接口：

- `ChatProvider` — 聊天补全（`chat()`, `stream_chat()`, `health_check()`）
- `EmbeddingProvider` — 文本嵌入（`embed()`, `health_check()`）

工厂函数 `create_chat_provider()` 和 `create_embedding_provider()` 根据配置中的 `provider` 字段实例化对应适配器。

## 添加新的 Chat Provider

### 1. 创建适配器文件

在 `backend/core/providers/` 下新建文件，例如 `deepseek.py`：

```python
from .base import ProviderError

class DeepSeekProvider:
    """DeepSeek API (OpenAI 兼容) 适配器"""

    def __init__(self, api_key: str, base_url: str = "https://api.deepseek.com/v1"):
        from openai import OpenAI
        self._client = OpenAI(api_key=api_key, base_url=base_url)

    def chat(self, messages, *, model, temperature=0.2, max_tokens=4096, system=None):
        if system:
            messages = [{"role": "system", "content": system}] + list(messages)
        response = self._client.chat.completions.create(
            model=model, messages=messages,
            temperature=temperature, max_tokens=max_tokens,
        )
        content = response.choices[0].message.content
        if not content:
            raise ProviderError("Model returned empty response.")
        return content

    def stream_chat(self, messages, *, model, temperature=0.2, max_tokens=4096, system=None):
        if system:
            messages = [{"role": "system", "content": system}] + list(messages)
        stream = self._client.chat.completions.create(
            model=model, messages=messages,
            temperature=temperature, max_tokens=max_tokens, stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

    def health_check(self) -> bool:
        try:
            self._client.models.list()
            return True
        except Exception:
            return False
```

### 2. 注册到工厂

在 `backend/core/providers/factory.py` 中：

```python
from .deepseek import DeepSeekProvider

_PROVIDER_MAP: dict[str, type] = {
    "anthropic": AnthropicProvider,
    "openai_compatible": OpenAICompatibleProvider,
    "OpenAI": OpenAICompatibleProvider,
    "deepseek": DeepSeekProvider,  # 新增
}
```

### 3. 更新前端类型

在 `src/types/config.ts` 中：

```typescript
export type ChatProvider = 'openai_compatible' | 'anthropic' | 'minimax' | 'custom_openai_compatible' | 'deepseek'
```

### 4. 更新 Pydantic 模型

在 `backend/models/schemas.py` 中：

```python
class ChatConfig(BaseModel):
    provider: Literal["openai_compatible", "anthropic", "minimax", "custom_openai_compatible", "deepseek"] = "openai_compatible"
```

### 5. 添加 Provider 映射

在 `backend/core/config.py` 的 `_map_provider()` 中：

```python
def _map_provider(self, raw: str) -> str:
    lower = raw.lower()
    if lower == "deepseek":
        return "deepseek"
    # ... existing mappings
```

## 添加新的 Embedding Provider

流程与 Chat Provider 类似：

1. 创建适配器，实现 `EmbeddingProvider` Protocol（`embed()` + `health_check()`）
2. 在 `factory.py` 的 `_PROVIDER_MAP` 中注册
3. 更新 `src/types/config.ts` 的 `EmbeddingProvider` 类型
4. 更新 `backend/models/schemas.py` 的 `NormalizedEmbeddingConfig`

## 测试

为新 Provider 添加测试，参考 `backend/tests/test_providers.py` 中的现有测试模式：

```python
class TestDeepSeekChat:
    def test_chat_sends_model_messages(self):
        from backend.core.providers.deepseek import DeepSeekProvider
        mock_client = MagicMock()
        # ... mock and assert
```

## 验证

```bash
# Python 测试
python -m pytest backend/tests -q

# 健康检查
curl -X POST http://localhost:8000/api/config/health/chat
```
