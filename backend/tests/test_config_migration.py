import json
import pytest
from backend.core.config import ConfigManager, DEFAULT_CONFIG


@pytest.fixture
def config_path(tmp_path):
    return str(tmp_path / "config.json")


def test_missing_config_creates_normalized_defaults(config_path):
    manager = ConfigManager(config_path)
    config = manager.load()

    assert "model" in config
    assert "normalized_config" in config
    assert config["normalized_config"]["chat"]["provider"] == "anthropic"
    assert config["normalized_config"]["chat"]["model"] == "claude-sonnet-4-20250514"


def test_load_normalized_returns_normalized_config(config_path):
    manager = ConfigManager(config_path)
    normalized = manager.load_normalized()

    assert "chat" in normalized
    assert "embedding" in normalized
    assert "knowledge" in normalized
    assert "research" in normalized


def test_legacy_model_maps_to_chat(config_path):
    legacy = {
        "model": {
            "provider": "Anthropic",
            "api_key": "sk-ant-test",
            "base_url": "https://api.anthropic.com",
            "model_name": "claude-3-opus",
        },
        "embedding": DEFAULT_CONFIG["embedding"],
        "research": DEFAULT_CONFIG["research"],
        "watch": DEFAULT_CONFIG["watch"],
        "analysis": DEFAULT_CONFIG["analysis"],
        "knowledge": DEFAULT_CONFIG["knowledge"],
    }
    with open(config_path, "w") as f:
        json.dump(legacy, f)

    manager = ConfigManager(config_path)
    normalized = manager.load_normalized()

    assert normalized["chat"]["provider"] == "anthropic"
    assert normalized["chat"]["apiKey"] == "sk-ant-test"
    assert normalized["chat"]["model"] == "claude-3-opus"


def test_legacy_knowledge_max_context_tokens_maps_to_contextTokenLimit(config_path):
    legacy = {
        "model": DEFAULT_CONFIG["model"],
        "embedding": DEFAULT_CONFIG["embedding"],
        "research": DEFAULT_CONFIG["research"],
        "watch": DEFAULT_CONFIG["watch"],
        "analysis": DEFAULT_CONFIG["analysis"],
        "knowledge": {
            "enabled": True,
            "chroma_path": "data/chroma",
            "sqlite_path": "data/knowledge.db",
            "auto_index": False,
            "max_context_tokens": 12000,
        },
    }
    with open(config_path, "w") as f:
        json.dump(legacy, f)

    manager = ConfigManager(config_path)
    normalized = manager.load_normalized()

    assert normalized["knowledge"]["contextTokenLimit"] == 12000
    assert normalized["knowledge"]["autoIndex"] is False


def test_existing_normalized_config_not_overwritten(config_path):
    custom = {
        "model": DEFAULT_CONFIG["model"],
        "embedding": DEFAULT_CONFIG["embedding"],
        "research": DEFAULT_CONFIG["research"],
        "watch": DEFAULT_CONFIG["watch"],
        "analysis": DEFAULT_CONFIG["analysis"],
        "knowledge": DEFAULT_CONFIG["knowledge"],
        "normalized_config": {
            "chat": {
                "provider": "minimax",
                "preset": "minimax",
                "apiKey": "sk-mm",
                "baseUrl": "https://api.minimaxi.com",
                "model": "MiniMax-M2.7",
                "temperature": 0.5,
                "maxTokens": 8192,
            },
            "embedding": DEFAULT_CONFIG["normalized_config"]["embedding"],
            "knowledge": DEFAULT_CONFIG["normalized_config"]["knowledge"],
            "research": DEFAULT_CONFIG["normalized_config"]["research"],
        },
    }
    with open(config_path, "w") as f:
        json.dump(custom, f)

    manager = ConfigManager(config_path)
    normalized = manager.load_normalized()

    assert normalized["chat"]["provider"] == "minimax"
    assert normalized["chat"]["model"] == "MiniMax-M2.7"


def test_legacy_preserved_after_migration(config_path):
    """Legacy keys must still exist after migration."""
    legacy = {
        "model": DEFAULT_CONFIG["model"],
        "embedding": DEFAULT_CONFIG["embedding"],
        "research": DEFAULT_CONFIG["research"],
        "watch": DEFAULT_CONFIG["watch"],
        "analysis": DEFAULT_CONFIG["analysis"],
        "knowledge": DEFAULT_CONFIG["knowledge"],
    }
    with open(config_path, "w") as f:
        json.dump(legacy, f)

    manager = ConfigManager(config_path)
    # Trigger migration via load_normalized
    manager.load_normalized()

    # Re-load from disk - legacy keys should still be present
    config = manager.load()
    assert "model" in config
    assert config["model"]["model_name"] == "claude-sonnet-4-20250514"
    # Normalized config was added by migration
    assert "normalized_config" in config


def test_migration_persists_to_disk(config_path):
    """After migration, the config file should contain normalized_config."""
    legacy = {
        "model": DEFAULT_CONFIG["model"],
        "embedding": DEFAULT_CONFIG["embedding"],
        "research": DEFAULT_CONFIG["research"],
        "watch": DEFAULT_CONFIG["watch"],
        "analysis": DEFAULT_CONFIG["analysis"],
        "knowledge": DEFAULT_CONFIG["knowledge"],
    }
    with open(config_path, "w") as f:
        json.dump(legacy, f)

    manager = ConfigManager(config_path)
    manager.load_normalized()

    # Re-read from disk
    with open(config_path, "r", encoding="utf-8") as f:
        saved = json.load(f)

    assert "normalized_config" in saved
    assert saved["normalized_config"]["chat"]["provider"] == "anthropic"
