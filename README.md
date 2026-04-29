# Note-forge

一个面向个人学习与科研场景的 AI 学习资料整理 Agent。系统支持上传 PDF、TXT、Markdown、DOCX 文件，自动生成科研阅读卡片、项目关联分析、论文写作素材和后续任务清单。

## 功能特性

- 支持 PDF / TXT / Markdown / DOCX 文件上传
- 自动提取研究背景、核心问题、方法流程、数据集、评价指标、创新点和局限性
- 多 Agent 协作流程：
  - 文献解析 Agent
  - 项目关联 Agent
  - 写作辅助 Agent
  - 实验/学习待办 Agent
  - 基于资料的问答 Agent
- 支持常用模型接口预设，可接入 MiniMax、OpenAI、Anthropic Claude、DeepSeek、MiMo / Xiaomi 和自定义 OpenAI 兼容平台
- 自动保存 Markdown 报告和 JSON 记录

## 项目结构

```txt
research_agent/
├── app.py
├── requirements.txt
├── .env.example
├── .gitignore
├── README.md
└── outputs/
    └── .gitkeep
```

## 安装与运行

```bash
git clone <your-repo-url>
cd research_agent
pip install -r requirements.txt
cp .env.example .env
streamlit run app.py
```

然后在 `.env` 文件中填写你的模型服务信息：

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.minimax.io/v1
MODEL_NAME=MiniMax-M2.7

# MiniMax OpenAI-compatible example:
# OPENAI_BASE_URL=https://api.minimax.io/v1
# MODEL_NAME=MiniMax-M2.7
```

也可以在应用侧边栏中先选择常用模型接口（MiniMax、GPT / OpenAI、Claude / Anthropic、DeepSeek、MiMo / Xiaomi 或自定义），再选择对应模型名；Base URL 和模型名仍支持手动覆盖。

## 使用方式

1. 启动应用后，打开浏览器中的 Streamlit 页面。
2. 在侧边栏填写模型配置和个人研究方向。
3. 上传论文、技术文档或实验记录。
4. 点击“开始分析”。
5. 查看阅读卡片、项目关联、写作素材、待办清单和完整报告。
6. 可在底部继续基于当前资料进行问答。

## 适用场景

- 论文阅读与文献综述整理
- 科研项目资料归档
- 实验记录总结
- 开题、答辩、课程项目资料准备
- 技术文档快速分析

## 申请材料可用描述

我正在构建一个面向个人学习与科研场景的 AI 学习资料整理 Agent，主要用于解决论文阅读、项目资料分散、实验记录难以统一管理的问题。系统支持上传 PDF、Markdown、TXT 和 DOCX 文档，自动提取研究背景、核心问题、方法流程、数据集、评价指标、创新点和局限性，并生成结构化论文阅读卡片。

该 Agent 采用多 Agent 协作流程：文献解析 Agent 负责从原始资料中提取结构化信息；项目关联 Agent 根据用户当前研究方向判断资料与项目的相关性；写作辅助 Agent 将分析结果转化为论文综述、方法启发和实验设计素材；任务规划 Agent 进一步生成可执行的学习和实验待办清单。系统还支持基于上传资料的上下文问答，方便后续持续追问。

该项目主要面向个人科研和课程项目使用，目标是把 AI 从简单问答工具转化为可持续使用的科研资料管理助手。预计在日常使用中，可以将单篇论文的初步整理时间从约 1 小时降低到 15 至 20 分钟，并提升后续论文写作、实验设计和项目复盘的资料复用效率。
