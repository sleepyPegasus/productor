# AI-PRD Generator Agent - 产品设计文档

## 1. 流程合理性分析

### 1.1 传统流程 vs AI 驱动流程

| 阶段 | 传统流程 | AI 驱动流程 | 改进点 |
|------|---------|------------|--------|
| 需求收集 | 人工访谈、问卷 | 自然语言输入 + AI 追问补全 | 降低沟通成本，结构化输出 |
| 需求分析 | 产品经理手动拆解 | DeepSeek V3 自动分析拆解 | 速度快，覆盖面广，不遗漏边界 |
| 产品原型 | UI 设计师手动绘制 | GLM-Image 生成线框图 | 快速出图，支持多方案对比 |
| PRD 编写 | 产品经理手动撰写 | DeepSeek V3 按模板生成 | 格式统一，内容完整，可追溯 |
| 需求确认 | 线下会议评审 | AI 辅助对比 + 用户在线确认 | 可迭代，版本可控 |

### 1.2 合理性评估

**优势：**
- **效率提升**：从需求到 PRD 的周期从天级缩短到分钟级
- **质量一致性**：模板化 + AI 生成确保文档格式和内容标准统一
- **迭代闭环**：用户反馈自动合并，支持多轮迭代直到确认
- **可追溯性**：每轮迭代自动版本化，变更历史清晰可查

**风险与应对：**
- **需求理解偏差** → 通过多轮追问机制 + 结构化确认清单缓解
- **原型图精度不足** → 定位为"概念原型"而非"交付设计稿"，后续仍需设计师精修
- **PRD 模板局限性** → 提供多种行业模板，支持自定义模板扩展
- **AI 幻觉风险** → 每阶段输出经用户确认后才进入下一阶段

### 1.3 流程架构

```
┌─────────────────────────────────────────────────────────┐
│                    AI-PRD Generator Agent                │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌─────┐ │
│  │ 需求输入  │──▶│ 需求分析  │──▶│ 原型生成  │──▶│ PRD │ │
│  │ (User)   │   │(DeepSeek)│   │(GLM-Image)│   │生成 │ │
│  └──────────┘   └──────────┘   └──────────┘   └──┬──┘ │
│       ▲                                          │     │
│       │         ┌──────────┐                     │     │
│       └─────────│ 用户确认  │◀────────────────────┘     │
│                 │& 反馈修正 │                           │
│                 └──────────┘                           │
└─────────────────────────────────────────────────────────┘
```

## 2. AI 工具与大模型规划

### 2.1 模型选型

| 功能模块 | 模型 | 用途 | 选型理由 |
|---------|------|------|---------|
| 需求分析 | DeepSeek V3 | 需求拆解、结构化、补全 | 中文理解能力强，推理能力优秀 |
| PRD 生成 | DeepSeek V3 | 按模板填充 PRD 内容 | 长文本生成质量高，格式遵循好 |
| 反馈处理 | DeepSeek V3 | 解析用户反馈，修正文档 | 理解上下文能力强 |
| 原型生成 | GLM-Image | 生成产品线框图/原型图 | 图像生成质量高 |

### 2.2 Agent 工具链

```
┌─────────────────────────────────────────┐
│            Orchestrator Agent            │
│         (流程编排 / 状态管理)             │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │ DeepSeek V3 │  │ GLM-Image  │   │
│  │  API Client │  │   API Client    │   │
│  └──────┬──────┘  └───────┬─────────┘   │
│         │                 │             │
│  ┌──────┴──────────────────┴─────────┐  │
│  │        Agent Modules              │  │
│  │  ┌────────────────────────────┐   │  │
│  │  │ RequirementAnalyzer        │   │  │
│  │  │ - 需求拆解与结构化          │   │  │
│  │  │ - 功能点提取               │   │  │
│  │  │ - 边界条件识别              │   │  │
│  │  └────────────────────────────┘   │  │
│  │  ┌────────────────────────────┐   │  │
│  │  │ PrototypeGenerator         │   │  │
│  │  │ - 页面描述生成             │   │  │
│  │  │ - 线框图/原型图生成         │   │  │
│  │  └────────────────────────────┘   │  │
│  │  ┌────────────────────────────┐   │  │
│  │  │ PRDGenerator               │   │  │
│  │  │ - 模板填充                 │   │  │
│  │  │ - 文档结构化输出            │   │  │
│  │  └────────────────────────────┘   │  │
│  │  ┌────────────────────────────┐   │  │
│  │  │ FeedbackProcessor          │   │  │
│  │  │ - 反馈解析                 │   │  │
│  │  │ - 差异对比                 │   │  │
│  │  │ - 增量修正                 │   │  │
│  │  └────────────────────────────┘   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │        Output & Storage           │  │
│  │  - PRD 文档 (Markdown)            │  │
│  │  - 原型图 (PNG/SVG)              │  │
│  │  - 版本历史 (JSON)               │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## 3. 详细流程设计

### 3.1 Phase 1: 需求输入与理解

```
用户输入 (自然语言)
    │
    ▼
┌─────────────────────────────┐
│ RequirementAnalyzer         │
│                             │
│ Step 1: 初步理解            │
│   - 提取核心需求            │
│   - 识别产品类型            │
│   - 判断目标用户            │
│                             │
│ Step 2: 智能追问 (可选)      │
│   - 识别信息缺失点          │
│   - 生成补充问题            │
│   - 等待用户补充            │
│                             │
│ Step 3: 结构化输出           │
│   - 功能需求列表            │
│   - 非功能需求列表          │
│   - 用户故事 (User Stories) │
│   - 优先级排序              │
└─────────────┬───────────────┘
              │
              ▼
        结构化需求文档 (JSON)
```

### 3.2 Phase 2: 产品原型生成

```
结构化需求文档
    │
    ▼
┌─────────────────────────────┐
│ PrototypeGenerator          │
│                             │
│ Step 1: 页面规划             │
│   - DeepSeek V3 分析需求    │
│   - 确定页面列表            │
│   - 定义页面流转关系         │
│                             │
│ Step 2: 页面描述生成         │
│   - 为每个页面生成           │
│     布局描述文本             │
│                             │
│ Step 3: 原型图生成           │
│   - GLM-Image          │
│     生成线框图/原型图        │
│   - 每个关键页面一张图       │
└─────────────┬───────────────┘
              │
              ▼
        原型图集合 (PNG files)
```

### 3.3 Phase 3: PRD 文档生成

```
结构化需求 + 原型图
    │
    ▼
┌─────────────────────────────┐
│ PRDGenerator                │
│                             │
│ Step 1: 选择/加载模板        │
│   - 根据产品类型匹配模板    │
│   - 加载 PRD 模板           │
│                             │
│ Step 2: 逐章节生成内容       │
│   - 产品概述                │
│   - 目标用户与场景          │
│   - 功能需求详述            │
│   - 非功能需求              │
│   - 信息架构                │
│   - 页面流程                │
│   - 数据需求                │
│   - 里程碑规划              │
│                             │
│ Step 3: 组装完整 PRD        │
│   - 合并各章节              │
│   - 插入原型图引用          │
│   - 生成目录                │
└─────────────┬───────────────┘
              │
              ▼
        完整 PRD 文档 (Markdown)
```

### 3.4 Phase 4: 用户确认与迭代

```
PRD 文档 + 原型图
    │
    ▼
┌─────────────────────────────┐
│ 用户评审                     │
│                             │
│ 选项 A: ✅ 确认通过          │
│   → 输出最终版本             │
│   → 流程结束                │
│                             │
│ 选项 B: ✏️ 提出修改意见      │
│   → 进入反馈处理            │
│   → 重新进入流程            │
│                             │
│ 选项 C: ❌ 推翻重来          │
│   → 回到需求输入阶段        │
│   → 保留历史记录            │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ FeedbackProcessor           │
│                             │
│ - 解析用户反馈文本          │
│ - 映射到 PRD 具体章节       │
│ - 生成修改指令              │
│ - 触发定向重新生成          │
│ - 输出新版本 PRD            │
│ - diff 对比展示变更         │
└─────────────────────────────┘
```

## 4. 数据模型

### 4.1 项目状态 (ProjectState)

```json
{
  "projectId": "uuid",
  "projectName": "string",
  "version": 1,
  "status": "analyzing | prototyping | generating | reviewing | approved",
  "rawRequirement": "用户原始输入",
  "structuredRequirement": { ... },
  "prototypes": [
    { "pageId": "string", "pageName": "string", "imagePath": "string" }
  ],
  "prdPath": "string",
  "history": [
    {
      "version": 1,
      "timestamp": "ISO8601",
      "action": "created | revised",
      "feedback": "string | null",
      "prdPath": "string"
    }
  ]
}
```

### 4.2 结构化需求 (StructuredRequirement)

```json
{
  "productName": "string",
  "productType": "web | mobile | desktop | api | other",
  "productSummary": "string",
  "targetUsers": [
    { "persona": "string", "description": "string" }
  ],
  "coreFeatures": [
    {
      "id": "F001",
      "name": "string",
      "description": "string",
      "priority": "P0 | P1 | P2",
      "userStories": ["string"]
    }
  ],
  "nonFunctionalRequirements": [
    { "category": "string", "description": "string" }
  ],
  "constraints": ["string"],
  "assumptions": ["string"]
}
```

## 5. 技术架构

### 5.1 技术栈

- **运行时**: Node.js 18+
- **语言**: JavaScript (ES Modules)
- **文本模型**: DeepSeek V3 (通过 OpenAI 兼容 API)
- **图像模型**: GLM-Image (通过 REST API)
- **输出格式**: Markdown (PRD), PNG (原型图), JSON (状态)

### 5.2 目录结构

```
productor/
├── src/
│   ├── index.js                    # CLI 入口
│   ├── agent/
│   │   ├── orchestrator.js         # 流程编排引擎
│   │   ├── requirementAnalyzer.js  # 需求分析 Agent
│   │   ├── prototypeGenerator.js   # 原型生成 Agent
│   │   ├── prdGenerator.js         # PRD 生成 Agent
│   │   └── feedbackProcessor.js    # 反馈处理 Agent
│   ├── models/
│   │   ├── deepseek.js             # DeepSeek V3 客户端
│   │   └── glm-image.js           # GLM-Image 客户端
│   ├── templates/
│   │   ├── prd-template.md         # PRD Markdown 模板
│   │   └── prompts/
│   │       ├── requirement-analysis.txt
│   │       ├── prototype-description.txt
│   │       ├── prd-generation.txt
│   │       └── feedback-revision.txt
│   └── utils/
│       ├── logger.js               # 日志工具
│       └── fileManager.js          # 文件管理
├── output/                         # 生成输出目录
├── package.json
├── .env.example
├── PRODUCT_DESIGN.md               # 本文档
└── README.md
```
