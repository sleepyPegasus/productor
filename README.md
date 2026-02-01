# Productor - AI PRD Generator

AI 驱动的产品需求文档 (PRD) 自动生成工具。前后端分离架构，通过 Web 界面输入产品需求，实时流式生成专业 PRD 文档，并支持多轮对话式迭代优化。

## 核心流程

```
用户输入需求 → AI 需求分析 → 页面结构规划 → 流式生成 PRD → 对话式迭代修正 → 最终 PRD
```

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React + Vite | SPA 应用，支持 SSE 实时流式输出 |
| 后端 | Python + FastAPI | RESTful API + SSE 流式接口 |
| AI Agent | LangChain | 多阶段 Agent 编排（需求分析、页面规划、PRD 生成、反馈修正） |
| 文本模型 | DeepSeek V3 | 需求分析、PRD 生成、反馈处理 |
| 图像模型 | GLM-Image | 产品原型图生成（可选） |
| 数据库 | SQLite | 项目和对话数据持久化 |

## 项目结构

```
productor/
├── backend/                        # Python 后端
│   ├── app/
│   │   ├── main.py                 # FastAPI 入口
│   │   ├── config.py               # 环境配置
│   │   ├── agents/                 # LangChain Agent 层
│   │   │   ├── orchestrator.py     # 流程编排（4 阶段 pipeline）
│   │   │   ├── llm.py              # LLM 客户端工厂
│   │   │   └── image_generator.py  # 图像生成客户端
│   │   ├── api/                    # API 路由
│   │   │   ├── projects.py         # 项目 CRUD
│   │   │   └── generation.py       # PRD 生成 / 修改（SSE 流式）
│   │   ├── db/
│   │   │   └── database.py         # SQLite 数据层
│   │   ├── models/
│   │   │   └── schemas.py          # Pydantic 模型
│   │   └── templates/              # Prompt 模板 + PRD 模板
│   ├── requirements.txt
│   ├── run.py
│   └── .env.example
├── frontend/                       # React 前端
│   ├── src/
│   │   ├── App.jsx                 # 路由入口
│   │   ├── pages/
│   │   │   ├── ProjectList.jsx     # 项目列表页
│   │   │   └── PRDWorkspace.jsx    # PRD 工作台（分屏视图）
│   │   ├── services/
│   │   │   └── api.js              # API 客户端 + SSE 流处理
│   │   └── styles/
│   │       └── global.css          # 全局样式
│   ├── package.json
│   └── vite.config.js
└── src/                            # 旧版 CLI（已弃用）
```

## 快速开始

### 1. 启动后端

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env，填入 API Key
python run.py
```

后端启动在 `http://localhost:8000`。

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端启动在 `http://localhost:3000`，API 请求自动代理到后端。

### 3. 使用

1. 打开 `http://localhost:3000`
2. 点击「新建项目」创建产品项目
3. 在右侧对话框输入产品需求描述
4. 左侧实时展示 AI 生成的 PRD 文档
5. 继续在对话框中输入修改意见进行迭代优化

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek V3 API 密钥 | 是 |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址 | 否（有默认值） |
| `GLM_IMAGE_API_KEY` | GLM-Image API 密钥 | 否（仅原型图功能需要） |

## 页面功能

### 项目列表页
- 展示所有产品项目卡片（名称、状态、版本、时间）
- 新建 / 删除项目

### PRD 工作台（分屏视图）
- **左侧 - PRD 展示区**：实时渲染 Markdown 格式的 PRD 文档，流式输出时自动滚动
- **右侧 - 需求对话框**：输入产品需求或修改意见，支持多轮对话式迭代

## License

MIT
