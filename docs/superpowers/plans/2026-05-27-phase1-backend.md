# Phase 1: Backend Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract agent logic from monolithic app.py into modular FastAPI backend with config management and history tracking.

**Architecture:** FastAPI REST API with modular agent classes, file-based config persistence, and JSON-based history indexing.

**Tech Stack:** Python 3.13, FastAPI, uvicorn, python-dotenv, openai, pypdf, python-docx

---

## File Structure

```
backend/
├── main.py                    # FastAPI app entry point
├── requirements.txt           # Backend dependencies
├── api/
│   ├── __init__.py
│   ├── analysis.py           # /api/analysis/* routes
│   ├── history.py            # /api/history/* routes
│   └── config.py             # /api/config/* routes
├── agents/
│   ├── __init__.py
│   ├── base.py               # BaseAgent with shared LLM call logic
│   ├── literature.py         # LiteratureParserAgent
│   ├── relation.py           # ProjectRelationAgent
│   ├── writing.py            # WritingAgent
│   ├── todo.py               # TodoAgent
│   └── qa.py                 # QAAgent
├── core/
│   ├── __init__.py
│   ├── file_reader.py        # PDF/DOCX/TXT/MD reader
│   ├── llm_client.py         # LLM client wrapper (OpenAI + Anthropic)
│   ├── config.py             # Config manager (read/write config.json)
│   └── chunker.py            # Text chunking logic
├── models/
│   ├── __init__.py
│   └── schemas.py            # Pydantic models for API
tests/
├── __init__.py
├── test_file_reader.py
├── test_chunker.py
├── test_config.py
├── test_agents.py
└── test_api.py
data/
├── config.json               # User config (created at runtime)
├── outputs/                  # Analysis reports
└── history/                  # History index files
```

---

### Task 1: Project Setup & Dependencies

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/main.py`
- Create: `backend/__init__.py`

- [ ] **Step 1: Create backend requirements.txt**

```txt
fastapi==0.115.0
uvicorn==0.30.0
python-dotenv==1.0.1
openai==1.59.6
pypdf==5.1.0
python-docx==1.1.2
pydantic==2.9.0
python-multipart==0.0.9
```

- [ ] **Step 2: Create minimal FastAPI entry point**

```python
# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Note Forge API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 3: Test server starts**

Run: `cd backend && uvicorn main:app --reload --port 8000`
Expected: Server starts on http://localhost:8000

Visit http://localhost:8000/api/health → `{"status":"ok"}`

- [ ] **Step 4: Commit**

```bash
git add backend/
git commit -m "feat: initialize FastAPI backend structure"
```

---

### Task 2: File Reader Module

**Files:**
- Create: `backend/core/__init__.py`
- Create: `backend/core/file_reader.py`
- Create: `tests/test_file_reader.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_file_reader.py
import pytest
from backend.core.file_reader import read_file, clean_text

def test_read_markdown():
    content = b"# Hello\n\nWorld"
    result = read_file("test.md", content)
    assert "Hello" in result
    assert "World" in result

def test_read_txt_utf8():
    content = "你好世界".encode("utf-8")
    result = read_file("test.txt", content)
    assert "你好世界" in result

def test_read_txt_gbk():
    content = "你好世界".encode("gbk")
    result = read_file("test.txt", content)
    assert "你好世界" in result

def test_clean_text():
    text = "  hello   world  \n\n\n\n\n"
    result = clean_text(text)
    assert result == "hello   world"

def test_clean_text_chinese_space():
    text = "hello　world"
    result = clean_text(text)
    assert "　" not in result
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "E:\.code\My\note-forge" && python -m pytest tests/test_file_reader.py -v`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement file_reader.py**

```python
# backend/core/__init__.py
# (empty)
```

```python
# backend/core/file_reader.py
import re
from io import BytesIO
from pypdf import PdfReader
from docx import Document


def read_pdf(file_bytes: bytes) -> str:
    text_parts = []
    reader = PdfReader(BytesIO(file_bytes))
    for page_idx, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
            if text.strip():
                text_parts.append(f"\n\n--- Page {page_idx + 1} ---\n{text}")
        except Exception:
            text_parts.append(f"\n\n--- Page {page_idx + 1} ---\n[ extraction failed ]")
    return "\n".join(text_parts)


def read_docx(file_bytes: bytes) -> str:
    doc = Document(BytesIO(file_bytes))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def read_text(file_bytes: bytes) -> str:
    for enc in ["utf-8", "gbk", "gb2312", "utf-16"]:
        try:
            return file_bytes.decode(enc)
        except Exception:
            continue
    return file_bytes.decode("utf-8", errors="ignore")


def read_file(filename: str, file_bytes: bytes) -> str:
    name_lower = filename.lower()
    if name_lower.endswith(".pdf"):
        return read_pdf(file_bytes)
    if name_lower.endswith(".docx"):
        return read_docx(file_bytes)
    return read_text(file_bytes)


def clean_text(text: str) -> str:
    text = text.replace("　", " ")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "E:\.code\My\note-forge" && python -m pytest tests/test_file_reader.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/core/file_reader.py tests/test_file_reader.py
git commit -m "feat: add file reader module with PDF/DOCX/TXT support"
```

---

### Task 3: Text Chunker Module

**Files:**
- Create: `backend/core/chunker.py`
- Create: `tests/test_chunker.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_chunker.py
import pytest
from backend.core.chunker import chunk_text, estimate_tokens

def test_short_text_no_chunk():
    text = "Hello world"
    chunks = chunk_text(text, max_chars=100)
    assert len(chunks) == 1
    assert chunks[0] == text

def test_long_text_multiple_chunks():
    text = "a" * 2000
    chunks = chunk_text(text, max_chars=1000, overlap=100)
    assert len(chunks) == 3

def test_overlap_preserved():
    text = "abcdefghij" * 200  # 2000 chars
    chunks = chunk_text(text, max_chars=1000, overlap=100)
    # Second chunk should start at char 900 (1000 - 100)
    assert chunks[1][:100] == text[900:1000]

def test_estimate_tokens():
    text = "a" * 300
    tokens = estimate_tokens(text)
    assert tokens == 200  # 300 / 1.5 = 200
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "E:\.code\My\note-forge" && python -m pytest tests/test_chunker.py -v`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement chunker.py**

```python
# backend/core/chunker.py
from typing import List


def chunk_text(text: str, max_chars: int = 7000, overlap: int = 500) -> List[str]:
    if len(text) <= max_chars:
        return [text]

    chunks = []
    start = 0

    while start < len(text):
        end = start + max_chars
        chunk = text[start:end]
        chunks.append(chunk)

        if end >= len(text):
            break

        start = end - overlap
        if start < 0:
            start = 0

    return chunks


def estimate_tokens(text: str) -> int:
    return int(len(text) / 1.5)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "E:\.code\My\note-forge" && python -m pytest tests/test_chunker.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/core/chunker.py tests/test_chunker.py
git commit -m "feat: add text chunker module"
```

---

### Task 4: LLM Client Module

**Files:**
- Create: `backend/core/llm_client.py`

- [ ] **Step 1: Implement LLM client**

```python
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/core/llm_client.py
git commit -m "feat: add LLM client with OpenAI and Anthropic support"
```

---

### Task 5: Config Manager

**Files:**
- Create: `backend/core/config.py`
- Create: `tests/test_config.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_config.py
import json
import pytest
import tempfile
import os
from backend.core.config import ConfigManager

def test_default_config():
    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = os.path.join(tmpdir, "config.json")
        mgr = ConfigManager(config_path)
        config = mgr.load()
        assert "model" in config
        assert "research" in config
        assert config["model"]["provider"] == "MiniMax"

def test_save_and_load():
    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = os.path.join(tmpdir, "config.json")
        mgr = ConfigManager(config_path)
        config = mgr.load()
        config["model"]["provider"] = "OpenAI"
        mgr.save(config)

        mgr2 = ConfigManager(config_path)
        loaded = mgr2.load()
        assert loaded["model"]["provider"] == "OpenAI"

def test_update_config():
    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = os.path.join(tmpdir, "config.json")
        mgr = ConfigManager(config_path)
        mgr.load()
        mgr.update({"model": {"provider": "DeepSeek"}})
        config = mgr.load()
        assert config["model"]["provider"] == "DeepSeek"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "E:\.code\My\note-forge" && python -m pytest tests/test_config.py -v`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement config.py**

```python
# backend/core/config.py
import json
import os
from typing import Any, Dict


DEFAULT_CONFIG = {
    "model": {
        "provider": "MiniMax",
        "api_key": "",
        "base_url": "https://api.minimaxi.com/v1",
        "model_name": "MiniMax-M2.7",
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
}


class ConfigManager:
    def __init__(self, config_path: str):
        self.config_path = config_path

    def load(self) -> Dict[str, Any]:
        if not os.path.exists(self.config_path):
            self.save(DEFAULT_CONFIG)
            return DEFAULT_CONFIG.copy()
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "E:\.code\My\note-forge" && python -m pytest tests/test_config.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/core/config.py tests/test_config.py
git commit -m "feat: add config manager with persistence"
```

---

### Task 6: Pydantic Models

**Files:**
- Create: `backend/models/__init__.py`
- Create: `backend/models/schemas.py`

- [ ] **Step 1: Create Pydantic models**

```python
# backend/models/__init__.py
# (empty)
```

```python
# backend/models/schemas.py
from typing import List, Optional
from pydantic import BaseModel


class AnalysisRequest(BaseModel):
    max_chars: int = 7000
    overlap: int = 500


class AnalysisResponse(BaseModel):
    id: str
    file_name: str
    reading_card: str
    relation_analysis: str
    writing_materials: str
    todo_list: str
    full_report: str
    created_at: str


class HistoryItem(BaseModel):
    id: str
    file_name: str
    created_at: str
    model: str
    summary: str
    tags: List[str] = []


class HistoryListResponse(BaseModel):
    items: List[HistoryItem]
    total: int


class QARequest(BaseModel):
    question: str
    document_id: Optional[str] = None
    conversation_id: Optional[str] = None


class QAResponse(BaseModel):
    answer: str
    conversation_id: str
    sources: List[str] = []


class ConfigModel(BaseModel):
    model: dict
    research: dict
    watch: dict
    analysis: dict
```

- [ ] **Step 2: Commit**

```bash
git add backend/models/
git commit -m "feat: add Pydantic models for API"
```

---

### Task 7: Base Agent Class

**Files:**
- Create: `backend/agents/__init__.py`
- Create: `backend/agents/base.py`

- [ ] **Step 1: Implement base agent**

```python
# backend/agents/__init__.py
from .base import BaseAgent
from .literature import LiteratureParserAgent
from .relation import ProjectRelationAgent
from .writing import WritingAgent
from .todo import TodoAgent
from .qa import QAAgent

__all__ = [
    "BaseAgent",
    "LiteratureParserAgent",
    "ProjectRelationAgent",
    "WritingAgent",
    "TodoAgent",
    "QAAgent",
]
```

```python
# backend/agents/base.py
from abc import ABC, abstractmethod
from typing import Any

from backend.core.llm_client import call_llm


class BaseAgent(ABC):
    def __init__(self, client: Any, model: str, api_type: str = "openai", api_key: str = "", base_url: str = ""):
        self.client = client
        self.model = model
        self.api_type = api_type
        self.api_key = api_key
        self.base_url = base_url

    def call_llm(self, system_prompt: str, user_prompt: str, temperature: float = 0.2, max_tokens: int = 3000) -> str:
        return call_llm(
            client=self.client,
            model=self.model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            api_type=self.api_type,
            api_key=self.api_key,
            base_url=self.base_url,
        )

    @abstractmethod
    def run(self, **kwargs) -> str:
        pass
```

- [ ] **Step 2: Commit**

```bash
git add backend/agents/base.py backend/agents/__init__.py
git commit -m "feat: add base agent class"
```

---

### Task 8: Literature Parser Agent

**Files:**
- Create: `backend/agents/literature.py`

- [ ] **Step 1: Implement literature parser agent**

```python
# backend/agents/literature.py
from typing import List
from .base import BaseAgent


class LiteratureParserAgent(BaseAgent):
    SYSTEM_PROMPT = """
You are a rigorous Chinese research material analysis agent.
Your task is to extract structured information from papers, technical documents, or experiment records.
Requirements:
1. Do not fabricate information not in the original text.
2. Mark uncertain content as "文中未明确说明".
3. Output in Chinese.
4. Do not output lengthy reasoning, only structured results.
"""

    def run(self, text_chunks: List[str], progress_callback=None) -> str:
        partial_summaries = []

        for idx, chunk in enumerate(text_chunks):
            user_prompt = f"""
Please read the following material fragment and extract structured information.

Fragment:
{chunk}

Output format:

## Fragment Core Information
- Research Background:
- Core Problem:
- Method/System Design:
- Dataset/Experiment Objects:
- Metrics/Evaluation:
- Key Conclusions:
- Reusable Content:
- Uncertain/Missing Information:
"""
            result = self.call_llm(
                system_prompt=self.SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=0.2,
                max_tokens=2200,
            )
            partial_summaries.append(result)

            if progress_callback:
                progress_callback(idx + 1, len(text_chunks))

        merged_prompt = f"""
The following are analysis results from different fragments of the same material.
Please deduplicate, integrate, and reorganize into a complete research reading card.

Fragment Analysis Results:
{chr(10).join(partial_summaries)}

Output strictly in this format:

# Research Material Reading Card

## 1. Topic Summary
Summarize what this material researches or discusses in 3-5 sentences.

## 2. Core Pain Points
Explain the key problems this material tries to solve.

## 3. Method/System Workflow
Describe the technical route, model structure, algorithm logic, or system design in order.

## 4. Datasets, Experiment Settings & Metrics
Organize data sources, experiment settings, evaluation metrics, and comparison objects.

## 5. Main Conclusions
List 3-6 conclusions.

## 6. Innovations or Reference Points
Explain what reusable value this material has for research, course projects, paper writing, or code implementation.

## 7. Limitations & Potential Issues
Point out possible shortcomings in methods, experiments, or arguments.

## 8. One-line Summary
Summarize the value of this material in one sentence.
"""
        return self.call_llm(
            system_prompt=self.SYSTEM_PROMPT,
            user_prompt=merged_prompt,
            temperature=0.2,
            max_tokens=3500,
        )
```

- [ ] **Step 2: Commit**

```bash
git add backend/agents/literature.py
git commit -m "feat: add literature parser agent"
```

---

### Task 9: Project Relation Agent

**Files:**
- Create: `backend/agents/relation.py`

- [ ] **Step 1: Implement project relation agent**

```python
# backend/agents/relation.py
from .base import BaseAgent


class ProjectRelationAgent(BaseAgent):
    SYSTEM_PROMPT = """
You are a research project relation analysis agent.
Your task is to determine the relationship between current material and user's research project.
Requirements:
1. Only analyze based on user's research background and material content.
2. Do not exaggerate relevance.
3. Output should be specific and actionable.
4. Do not output internal reasoning, only conclusions and evidence.
"""

    def run(self, reading_card: str, user_research_context: str) -> str:
        user_prompt = f"""
User's current research/learning background:
{user_research_context}

Material reading card:
{reading_card}

Generate project relation analysis in this format:

# Project Relation Analysis

## 1. Relevance Score
Rate 0-5 and explain why.
- 0: Basically irrelevant
- 1: Weakly relevant
- 2: Some reference value
- 3: Moderately relevant
- 4: Highly relevant
- 5: Directly usable in current project

## 2. Content for Literature Review
What content is suitable for research background or related work.

## 3. Content for Method Design
What ideas, modules, workflows, metrics, or experiment settings can be transferred.

## 4. Content for Experiment Comparison
Whether it can serve as baseline, comparison method, metric reference, or ablation study reference.

## 5. Differences from Current Project
Explain differences between this material and user's project to avoid forced application.

## 6. Key Points for Citation/Recording
List bullet points reusable for paper writing, proposal, or defense.
"""
        return self.call_llm(
            system_prompt=self.SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=3500,
        )
```

- [ ] **Step 2: Commit**

```bash
git add backend/agents/relation.py
git commit -m "feat: add project relation agent"
```

---

### Task 10: Writing Agent

**Files:**
- Create: `backend/agents/writing.py`

- [ ] **Step 1: Implement writing agent**

```python
# backend/agents/writing.py
from .base import BaseAgent


class WritingAgent(BaseAgent):
    SYSTEM_PROMPT = """
You are a Chinese academic writing assistant agent.
Your task is to transform structured materials into paper writing materials.
Requirements:
1. Maintain undergraduate/graduate thesis style.
2. Avoid colloquial or exaggerated expressions.
3. Do not fabricate specific data or citations.
4. Mark missing references as "需补充参考文献".
"""

    def run(self, reading_card: str, relation_analysis: str, writing_style: str) -> str:
        user_prompt = f"""
Material reading card:
{reading_card}

Project relation analysis:
{relation_analysis}

User's preferred writing style:
{writing_style}

Generate the following content:

# Reusable Writing Materials

## 1. Literature Review Paragraphs
Write 1-2 paragraphs for "Related Work" or "Research Background".

## 2. Method Inspiration Paragraph
Write 1 paragraph explaining how this material inspires method design.

## 3. Experiment Design Reference Paragraph
Write 1 paragraph explaining its reference value for experiment settings, metrics, or comparison experiments.

## 4. Concise Notes Version
Summarize in 5 or fewer bullet points.

## 5. Writing Notes
Point out where real citations, data, or experiment verification need to be added.
"""
        return self.call_llm(
            system_prompt=self.SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.25,
            max_tokens=3500,
        )
```

- [ ] **Step 2: Commit**

```bash
git add backend/agents/writing.py
git commit -m "feat: add writing agent"
```

---

### Task 11: Todo Agent

**Files:**
- Create: `backend/agents/todo.py`

- [ ] **Step 1: Implement todo agent**

```python
# backend/agents/todo.py
from .base import BaseAgent


class TodoAgent(BaseAgent):
    SYSTEM_PROMPT = """
You are a research task planning agent.
Your task is to transform material analysis results into actionable learning, experiment, and writing to-do items.
Requirements:
1. Tasks must be specific.
2. Sort by priority.
3. Estimate workload.
4. Output in Chinese.
"""

    def run(self, reading_card: str, relation_analysis: str) -> str:
        user_prompt = f"""
Material reading card:
{reading_card}

Project relation analysis:
{relation_analysis}

Generate task list in this format:

# Follow-up Task List

## 1. High Priority Tasks
Table format: Task, Purpose, Estimated Time, Output.

## 2. Medium Priority Tasks
Table format: Task, Purpose, Estimated Time, Output.

## 3. Low Priority Tasks
Table format: Task, Purpose, Estimated Time, Output.

## 4. Recommended Execution Order
Give execution path within 5 steps.

## 5. Risk Reminders
Point out potential problems like incomplete materials, hard-to-reproduce experiments, inconsistent metrics.
"""
        return self.call_llm(
            system_prompt=self.SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=3200,
        )
```

- [ ] **Step 2: Commit**

```bash
git add backend/agents/todo.py
git commit -m "feat: add todo agent"
```

---

### Task 12: QA Agent

**Files:**
- Create: `backend/agents/qa.py`

- [ ] **Step 1: Implement QA agent**

```python
# backend/agents/qa.py
from typing import List, Dict, Optional
from .base import BaseAgent


class QAAgent(BaseAgent):
    SYSTEM_PROMPT = """
You are a research Q&A agent based on document context.
Requirements:
1. Prioritize answering based on uploaded materials and existing analysis.
2. If the answer is not in the materials, explicitly state "当前资料中未找到直接依据".
3. Do not fabricate paper results, experiment data, or citations.
4. Output in Chinese.
"""

    def run(
        self,
        document_context: str,
        analysis_report: str,
        question: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        max_context_chars = 10000
        context = document_context[:max_context_chars]

        history_text = ""
        if conversation_history:
            for msg in conversation_history[-6:]:  # Last 3 rounds
                history_text += f"\n{msg['role']}: {msg['content']}"

        user_prompt = f"""
Document excerpt:
{context}

Existing analysis report:
{analysis_report}

Conversation history:
{history_text}

User question:
{question}

Answer the user's question. When necessary, indicate which type of information from the materials your answer is based on.
"""
        return self.call_llm(
            system_prompt=self.SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=2500,
        )
```

- [ ] **Step 2: Commit**

```bash
git add backend/agents/qa.py
git commit -m "feat: add QA agent"
```

---

### Task 13: History Manager

**Files:**
- Create: `backend/core/history.py`
- Create: `tests/test_history.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_history.py
import json
import pytest
import tempfile
import os
from backend.core.history import HistoryManager

def test_save_and_list():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = HistoryManager(tmpdir)
        record_id = mgr.save(
            file_name="test.pdf",
            model="MiniMax-M2.7",
            reading_card="# Test",
            relation_analysis="# Relation",
            writing_materials="# Writing",
            todo_list="# Todo",
            full_report="# Full Report",
        )
        items = mgr.list_items()
        assert len(items) == 1
        assert items[0]["id"] == record_id
        assert items[0]["file_name"] == "test.pdf"

def test_get_item():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = HistoryManager(tmpdir)
        record_id = mgr.save(
            file_name="test.pdf",
            model="MiniMax-M2.7",
            reading_card="# Test",
            relation_analysis="# Relation",
            writing_materials="# Writing",
            todo_list="# Todo",
            full_report="# Full Report",
        )
        item = mgr.get_item(record_id)
        assert item is not None
        assert item["file_name"] == "test.pdf"

def test_delete_item():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = HistoryManager(tmpdir)
        record_id = mgr.save(
            file_name="test.pdf",
            model="MiniMax-M2.7",
            reading_card="# Test",
            relation_analysis="# Relation",
            writing_materials="# Writing",
            todo_list="# Todo",
            full_report="# Full Report",
        )
        mgr.delete_item(record_id)
        items = mgr.list_items()
        assert len(items) == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "E:\.code\My\note-forge" && python -m pytest tests/test_history.py -v`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement history manager**

```python
# backend/core/history.py
import json
import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional


class HistoryManager:
    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def save(
        self,
        file_name: str,
        model: str,
        reading_card: str,
        relation_analysis: str,
        writing_materials: str,
        todo_list: str,
        full_report: str,
        tags: List[str] = None,
    ) -> str:
        record_id = str(uuid.uuid4())[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = re.sub(r'[\\/:*?"<>|]', "_", file_name)

        # Save full report as markdown
        md_path = os.path.join(self.output_dir, f"{timestamp}_{safe_name}_analysis.md")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(full_report)

        # Save record as JSON
        record = {
            "id": record_id,
            "file_name": file_name,
            "created_at": datetime.now().isoformat(),
            "model": model,
            "tags": tags or [],
            "summary": self._extract_summary(reading_card),
            "reading_card": reading_card,
            "relation_analysis": relation_analysis,
            "writing_materials": writing_materials,
            "todo_list": todo_list,
            "report_path": md_path,
        }

        json_path = os.path.join(self.output_dir, f"{record_id}_record.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)

        return record_id

    def list_items(self) -> List[Dict[str, Any]]:
        items = []
        for filename in os.listdir(self.output_dir):
            if filename.endswith("_record.json"):
                filepath = os.path.join(self.output_dir, filename)
                with open(filepath, "r", encoding="utf-8") as f:
                    record = json.load(f)
                items.append({
                    "id": record["id"],
                    "file_name": record["file_name"],
                    "created_at": record["created_at"],
                    "model": record["model"],
                    "summary": record["summary"],
                    "tags": record.get("tags", []),
                })
        items.sort(key=lambda x: x["created_at"], reverse=True)
        return items

    def get_item(self, record_id: str) -> Optional[Dict[str, Any]]:
        filepath = os.path.join(self.output_dir, f"{record_id}_record.json")
        if not os.path.exists(filepath):
            return None
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)

    def delete_item(self, record_id: str) -> bool:
        filepath = os.path.join(self.output_dir, f"{record_id}_record.json")
        if not os.path.exists(filepath):
            return False
        os.remove(filepath)
        return True

    def _extract_summary(self, reading_card: str) -> str:
        lines = reading_card.split("\n")
        for line in lines:
            if line.strip() and not line.startswith("#"):
                return line.strip()[:100]
        return "No summary"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "E:\.code\My\note-forge" && python -m pytest tests/test_history.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/core/history.py tests/test_history.py
git commit -m "feat: add history manager"
```

---

### Task 14: API Routes - Config

**Files:**
- Create: `backend/api/__init__.py`
- Create: `backend/api/config.py`

- [ ] **Step 1: Implement config API routes**

```python
# backend/api/__init__.py
# (empty)
```

```python
# backend/api/config.py
from fastapi import APIRouter, HTTPException
from backend.core.config import ConfigManager
from backend.models.schemas import ConfigModel

router = APIRouter(prefix="/api/config", tags=["config"])

config_manager = ConfigManager("data/config.json")


@router.get("")
async def get_config():
    return config_manager.load()


@router.put("")
async def update_config(config: ConfigModel):
    config_manager.update(config.dict())
    return {"status": "ok"}
```

- [ ] **Step 2: Commit**

```bash
git add backend/api/config.py backend/api/__init__.py
git commit -m "feat: add config API routes"
```

---

### Task 15: API Routes - History

**Files:**
- Create: `backend/api/history.py`

- [ ] **Step 1: Implement history API routes**

```python
# backend/api/history.py
from fastapi import APIRouter, HTTPException
from backend.core.history import HistoryManager
from backend.models.schemas import HistoryListResponse, HistoryItem

router = APIRouter(prefix="/api/history", tags=["history"])

history_manager = HistoryManager("data/outputs")


@router.get("")
async def list_history():
    items = history_manager.list_items()
    return HistoryListResponse(items=items, total=len(items))


@router.get("/{record_id}")
async def get_history_item(record_id: str):
    item = history_manager.get_item(record_id)
    if not item:
        raise HTTPException(status_code=404, detail="Record not found")
    return item


@router.delete("/{record_id}")
async def delete_history_item(record_id: str):
    success = history_manager.delete_item(record_id)
    if not success:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"status": "deleted"}
```

- [ ] **Step 2: Commit**

```bash
git add backend/api/history.py
git commit -m "feat: add history API routes"
```

---

### Task 16: API Routes - Analysis

**Files:**
- Create: `backend/api/analysis.py`

- [ ] **Step 1: Implement analysis API routes**

```python
# backend/api/analysis.py
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional

from backend.agents import LiteratureParserAgent, ProjectRelationAgent, WritingAgent, TodoAgent
from backend.core.file_reader import read_file, clean_text
from backend.core.chunker import chunk_text, estimate_tokens
from backend.core.config import ConfigManager
from backend.core.history import HistoryManager
from backend.core.llm_client import LLMCallError
from openai import OpenAI

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

config_manager = ConfigManager("data/config.json")
history_manager = HistoryManager("data/outputs")


def get_client():
    config = config_manager.load()
    model_config = config["model"]

    if model_config["provider"] == "Claude / Anthropic":
        return None, "anthropic", model_config["api_key"], model_config["base_url"]

    client = OpenAI(
        api_key=model_config["api_key"],
        base_url=model_config["base_url"],
        timeout=60.0,
    )
    return client, "openai", "", ""


@router.post("/single")
async def analyze_single(
    file: UploadFile = File(...),
    max_chars: int = Form(7000),
    overlap: int = Form(500),
):
    # Read file
    file_bytes = await file.read()
    raw_text = read_file(file.filename, file_bytes)
    document_text = clean_text(raw_text)

    if not document_text.strip():
        raise HTTPException(status_code=400, detail="No text extracted from file.")

    # Chunk text
    text_chunks = chunk_text(document_text, max_chars=max_chars, overlap=overlap)
    token_estimate = estimate_tokens(document_text)

    # Get LLM client
    client, api_type, api_key, base_url = get_client()
    config = config_manager.load()
    model_name = config["model"]["model_name"]
    research_context = config["research"]["background"]
    writing_style = config["research"]["writing_style"]

    try:
        # Run agents
        lit_agent = LiteratureParserAgent(client, model_name, api_type, api_key, base_url)
        reading_card = lit_agent.run(text_chunks=text_chunks)

        rel_agent = ProjectRelationAgent(client, model_name, api_type, api_key, base_url)
        relation_analysis = rel_agent.run(
            reading_card=reading_card,
            user_research_context=research_context,
        )

        write_agent = WritingAgent(client, model_name, api_type, api_key, base_url)
        writing_materials = write_agent.run(
            reading_card=reading_card,
            relation_analysis=relation_analysis,
            writing_style=writing_style,
        )

        todo_agent = TodoAgent(client, model_name, api_type, api_key, base_url)
        todo_list = todo_agent.run(
            reading_card=reading_card,
            relation_analysis=relation_analysis,
        )

        # Build full report
        from datetime import datetime
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        full_report = f"""# Note Forge Analysis Report

- File: {file.filename}
- Model: {model_name}
- Time: {now}
- Text Length: {len(document_text)} chars
- Token Estimate: {token_estimate}

---

{reading_card}

---

{relation_analysis}

---

{writing_materials}

---

{todo_list}
"""

        # Save to history
        record_id = history_manager.save(
            file_name=file.filename,
            model=model_name,
            reading_card=reading_card,
            relation_analysis=relation_analysis,
            writing_materials=writing_materials,
            todo_list=todo_list,
            full_report=full_report,
        )

        return {
            "id": record_id,
            "file_name": file.filename,
            "reading_card": reading_card,
            "relation_analysis": relation_analysis,
            "writing_materials": writing_materials,
            "todo_list": todo_list,
            "full_report": full_report,
        }

    except LLMCallError as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 2: Commit**

```bash
git add backend/api/analysis.py
git commit -m "feat: add analysis API routes"
```

---

### Task 17: Main App Integration

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Update main.py to include all routes**

```python
# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.config import router as config_router
from backend.api.history import router as history_router
from backend.api.analysis import router as analysis_router

app = FastAPI(title="Note Forge API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_router)
app.include_router(history_router)
app.include_router(analysis_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 2: Test all endpoints**

Run: `cd backend && uvicorn main:app --reload --port 8000`

Test:
- GET http://localhost:8000/api/health → `{"status":"ok"}`
- GET http://localhost:8000/api/config → returns config
- GET http://localhost:8000/api/history → returns history list

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat: integrate all API routes"
```

---

### Task 18: Final Integration Test

- [ ] **Step 1: Run all tests**

Run: `cd "E:\.code\My\note-forge" && python -m pytest tests/ -v`
Expected: All PASS

- [ ] **Step 2: Start server and test manually**

Run: `cd "E:\.code\My\note-forge\backend" && uvicorn main:app --reload --port 8000`

Test with curl or browser:
1. GET /api/health
2. GET /api/config
3. GET /api/history
4. POST /api/analysis/single (with a test file)

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "feat: complete backend refactor (Phase 1)"
```
