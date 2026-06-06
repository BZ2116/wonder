import json
import asyncio
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import Optional

def _threadsafe_put(loop: asyncio.AbstractEventLoop, queue: asyncio.Queue, item):
    """Safely put an item into an asyncio.Queue from a non-event-loop thread."""
    loop.call_soon_threadsafe(queue.put_nowait, item)

from backend.agents.literature import LiteratureParserAgent
from backend.agents.relation import ProjectRelationAgent
from backend.agents.writing import WritingAgent
from backend.agents.todo import TodoAgent
from backend.agents.orchestrator import Orchestrator
from backend.core.chunker import chunk_text
from backend.core.config import ConfigManager
from backend.core.providers.factory import create_chat_provider
from backend.models.schemas import GatewayAnalysisRequest, ChatConfig

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

WORKER_TIMEOUT = 300  # seconds — max idle time before stream emits error

import re as _re

def _extract_topic_summary(reading_card: str, max_len: int = 500) -> str:
    """Extract the Topic Summary section from a reading card as the document summary."""
    if not reading_card:
        return ""
    # Try to find "## 1. Topic Summary" or "## Topic Summary" section
    match = _re.search(r'##\s*(?:\d+[\.\)、]\s*)?Topic\s*Summary\s*\n(.*?)(?=\n##\s|\Z)', reading_card, _re.DOTALL | _re.IGNORECASE)
    if match:
        text = match.group(1).strip()
        if text:
            return text[:max_len]
    # Fallback: try Chinese heading
    match = _re.search(r'##\s*(?:\d+[\.\)、]\s*)?(?:主题摘要|摘要|概要)\s*\n(.*?)(?=\n##\s|\Z)', reading_card, _re.DOTALL)
    if match:
        text = match.group(1).strip()
        if text:
            return text[:max_len]
    # Last resort: first non-heading, non-empty line
    for line in reading_card.splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            return line[:max_len]
    return ""

config_manager = ConfigManager("data/config.json")


def _build_provider(chat_config: Optional[ChatConfig] = None):
    """Build a ChatProvider from normalized config or legacy config."""
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


@router.post("/gateway")
async def analyze_gateway(body: GatewayAnalysisRequest, req: Request):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="No text provided.")

    text_chunks = chunk_text(body.text, max_chars=body.max_chars, overlap=body.overlap)

    config = config_manager.load_normalized()
    chat = config.get("chat", {})
    model_name = chat.get("model", "claude-sonnet-4-20250514")
    provider = _build_provider(body.chat_config)

    agents = {
        "literature": LiteratureParserAgent(model_name, provider=provider),
        "relation": ProjectRelationAgent(model_name, provider=provider),
        "writing": WritingAgent(model_name, provider=provider),
        "todo": TodoAgent(model_name, provider=provider),
    }
    orchestrator = Orchestrator(agents=agents)

    progress_queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    put = lambda item: _threadsafe_put(loop, progress_queue, item)

    def progress_callback(current: int, total: int):
        put({"current": current, "total": total})

    def run_agents():
        try:
            for event in orchestrator.run_streaming(
                task_type="analyze_document",
                text_chunks=text_chunks,
                research_context="\n\n".join(
                    part for part in [body.global_profile, body.knowledge_base_readme] if part
                ),
                writing_style="",
                progress_callback=progress_callback,
                pdf_title=body.pdf_title or "",
            ):
                put(event)
        except Exception as exc:
            put({"error": str(exc)})
        finally:
            put(None)

    async def event_stream():
        import threading
        import time as _time
        thread = threading.Thread(target=run_agents, daemon=True)
        thread.start()

        result = {}
        last_activity = _time.monotonic()
        HEARTBEAT_INTERVAL = 30  # seconds
        try:
            while True:
                if await req.is_disconnected():
                    break

                # Check if worker thread has timed out
                if _time.monotonic() - last_activity >= WORKER_TIMEOUT:
                    yield f"event: error\ndata: {json.dumps({'error': 'Analysis timed out waiting for agent output.'}, ensure_ascii=False)}\n\n"
                    return

                # Thread finished — drain remaining queue items then exit loop
                try:
                    item = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    if not thread.is_alive():
                        break
                    # Send heartbeat if idle too long
                    if _time.monotonic() - last_activity >= HEARTBEAT_INTERVAL:
                        yield ": heartbeat\n\n"
                        last_activity = _time.monotonic()
                    continue

                last_activity = _time.monotonic()

                if item is None:
                    break

                if "error" in item:
                    yield f"event: error\ndata: {json.dumps({'error': item['error']}, ensure_ascii=False)}\n\n"
                    return

                if "current" in item:
                    yield f"event: progress\ndata: {json.dumps({'step': 'literature', 'chunkCount': item['current'], 'total': item['total']}, ensure_ascii=False)}\n\n"
                    continue

                step = item.get("step")
                status = item.get("status")

                # Handle events without status (e.g. relation_meta)
                if step and not status and "data" in item:
                    result[step] = item["data"]
                    continue

                if status == "running":
                    yield f"event: agent_start\ndata: {json.dumps({'step': step}, ensure_ascii=False)}\n\n"
                elif status == "done":
                    result[step] = item.get("data", "")
                    # Don't emit SSE for internal metadata events
                    if step not in ("relation_meta", "writing_meta"):
                        yield f"event: agent_done\ndata: {json.dumps({'step': step}, ensure_ascii=False)}\n\n"

            reading_card = result.get("literature", "")
            summary = _extract_topic_summary(reading_card)
            literature_meta = result.get("literature_meta", {})
            relation_meta = result.get("relation_meta", {})
            writing_meta = result.get("writing_meta", {})

            final = {
                "doc_id": body.doc_id,
                "file_name": body.file_name,
                "paper_title": literature_meta.get("paper_title", ""),
                "status": "ok",
                "failed_agents": [],
                "reading_card": reading_card,
                "relation_analysis": result.get("relation", ""),
                "writing_materials": result.get("writing", ""),
                "todo_list": result.get("todo", ""),
                "summary": summary,
                "tags": [],
                "source_chunks": text_chunks,
                "fit_score": relation_meta.get("fit_score"),
                "fit_reason": relation_meta.get("fit_reason", ""),
                "relation_type": relation_meta.get("relation_type", "unrelated"),
                "recommended_action": relation_meta.get("recommended_action", ""),
                "suggested_placement": relation_meta.get("suggested_placement", {}),
                "novelty_for_kb": relation_meta.get("novelty_for_kb", ""),
                "readme_suggestions": relation_meta.get("readme_suggestions", []),
                "writing_assets": writing_meta if writing_meta else {},
                "focused_signals": result.get("focused_signals", []),
                "decision_brief": relation_meta.get("decision_brief", {}),
                "knowledge_increment_score": relation_meta.get("knowledge_increment_score"),
                "evidence_strength_score": relation_meta.get("evidence_strength_score"),
                "actionability_score": relation_meta.get("actionability_score"),
            }
            yield f"event: complete\ndata: {json.dumps(final, ensure_ascii=False)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
