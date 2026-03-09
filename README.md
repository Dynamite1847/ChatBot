# ChatBot (AI Client)

一个现代化、支持多模型流式对话的本地 AI 客户端。由 FastAPI 提供后端支持，Vite + React 提供前端界面。

## 特性

- **多模型支持**：无缝对接 Anthropic (Claude)、OpenAI (GPT) 和 Google (Gemini) 等大语言模型。
- **多模态与文件解析**：支持上传图片、PDF、Word 甚至 Markdown 文档，由后端解析后交由模型处理。
- **灵活的参数调优**：每个对话都可以独立设置其专属的系统提示词（System Prompt）、Token阈值、Top P 和 Temperature，支持防抖自动保存。
- **深度思考渲染**：(WIP) 支持良好的 `<think>` 标签思维链解析。
- **一键运行**：提供通用的本地服务启停脚本，化繁为简。

## 安装与快速启动

### 1. 前置要求

在运行前，请确保你的电脑上已经安装了：
- **Node.js**: `v18+` (用于前端)
- **Python**: `3.9+` (用于后端)

### 2. 配置环境变量

你需要通过 `config.json` 来配置你的 API Keys。项目中默认有一个示例，你可以通过前端的**设置中心 (⚙️)** 直接填入并保存：
- Anthropic API Key
- OpenAI API Key
- Google Gemini API Key

### 3. 一键启动服务

本项目提供了一个在 macOS/Linux 下通用的一键启停脚本 `start.sh`，他会自动寻找你当前环境的 Python 解析器。

运行前，请**确保激活了带有所有依赖的 conda/python 虚拟环境**：
```bash
# 1. 激活你的 Python 环境 (例如: conda activate chatbot)
# 2. 安装后端依赖 (仅首次运行需要)
pip install -r backend/requirements.txt

# 3. 运行一键脚本启动前后端
./start.sh start
```

启动成功后：
- 前端页面：[http://localhost:5173](http://localhost:5173)
- 后端文档：[http://localhost:8000/docs](http://localhost:8000/docs)

要**停止服务**，请运行：
```bash
./start.sh stop
```

## 技术栈

- **前端**：React, Vite, Zustand, React-Markdown
- **后端**：Python, FastAPI, Uvicorn, Pydantic
- **存储**：基于本地文件的 JSON 沉淀式存储 (`/sessions` 与 `/config.json`)
