# Productor - AI-PRD Generator Agent

AI 驱动的产品需求文档 (PRD) 自动生成工具。输入自然语言需求，自动完成需求分析、原型生成、PRD 编写，并支持多轮迭代修正。

## 核心流程

```
用户需求输入 → AI需求分析 → AI原型生成 → AI PRD生成 → 用户确认 → (迭代修正) → 最终PRD
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 文本生成 | DeepSeek V3 (需求分析、PRD生成、反馈处理) |
| 图像生成 | Nanobanana Pro (产品原型图) |
| 运行时 | Node.js 18+ |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入 API Key
```

需要配置：
- `DEEPSEEK_API_KEY` - DeepSeek V3 API 密钥
- `NANOBANANA_API_KEY` - Nanobanana Pro API 密钥

### 3. 运行

```bash
npm start
```

## 项目结构

```
src/
├── index.js                    # CLI 入口 & 交互界面
├── agent/
│   ├── orchestrator.js         # 流程编排引擎
│   ├── requirementAnalyzer.js  # 需求分析 Agent (DeepSeek V3)
│   ├── prototypeGenerator.js   # 原型生成 Agent (Nanobanana Pro)
│   ├── prdGenerator.js         # PRD 生成 Agent (DeepSeek V3)
│   └── feedbackProcessor.js    # 反馈处理 Agent (DeepSeek V3)
├── models/
│   ├── deepseek.js             # DeepSeek V3 API 客户端
│   └── nanobanana.js           # Nanobanana Pro API 客户端
├── templates/
│   ├── prd-template.md         # PRD 文档模板
│   └── prompts/                # 各阶段 Prompt 模板
└── utils/
    ├── logger.js               # 日志工具
    └── fileManager.js          # 文件管理工具
```

## 使用流程

1. **输入需求** - 用自然语言描述你的产品构想
2. **AI 追问** - AI 会自动检查需求完整性，必要时追问
3. **自动生成** - 依次执行需求分析 → 原型生成 → PRD 生成
4. **审核确认** - 查看生成结果，选择通过或提出修改意见
5. **迭代优化** - AI 根据反馈定向修正，直到满意为止

## 输出文件

生成的文件保存在 `output/{project-id}/` 目录：

```
output/{project-id}/
├── PRD_v1.md              # 第一版 PRD
├── PRD_v2.md              # 修正后的 PRD (如有)
├── PRD_FINAL.md           # 最终确认版本
├── prototypes/            # 原型图 (PNG)
├── versions/              # 历史版本存档
└── project-state.json     # 项目状态
```

## License

This project is licensed under the MIT License.
