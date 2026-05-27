# backend/core/llm_client.py
import json
import re
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

from openai import OpenAI


class LLMCallError(RuntimeError):
    pass


def format_llm_error(error: Exception) -> str:
    message = str(error).strip() or error.__class__.__name__
    lowered = message.lower()
    error_type = error.__class__.__name__

    if "connection error" in lowered or error_type == "APIConnectionError":
        return "Connection error. Check your network and API endpoint."

    message = re.sub(r"<[^>]+>", " ", message)
    message = re.sub(r"\s+", " ", message).strip()
    if len(message) > 500:
        message = f"{message[:500]}..."
    return message


def call_anthropic_llm(
    api_key: str,
    base_url: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.2,
    max_tokens: int = 3000,
) -> str:
    base_url = base_url.rstrip("/")
    payload = json.dumps({
        "model": model,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }).encode("utf-8")

    request = urllib.request.Request(
        f"{base_url}/messages",
        data=payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code}: {error_body}") from e

    text_parts = [
        item.get("text", "")
        for item in data.get("content", [])
        if item.get("type") == "text"
    ]
    content = "\n".join(part.strip() for part in text_parts if part.strip())
    if not content:
        raise LLMCallError("Model returned empty response.")
    return content


def call_llm(
    client: Any,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.2,
    max_tokens: int = 3000,
    api_type: str = "openai",
    api_key: str = "",
    base_url: str = "",
) -> str:
    try:
        if api_type == "anthropic":
            return call_anthropic_llm(
                api_key=api_key,
                base_url=base_url,
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = response.choices[0].message.content
        if not content or not content.strip():
            raise LLMCallError("Model returned empty response.")
        return content.strip()
    except LLMCallError:
        raise
    except Exception as e:
        raise LLMCallError(f"LLM call failed: {format_llm_error(e)}") from e
