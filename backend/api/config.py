from fastapi import APIRouter, HTTPException
from backend.core.config import ConfigManager
from backend.core.providers.factory import create_chat_provider, create_embedding_provider
from backend.core.providers.base import ProviderConfigError
from backend.models.schemas import ConfigModel, HealthCheckResponse

router = APIRouter(prefix="/api/config", tags=["config"])

config_manager = ConfigManager("data/config.json")


@router.get("")
async def get_config():
    config = config_manager.load()
    normalized = config_manager.load_normalized()
    return {**config, "normalized_config": normalized}


@router.put("")
async def update_config(config: ConfigModel):
    config_manager.update(config.dict())
    return {"status": "ok"}


@router.post("/health/chat", response_model=HealthCheckResponse)
async def health_chat():
    """Check if the configured chat provider is reachable."""
    config = config_manager.load_normalized()
    chat = config.get("chat", {})
    provider_name = chat.get("provider", "openai_compatible")

    try:
        provider = create_chat_provider({
            "provider": provider_name,
            "api_key": chat.get("apiKey", ""),
            "base_url": chat.get("baseUrl", ""),
            "model": chat.get("model", ""),
        })
        ok = provider.health_check()
        if ok:
            return HealthCheckResponse(status="ok", provider=provider_name)
        return HealthCheckResponse(status="error", provider=provider_name, message="Health check failed")
    except ProviderConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        return HealthCheckResponse(status="error", provider=provider_name, message=str(e))


@router.post("/health/embedding", response_model=HealthCheckResponse)
async def health_embedding():
    """Check if the configured embedding provider is reachable."""
    config = config_manager.load_normalized()
    emb = config.get("embedding", {})
    provider_name = emb.get("provider", "openai_compatible")

    try:
        provider = create_embedding_provider({
            "provider": provider_name,
            "api_key": emb.get("apiKey", ""),
            "base_url": emb.get("baseUrl", ""),
            "model": emb.get("model", ""),
        })
        ok = provider.health_check()
        if ok:
            return HealthCheckResponse(status="ok", provider=provider_name)
        return HealthCheckResponse(status="error", provider=provider_name, message="Health check failed")
    except ProviderConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        return HealthCheckResponse(status="error", provider=provider_name, message=str(e))
