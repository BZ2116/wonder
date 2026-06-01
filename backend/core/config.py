import copy
import json
import os
from typing import Any, Dict


DEFAULT_CONFIG = {
    "model": {
        "provider": "Anthropic",
        "api_key": "",
        "base_url": "https://api.anthropic.com",
        "model_name": "claude-sonnet-4-20250514",
    },
    "embedding": {
        "provider": "OpenAI",
        "api_key": "",
        "base_url": "https://api.openai.com/v1",
        "model_name": "text-embedding-3-small",
        "dimensions": 1536,
    },
    "research": {
        "background": "I am a student interested in AI and research.",
        "writing_style": "本科毕业论文风格，表达清晰，避免过度复杂",
    },
    "watch": {
        "enabled": False,
        "folder": "data/watch",
        "auto_delete_after_process": False,
    },
    "analysis": {
        "max_chars": 7000,
        "overlap": 500,
    },
    "knowledge": {
        "enabled": True,
        "chroma_path": "data/chroma",
        "sqlite_path": "data/knowledge.db",
        "auto_index": True,
        "max_context_tokens": 8000,
    },
    "normalized_config": {
        "chat": {
            "provider": "anthropic",
            "preset": "anthropic",
            "apiKey": "",
            "baseUrl": "https://api.anthropic.com",
            "model": "claude-sonnet-4-20250514",
            "temperature": 0.2,
            "maxTokens": 4096,
        },
        "embedding": {
            "provider": "openai_compatible",
            "preset": "openai",
            "apiKey": "",
            "baseUrl": "https://api.openai.com/v1",
            "model": "text-embedding-3-small",
            "dimensions": 1536,
        },
        "knowledge": {
            "enabled": True,
            "autoIndex": True,
            "contextTokenLimit": 8000,
        },
        "research": {
            "globalProfile": "",
        },
    },
}


class ConfigManager:
    def __init__(self, config_path: str):
        self.config_path = config_path

    def load(self) -> Dict[str, Any]:
        if not os.path.exists(self.config_path):
            self.save(DEFAULT_CONFIG)
            return copy.deepcopy(DEFAULT_CONFIG)
        with open(self.config_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def save(self, config: Dict[str, Any]) -> None:
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)

    def update(self, partial: Dict[str, Any]) -> Dict[str, Any]:
        config = self.load()
        self._deep_merge(config, partial)
        self.save(config)
        return config

    def _deep_merge(self, base: dict, override: dict) -> None:
        for key, value in override.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                self._deep_merge(base[key], value)
            else:
                base[key] = value

    def load_normalized(self) -> dict:
        """Load config, returning normalized_config if present, else migrating from legacy."""
        config = self.load()
        if "normalized_config" in config:
            return config["normalized_config"]
        return self._migrate_to_normalized(config)

    def _migrate_to_normalized(self, config: dict) -> dict:
        model = config.get("model", {})
        embedding = config.get("embedding", {})
        knowledge = config.get("knowledge", {})
        research = config.get("research", {})

        normalized = {
            "chat": {
                "provider": self._map_provider(model.get("provider", "")),
                "preset": model.get("provider", "").lower(),
                "apiKey": model.get("api_key", ""),
                "baseUrl": model.get("base_url", "https://api.anthropic.com"),
                "model": model.get("model_name", "claude-sonnet-4-20250514"),
                "temperature": 0.2,
                "maxTokens": 4096,
            },
            "embedding": {
                "provider": self._map_embedding_provider(embedding.get("provider", "")),
                "preset": embedding.get("provider", "").lower(),
                "apiKey": embedding.get("api_key", ""),
                "baseUrl": embedding.get("base_url", "https://api.openai.com/v1"),
                "model": embedding.get("model_name", "text-embedding-3-small"),
                "dimensions": embedding.get("dimensions", 1536),
            },
            "knowledge": {
                "enabled": knowledge.get("enabled", True),
                "autoIndex": knowledge.get("auto_index", True),
                "contextTokenLimit": knowledge.get("max_context_tokens", 8000),
            },
            "research": {
                "globalProfile": research.get("globalProfile", ""),
            },
        }
        # Persist the migrated normalized config
        config["normalized_config"] = normalized
        self.save(config)
        return normalized

    def _map_provider(self, raw: str) -> str:
        lower = raw.lower()
        if lower in ("anthropic",):
            return "anthropic"
        if lower in ("openai", "openai_compatible"):
            return "openai_compatible"
        if lower in ("minimax",):
            return "minimax"
        return "custom_openai_compatible"

    def _map_embedding_provider(self, raw: str) -> str:
        lower = raw.lower()
        if lower in ("openai", "openai_compatible"):
            return "openai_compatible"
        if lower in ("minimax",):
            return "minimax"
        return "openai_compatible"
