import os

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from backend.core.config import ConfigManager
from backend.core.providers.factory import create_chat_provider
from backend.agents.readme_advisor import ReadmeAdvisorAgent
from backend.models.schemas import ChatConfig

router = APIRouter(prefix="/api/readme-advisor", tags=["readme-advisor"])

_config_path = os.environ.get("NOTE_FORGE_CONFIG_PATH", "data/config.json")
config_manager = ConfigManager(_config_path)


class ReadmeAdvisorRequest(BaseModel):
    model_config = {"extra": "forbid"}
    readme: str = ""
    document_summary: str = ""
    reading_card: str = ""
    chat_config: Optional[ChatConfig] = None


def _build_provider(chat_config: Optional[ChatConfig] = None):
    if chat_config is not None:
        return create_chat_provider({
            "provider": chat_config.provider,
            "api_key": chat_config.api_key,
            "base_url": chat_config.base_url,
            "model": chat_config.model,
        })
    config = config_manager.load_normalized()
    chat = config.get("chat", {})
    return create_chat_provider({
        "provider": chat.get("provider", "openai_compatible"),
        "api_key": chat.get("apiKey", ""),
        "base_url": chat.get("baseUrl", "https://api.anthropic.com"),
        "model": chat.get("model", "claude-sonnet-4-20250514"),
    })


@router.post("/generate")
async def generate_suggestions(body: ReadmeAdvisorRequest):
    if not body.readme or not body.document_summary:
        return {"suggestions": []}

    config = config_manager.load_normalized()
    chat = config.get("chat", {})
    model_name = chat.get("model", "claude-sonnet-4-20250514")
    provider = _build_provider(body.chat_config)

    agent = ReadmeAdvisorAgent(model_name, provider=provider)
    try:
        suggestions = agent.run(
            readme=body.readme,
            document_summary=body.document_summary,
            reading_card=body.reading_card,
        )
        return {"suggestions": suggestions}
    except Exception:
        return {"suggestions": []}
