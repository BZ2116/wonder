# -*- coding: utf-8 -*-
"""
个人学习与科研资料整理 Agent

功能：
1. 上传 PDF / TXT / Markdown / DOCX 文件
2. 自动提取资料核心信息
3. 多 Agent 协作分析：
   - 文献解析 Agent
   - 项目关联 Agent
   - 写作辅助 Agent
   - 实验待办 Agent
4. 输出 Markdown 笔记、论文阅读卡片、项目关联分析和后续任务清单

运行：
streamlit run app.py
"""

import os
import re
import json
import time
import urllib.error
import urllib.request
from io import BytesIO
from datetime import datetime
from typing import List, Dict, Any

import streamlit as st
from dotenv import load_dotenv
from openai import OpenAI
from pypdf import PdfReader
from docx import Document


load_dotenv()

MINIMAX_CHINA_OPENAI_BASE_URL = "https://api.minimaxi.com/v1"
MINIMAX_GLOBAL_OPENAI_BASE_URL = "https://api.minimax.io/v1"
MINIMAX_WEB_HOSTS = ("platform.minimaxi.com", "www.minimaxi.com", "minimaxi.com")
MINIMAX_GLOBAL_WEB_HOSTS = ("platform.minimax.io", "www.minimax.io", "minimax.io")

DEFAULT_MODEL = os.getenv("MODEL_NAME", "MiniMax-M2.7")
DEFAULT_BASE_URL = os.getenv("OPENAI_BASE_URL", MINIMAX_CHINA_OPENAI_BASE_URL)
DEFAULT_API_KEY = os.getenv("OPENAI_API_KEY", "")

PROVIDER_PRESETS: Dict[str, Dict[str, Any]] = {
    "MiniMax": {
        "api_type": "openai",
        "base_url": MINIMAX_CHINA_OPENAI_BASE_URL,
        "models": [
            "MiniMax-M2.7",
            "MiniMax-M2.7-highspeed",
            "MiniMax-M2.5",
            "MiniMax-M2.5-highspeed",
            "MiniMax-M2.1",
            "MiniMax-M2.1-highspeed",
            "MiniMax-M2",
        ],
    },
    "GPT / OpenAI": {
        "api_type": "openai",
        "base_url": "https://api.openai.com/v1",
        "models": [
            "gpt-4.1-mini",
            "gpt-4.1",
            "gpt-4.1-nano",
            "gpt-4o-mini",
            "gpt-4o",
        ],
    },
    "Claude / Anthropic": {
        "api_type": "anthropic",
        "base_url": "https://api.anthropic.com/v1",
        "models": [
            "claude-sonnet-4-6",
            "claude-opus-4-6",
            "claude-haiku-4-5",
            "claude-haiku-4-5-20251001",
        ],
    },
    "DeepSeek": {
        "api_type": "openai",
        "base_url": "https://api.deepseek.com",
        "models": [
            "deepseek-v4-flash",
            "deepseek-v4-pro",
            "deepseek-chat",
            "deepseek-reasoner",
        ],
    },
    "MiMo / Xiaomi": {
        "api_type": "openai",
        "base_url": "https://api.xiaomimimo.com/v1",
        "models": [
            "xiaomi/mimo-v2-flash",
            "xiaomi/mimo-v2-pro",
            "xiaomi/mimo-v2-omni",
        ],
    },
    "自定义": {
        "api_type": "openai",
        "base_url": DEFAULT_BASE_URL,
        "models": [DEFAULT_MODEL],
    },
}

OUTPUT_DIR = "outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)


class LLMCallError(RuntimeError):
    """大模型调用失败，不应继续生成报告。"""


def format_llm_error(error: Exception) -> str:
    """将 SDK/网关异常整理成适合界面展示的短错误信息。"""
    message = str(error).strip() or error.__class__.__name__
    lowered = message.lower()
    error_type = error.__class__.__name__
    if "connection error" in lowered or error_type == "APIConnectionError":
        return (
            "Connection error. The API key may be valid, but this machine cannot reach the "
            "model endpoint. Check whether the Base URL matches your MiniMax account region, "
            "whether your proxy/VPN is enabled for Python/Streamlit, and whether the endpoint "
            f"can be opened from this network. China site: {MINIMAX_CHINA_OPENAI_BASE_URL}; "
            f"global site: {MINIMAX_GLOBAL_OPENAI_BASE_URL}."
        )
    if "<!doctype html" in lowered and "minimax" in lowered:
        return (
            "MiniMax returned an HTML 404 page. The Base URL is probably a website URL "
            "instead of the OpenAI-compatible API endpoint. Use "
            f"{MINIMAX_CHINA_OPENAI_BASE_URL} for the China site or "
            f"{MINIMAX_GLOBAL_OPENAI_BASE_URL} for the global site."
        )
    message = re.sub(r"<[^>]+>", " ", message)
    message = re.sub(r"\s+", " ", message).strip()
    if len(message) > 500:
        message = f"{message[:500]}..."
    return message


st.set_page_config(
    page_title="个人科研资料整理 Agent",
    page_icon="📚",
    layout="wide"
)

st.title("个人学习与科研资料整理 Agent")
st.caption("上传论文、技术文档或实验记录，自动生成结构化阅读卡片、项目关联分析、写作素材和待办清单。")


def render_agent_workflow_status(analysis_done: bool, answered_count: int = 0) -> None:
    """Render a screenshot-friendly overview of the multi-agent workflow."""
    if analysis_done:
        steps = [
            ("Step 1", "文献解析 Agent", "已完成", "#dafbe1", "#116329"),
            ("Step 2", "项目关联 Agent", "已完成", "#dafbe1", "#116329"),
            ("Step 3", "写作辅助 Agent", "已完成", "#dafbe1", "#116329"),
            ("Step 4", "任务规划 Agent", "已完成", "#dafbe1", "#116329"),
            ("Step 5", "问答 Agent", "等待提问" if answered_count == 0 else f"已回答 {answered_count} 次", "#fff8c5", "#663c00"),
        ]
    else:
        steps = [
            ("Step 1", "文献解析 Agent", "等待分析", "#eaeef2", "#57606a"),
            ("Step 2", "项目关联 Agent", "等待分析", "#eaeef2", "#57606a"),
            ("Step 3", "写作辅助 Agent", "等待分析", "#eaeef2", "#57606a"),
            ("Step 4", "任务规划 Agent", "等待分析", "#eaeef2", "#57606a"),
            ("Step 5", "问答 Agent", "等待资料", "#eaeef2", "#57606a"),
        ]

    with st.container(border=True):
        st.markdown("### Agent 工作流状态区")
        columns = st.columns(5)
        for column, (step_index, agent_name, status_text, badge_bg, badge_color) in zip(columns, steps):
            with column.container(border=True):
                st.markdown(f"**{step_index}**")
                st.markdown(f"#### {agent_name}")
                st.markdown(
                    f"""
                    <span style="
                        display: inline-flex;
                        margin-top: 1.2rem;
                        padding: 0.28rem 0.7rem;
                        border-radius: 999px;
                        background: {badge_bg};
                        color: {badge_color};
                        font-weight: 700;
                    ">{status_text}</span>
                    """,
                    unsafe_allow_html=True,
                )


def normalize_base_url(base_url: str) -> str:
    """Normalize common provider UI URLs to OpenAI-compatible API endpoints."""
    cleaned = (base_url or "").strip().rstrip("/")
    lowered = cleaned.lower()

    if any(host in lowered for host in MINIMAX_WEB_HOSTS) and "api.minimaxi.com" not in lowered:
        return MINIMAX_CHINA_OPENAI_BASE_URL

    if lowered == "https://api.minimaxi.com":
        return MINIMAX_CHINA_OPENAI_BASE_URL

    if any(host in lowered for host in MINIMAX_GLOBAL_WEB_HOSTS) and "api.minimax.io" not in lowered:
        return MINIMAX_GLOBAL_OPENAI_BASE_URL

    if lowered == "https://api.minimax.io":
        return MINIMAX_GLOBAL_OPENAI_BASE_URL

    return cleaned


def get_default_provider_index() -> int:
    normalized_default_base_url = normalize_base_url(DEFAULT_BASE_URL).lower()
    provider_names = list(PROVIDER_PRESETS)

    for idx, provider_name in enumerate(provider_names):
        preset = PROVIDER_PRESETS[provider_name]
        if normalize_base_url(preset["base_url"]).lower() == normalized_default_base_url:
            return idx
        if DEFAULT_MODEL in preset["models"]:
            return idx

    return provider_names.index("自定义")


def get_client(api_key: str, base_url: str, api_type: str = "openai") -> Any:
    """创建模型客户端配置。"""
    normalized_url = normalize_base_url(base_url)
    if api_type == "anthropic":
        return {
            "api_type": "anthropic",
            "api_key": api_key,
            "base_url": normalized_url,
        }
    return OpenAI(api_key=api_key, base_url=normalized_url, timeout=60.0)


def call_anthropic_llm(
    client_config: Dict[str, str],
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int
) -> str:
    """调用 Anthropic Messages API。"""
    base_url = client_config["base_url"].rstrip("/")
    payload = json.dumps(
        {
            "model": model,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/messages",
        data=payload,
        headers={
            "x-api-key": client_config["api_key"],
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
        raise LLMCallError("模型返回为空，请检查模型名称、接口地址或稍后重试。")
    return content


def call_llm(
    client: Any,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.2,
    max_tokens: int = 3000
) -> str:
    """调用大模型。"""
    try:
        if isinstance(client, dict) and client.get("api_type") == "anthropic":
            return call_anthropic_llm(
                client_config=client,
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
                {"role": "user", "content": user_prompt}
            ],
            temperature=temperature,
            max_tokens=max_tokens
        )
        content = response.choices[0].message.content
        if not content or not content.strip():
            raise LLMCallError("模型返回为空，请检查模型名称、接口地址或稍后重试。")
        return content.strip()
    except LLMCallError:
        raise
    except Exception as e:
        raise LLMCallError(f"模型调用失败：{format_llm_error(e)}") from e


def read_pdf(file_bytes: bytes) -> str:
    text_parts = []
    reader = PdfReader(BytesIO(file_bytes))

    for page_idx, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
            if text.strip():
                text_parts.append(f"\n\n--- 第 {page_idx + 1} 页 ---\n{text}")
        except Exception:
            text_parts.append(f"\n\n--- 第 {page_idx + 1} 页 ---\n[该页文本提取失败]")

    return "\n".join(text_parts)


def read_docx(file_bytes: bytes) -> str:
    doc = Document(BytesIO(file_bytes))
    paragraphs = []

    for p in doc.paragraphs:
        text = p.text.strip()
        if text:
            paragraphs.append(text)

    return "\n".join(paragraphs)


def read_text_file(file_bytes: bytes) -> str:
    encodings = ["utf-8", "gbk", "gb2312", "utf-16"]

    for enc in encodings:
        try:
            return file_bytes.decode(enc)
        except Exception:
            continue

    return file_bytes.decode("utf-8", errors="ignore")


def read_uploaded_file(uploaded_file) -> str:
    file_name = uploaded_file.name.lower()
    file_bytes = uploaded_file.read()

    if file_name.endswith(".pdf"):
        return read_pdf(file_bytes)

    if file_name.endswith(".docx"):
        return read_docx(file_bytes)

    if file_name.endswith(".txt") or file_name.endswith(".md"):
        return read_text_file(file_bytes)

    return read_text_file(file_bytes)


def clean_text(text: str) -> str:
    """清洗文本，减少无意义空白。"""
    text = text.replace("\u3000", " ")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def chunk_text(text: str, max_chars: int = 7000, overlap: int = 500) -> List[str]:
    """按字符长度切分文本。"""
    text = clean_text(text)

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


def estimate_tokens_by_chars(text: str) -> int:
    """粗略估算 token 数。中文场景下按 1.5 字符 ≈ 1 token 估算。"""
    return int(len(text) / 1.5)


def save_markdown_report(file_name: str, content: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = re.sub(r'[\\/:*?"<>|]', "_", file_name)
    output_path = os.path.join(OUTPUT_DIR, f"{timestamp}_{safe_name}_analysis.md")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)

    return output_path


def save_json_record(file_name: str, data: Dict[str, Any]) -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = re.sub(r'[\\/:*?"<>|]', "_", file_name)
    output_path = os.path.join(OUTPUT_DIR, f"{timestamp}_{safe_name}_record.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return output_path


def literature_parser_agent(client: Any, model: str, text_chunks: List[str]) -> str:
    """文献解析 Agent：先局部解析，再合并阅读卡片。"""
    system_prompt = """
你是一个严谨的中文科研资料解析 Agent。
你的任务是从论文、技术文档或实验记录中提取结构化信息。
要求：
1. 不编造原文没有的信息。
2. 对不确定内容标注“文中未明确说明”。
3. 输出中文。
4. 不输出冗长推理过程，只输出结构化结果。
"""

    partial_summaries = []
    progress = st.progress(0)
    status = st.empty()

    for idx, chunk in enumerate(text_chunks):
        status.write(f"文献解析 Agent 正在处理第 {idx + 1}/{len(text_chunks)} 个文本块……")

        user_prompt = f"""
请阅读以下资料片段，并提取结构化信息。

资料片段：
{chunk}

请按以下格式输出：

## 片段核心信息
- 研究背景：
- 核心问题：
- 方法或系统设计：
- 数据集/实验对象：
- 指标/评价方式：
- 关键结论：
- 可复用内容：
- 不确定或缺失信息：
"""

        result = call_llm(
            client=client,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=2200
        )

        partial_summaries.append(result)
        progress.progress((idx + 1) / len(text_chunks))
        time.sleep(0.2)

    status.write("文献解析 Agent 正在合并阅读卡片……")

    merged_prompt = f"""
以下是对同一份资料不同片段的解析结果，请进行去重、整合和重组，生成一份完整的科研阅读卡片。

片段解析结果：
{chr(10).join(partial_summaries)}

请严格按照以下格式输出：

# 科研资料阅读卡片

## 1. 资料主题概括
用 3 到 5 句话概括这份资料主要研究或讨论了什么。

## 2. 核心痛点
说明该资料试图解决的关键问题。

## 3. 方法或系统流程
按照流程顺序说明其技术路线、模型结构、算法逻辑或系统设计。

## 4. 数据集、实验设置与评价指标
分别整理数据来源、实验设置、评价指标、对比对象。

## 5. 主要结论
列出 3 到 6 条结论。

## 6. 创新点或可借鉴点
说明这份资料对后续科研、课程项目、论文写作或代码实现有哪些可复用价值。

## 7. 局限性与潜在问题
指出资料中方法、实验或论证可能存在的不足。

## 8. 一句话总结
用一句话总结该资料的价值。
"""

    final_result = call_llm(
        client=client,
        model=model,
        system_prompt=system_prompt,
        user_prompt=merged_prompt,
        temperature=0.2,
        max_tokens=3500
    )

    progress.empty()
    status.empty()

    return final_result


def project_relation_agent(
    client: Any,
    model: str,
    reading_card: str,
    user_research_context: str
) -> str:
    """项目关联 Agent。"""
    system_prompt = """
你是一个科研项目关联分析 Agent。
你的任务是判断当前资料与用户研究项目之间的关系。
要求：
1. 只基于用户给定的研究背景和资料内容分析。
2. 不夸大关联。
3. 输出应具体、可执行。
4. 不输出内部推理过程，只输出结论和依据。
"""

    user_prompt = f"""
用户当前研究/学习背景如下：
{user_research_context}

资料阅读卡片如下：
{reading_card}

请生成项目关联分析，格式如下：

# 项目关联分析

## 1. 相关性评分
请给出 0 到 5 分，并说明原因。
- 0：基本无关
- 1：弱相关
- 2：有少量参考价值
- 3：中等相关
- 4：高度相关
- 5：可直接用于当前项目

## 2. 可用于文献综述的内容
说明哪些内容适合写进研究背景或相关工作。

## 3. 可用于方法设计的内容
说明哪些思想、模块、流程、指标或实验设置可以迁移。

## 4. 可用于实验对比的内容
说明是否可以作为 baseline、对比方法、指标参考或消融实验参考。

## 5. 与当前项目的差异
说明它和用户项目之间的区别，避免生搬硬套。

## 6. 建议引用或记录的要点
用条目列出后续写论文、开题、答辩时可复用的要点。
"""

    return call_llm(
        client=client,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.2,
        max_tokens=3500
    )


def writing_agent(
    client: Any,
    model: str,
    reading_card: str,
    relation_analysis: str,
    writing_style: str
) -> str:
    """写作辅助 Agent。"""
    system_prompt = """
你是一个中文学术写作辅助 Agent。
你的任务是把结构化资料转化为论文写作素材。
要求：
1. 语言保持本科/研究生论文风格。
2. 避免口语化、夸张化表达。
3. 不捏造具体数据和引用。
4. 如缺少文献信息，用“需补充参考文献”标注。
"""

    user_prompt = f"""
资料阅读卡片：
{reading_card}

项目关联分析：
{relation_analysis}

用户希望的写作风格：
{writing_style}

请生成以下内容：

# 可复用写作素材

## 1. 文献综述段落
写 1 到 2 段，可用于论文“相关工作”或“研究背景”。

## 2. 方法启发段落
写 1 段，说明该资料对方法设计的启发。

## 3. 实验设计参考段落
写 1 段，说明它对实验设置、评价指标或对比实验的参考价值。

## 4. 可放入笔记的精简版
用 5 条以内 bullet points 总结。

## 5. 后续写作注意事项
指出哪些地方需要补充真实引用、数据或实验验证。
"""

    return call_llm(
        client=client,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.25,
        max_tokens=3500
    )


def todo_agent(client: Any, model: str, reading_card: str, relation_analysis: str) -> str:
    """实验/学习待办 Agent。"""
    system_prompt = """
你是一个科研任务规划 Agent。
你的任务是把资料分析结果转化为可执行的学习、实验和写作待办事项。
要求：
1. 待办事项必须具体。
2. 按优先级排序。
3. 给出预估工作量。
4. 输出中文。
"""

    user_prompt = f"""
资料阅读卡片：
{reading_card}

项目关联分析：
{relation_analysis}

请生成后续任务清单：

# 后续任务清单

## 1. 高优先级任务
用表格列出：任务、目的、预估时间、产出物。

## 2. 中优先级任务
用表格列出：任务、目的、预估时间、产出物。

## 3. 低优先级任务
用表格列出：任务、目的、预估时间、产出物。

## 4. 推荐执行顺序
给出 5 步以内的执行路径。

## 5. 风险提醒
指出可能遇到的问题，例如资料不完整、实验复现难、指标不一致等。
"""

    return call_llm(
        client=client,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.2,
        max_tokens=3200
    )


def qa_agent(
    client: Any,
    model: str,
    document_context: str,
    analysis_report: str,
    question: str
) -> str:
    """基于当前资料的问答 Agent。"""
    system_prompt = """
你是一个基于资料上下文的科研问答 Agent。
要求：
1. 优先基于用户上传资料和已有分析回答。
2. 如果资料中没有答案，明确说明“当前资料中未找到直接依据”。
3. 不编造论文结果、实验数据和引用。
4. 输出中文。
"""

    max_context_chars = 10000
    context = document_context[:max_context_chars]

    user_prompt = f"""
用户上传资料节选：
{context}

已有分析报告：
{analysis_report}

用户问题：
{question}

请回答用户问题，并在必要时说明依据来自资料中的哪一类信息。
"""

    return call_llm(
        client=client,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.2,
        max_tokens=2500
    )


def build_full_report(
    file_name: str,
    model_name: str,
    text_length: int,
    token_estimate: int,
    reading_card: str,
    relation_analysis: str,
    writing_materials: str,
    todo_list: str
) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return f"""# 个人科研资料整理 Agent 分析报告

- 文件名：{file_name}
- 使用模型：{model_name}
- 分析时间：{now}
- 文本长度：{text_length} 字符
- 粗略 Token 估计：{token_estimate}

---

{reading_card}

---

{relation_analysis}

---

{writing_materials}

---

{todo_list}
"""


with st.sidebar:
    st.header("模型配置")

    provider_names = list(PROVIDER_PRESETS)
    default_provider_index = get_default_provider_index()
    provider = st.selectbox(
        "模型接口",
        options=provider_names,
        index=default_provider_index,
        help="先选择模型服务商，会自动填入常用接口地址和模型列表。"
    )
    provider_preset = PROVIDER_PRESETS[provider]
    api_type = provider_preset["api_type"]

    api_key = st.text_input(
        "API Key",
        value=DEFAULT_API_KEY,
        type="password",
        help="填写你申请到的模型 token。"
    )

    base_url_default = (
        DEFAULT_BASE_URL
        if provider == "自定义"
        else provider_preset["base_url"]
    )
    base_url = st.text_input(
        "Base URL",
        value=base_url_default,
        help="可按需改成同服务商的其它兼容接口地址。"
    )

    normalized_base_url = normalize_base_url(base_url)
    if base_url.strip().rstrip("/") != normalized_base_url:
        st.warning(f"Base URL normalized to {normalized_base_url}")
        base_url = normalized_base_url

    model_options = list(provider_preset["models"])
    if (
        DEFAULT_MODEL
        and DEFAULT_MODEL not in model_options
        and provider == provider_names[default_provider_index]
    ):
        model_options.append(DEFAULT_MODEL)
    model_options.append("自定义模型名")
    model_index = model_options.index(DEFAULT_MODEL) if DEFAULT_MODEL in model_options else 0
    model_choice = st.selectbox(
        "Model Name",
        options=model_options,
        index=model_index,
        help="选择常用模型；如列表没有，可以选择自定义模型名。"
    )
    if model_choice == "自定义模型名":
        model = st.text_input(
            "Custom Model Name",
            value=DEFAULT_MODEL,
            help="填写服务商文档中的精确模型名称。"
        )
    else:
        model = model_choice

    st.divider()

    st.header("研究背景")

    default_context = """我是一名软件工程专业学生，关注人工智能、计算机视觉、深度学习和科研项目实践。
当前希望使用 AI Agent 辅助论文阅读、技术资料整理、实验记录管理和论文写作。
"""

    user_research_context = st.text_area(
        "你的研究/学习方向",
        value=default_context,
        height=180
    )

    writing_style = st.selectbox(
        "写作风格",
        options=[
            "本科毕业论文风格，表达清晰，避免过度复杂",
            "研究生论文风格，偏正式、强调研究逻辑",
            "项目报告风格，强调工程流程和落地价值",
            "答辩汇报风格，强调问题、方法、结果和贡献"
        ],
        index=0
    )


uploaded_file = st.file_uploader(
    "上传资料文件",
    type=["pdf", "txt", "md", "docx"],
    help="支持 PDF、TXT、Markdown、DOCX。"
)

col_a, col_b, col_c = st.columns(3)

with col_a:
    max_chars = st.number_input(
        "单个文本块最大字符数",
        min_value=3000,
        max_value=15000,
        value=7000,
        step=1000
    )

with col_b:
    overlap = st.number_input(
        "文本块重叠字符数",
        min_value=0,
        max_value=2000,
        value=500,
        step=100
    )

with col_c:
    run_analysis = st.button("开始分析", type="primary", use_container_width=True)


if "document_text" not in st.session_state:
    st.session_state.document_text = ""

if "analysis_report" not in st.session_state:
    st.session_state.analysis_report = ""

if "reading_card" not in st.session_state:
    st.session_state.reading_card = ""

if "relation_analysis" not in st.session_state:
    st.session_state.relation_analysis = ""

if "writing_materials" not in st.session_state:
    st.session_state.writing_materials = ""

if "todo_list" not in st.session_state:
    st.session_state.todo_list = ""

if "chat_history" not in st.session_state:
    st.session_state.chat_history = []


workflow_status_slot = st.empty()
with workflow_status_slot.container():
    render_agent_workflow_status(
        analysis_done=bool(st.session_state.analysis_report),
        answered_count=len(st.session_state.chat_history),
    )


if run_analysis:
    if not uploaded_file:
        st.error("请先上传文件。")
        st.stop()

    if not api_key:
        st.error("请先在侧边栏填写 API Key。")
        st.stop()

    client = get_client(api_key=api_key, base_url=base_url, api_type=api_type)

    with st.spinner("正在读取文件……"):
        raw_text = read_uploaded_file(uploaded_file)
        document_text = clean_text(raw_text)

    if not document_text.strip():
        st.error("未能从文件中提取到有效文本。PDF 如果是扫描版，需要先 OCR。")
        st.stop()

    st.session_state.document_text = document_text

    text_length = len(document_text)
    token_estimate = estimate_tokens_by_chars(document_text)
    text_chunks = chunk_text(
        document_text,
        max_chars=int(max_chars),
        overlap=int(overlap)
    )

    st.info(
        f"文件读取完成：共 {text_length} 个字符，粗略估计约 {token_estimate} tokens，"
        f"已切分为 {len(text_chunks)} 个文本块。"
    )

    try:
        with st.spinner("多 Agent 正在协作分析……"):
            reading_card = literature_parser_agent(
                client=client,
                model=model,
                text_chunks=text_chunks
            )

            relation_analysis = project_relation_agent(
                client=client,
                model=model,
                reading_card=reading_card,
                user_research_context=user_research_context
            )

            writing_materials = writing_agent(
                client=client,
                model=model,
                reading_card=reading_card,
                relation_analysis=relation_analysis,
                writing_style=writing_style
            )

            todo_list = todo_agent(
                client=client,
                model=model,
                reading_card=reading_card,
                relation_analysis=relation_analysis
            )

            full_report = build_full_report(
                file_name=uploaded_file.name,
                model_name=model,
                text_length=text_length,
                token_estimate=token_estimate,
                reading_card=reading_card,
                relation_analysis=relation_analysis,
                writing_materials=writing_materials,
                todo_list=todo_list
            )
    except LLMCallError as e:
        st.error(str(e))
        st.stop()

    st.session_state.reading_card = reading_card
    st.session_state.relation_analysis = relation_analysis
    st.session_state.writing_materials = writing_materials
    st.session_state.todo_list = todo_list
    st.session_state.analysis_report = full_report

    md_path = save_markdown_report(uploaded_file.name, full_report)
    json_path = save_json_record(
        uploaded_file.name,
        {
            "file_name": uploaded_file.name,
            "model": model,
            "text_length": text_length,
            "token_estimate": token_estimate,
            "created_at": datetime.now().isoformat(),
            "reading_card": reading_card,
            "relation_analysis": relation_analysis,
            "writing_materials": writing_materials,
            "todo_list": todo_list
        }
    )

    st.success("分析完成。")
    st.caption(f"Markdown 报告已保存到：{md_path}")
    st.caption(f"JSON 记录已保存到：{json_path}")
    workflow_status_slot.empty()
    with workflow_status_slot.container():
        render_agent_workflow_status(
            analysis_done=True,
            answered_count=len(st.session_state.chat_history),
        )


if st.session_state.analysis_report:
    tab1, tab2, tab3, tab4, tab5 = st.tabs(
        ["阅读卡片", "项目关联", "写作素材", "待办清单", "完整报告"]
    )

    with tab1:
        st.markdown(st.session_state.reading_card)

    with tab2:
        st.markdown(st.session_state.relation_analysis)

    with tab3:
        st.markdown(st.session_state.writing_materials)

    with tab4:
        st.markdown(st.session_state.todo_list)

    with tab5:
        st.download_button(
            label="下载 Markdown 报告",
            data=st.session_state.analysis_report,
            file_name="research_agent_report.md",
            mime="text/markdown"
        )
        st.markdown(st.session_state.analysis_report)


st.divider()
st.subheader("基于当前资料继续提问")

question = st.text_input(
    "输入你的问题",
    placeholder="例如：这篇资料能不能作为我论文相关工作的参考？有哪些指标可以借鉴？"
)

ask_button = st.button("提问", use_container_width=True)

if ask_button:
    if not st.session_state.document_text:
        st.error("请先上传并分析资料。")
        st.stop()

    if not api_key:
        st.error("请先在侧边栏填写 API Key。")
        st.stop()

    if not question.strip():
        st.error("请输入问题。")
        st.stop()

    client = get_client(api_key=api_key, base_url=base_url, api_type=api_type)

    try:
        with st.spinner("问答 Agent 正在生成回答……"):
            answer = qa_agent(
                client=client,
                model=model,
                document_context=st.session_state.document_text,
                analysis_report=st.session_state.analysis_report,
                question=question
            )
    except LLMCallError as e:
        st.error(str(e))
        st.stop()

    st.session_state.chat_history.append(
        {
            "question": question,
            "answer": answer,
            "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    )
    workflow_status_slot.empty()
    with workflow_status_slot.container():
        render_agent_workflow_status(
            analysis_done=bool(st.session_state.analysis_report),
            answered_count=len(st.session_state.chat_history),
        )

if st.session_state.chat_history:
    st.markdown("### 问答记录")

    for item in reversed(st.session_state.chat_history):
        with st.container(border=True):
            st.markdown(f"**问题：** {item['question']}")
            st.markdown(f"**回答：**\n\n{item['answer']}")
            st.caption(item["time"])
