/**
 * PRD 生成 Agent
 * 负责根据结构化需求和原型图生成完整的 PRD 文档
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PRD_GENERATION_PROMPT = `你是一位资深产品经理，擅长撰写清晰、完整、专业的 PRD (Product Requirements Document) 文档。

请根据以下信息生成完整的 PRD 文档：
1. 结构化需求（JSON 格式）
2. 页面规划信息
3. 原型图列表（如有）
4. PRD 模板结构

要求：
- 严格按照提供的模板结构组织内容
- 每个章节内容详实、专业、可执行
- 功能描述要具体到交互细节
- 用户故事要遵循 "作为..., 我希望..., 以便..." 的格式
- 适当添加表格来组织信息
- 在相应位置引用原型图
- 使用 Markdown 格式输出

输出完整的 Markdown 格式 PRD 文档，不要包含代码块标记。`;

const PRD_REVISION_PROMPT = `你是一位资深产品经理。你之前生成了一版 PRD 文档，现在需要根据用户的反馈进行修正。

修正要求：
- 只修改反馈中提到的部分，保持其他部分不变
- 如果反馈要求新增内容，在适当位置添加
- 如果反馈要求删除内容，移除相关部分
- 确保修改后的文档仍然完整、连贯
- 在文档的修订记录中添加本次修改说明

输出完整的修改后 Markdown 格式 PRD 文档。`;

export class PRDGenerator {
  /**
   * @param {import('../models/deepseek.js').DeepSeekClient} deepseekClient
   */
  constructor(deepseekClient) {
    this.client = deepseekClient;
    this.templateContent = null;
  }

  /**
   * 加载 PRD 模板
   * @returns {Promise<string>}
   */
  async loadTemplate() {
    if (this.templateContent) return this.templateContent;

    const templatePath = join(__dirname, '..', 'templates', 'prd-template.md');
    try {
      this.templateContent = await readFile(templatePath, 'utf-8');
      logger.success('PRD 模板加载成功');
    } catch {
      logger.warn('未找到自定义模板，使用内置默认模板');
      this.templateContent = this.getDefaultTemplate();
    }
    return this.templateContent;
  }

  /**
   * 生成 PRD 文档
   * @param {object} params
   * @param {object} params.structuredRequirement - 结构化需求
   * @param {object} [params.pagesPlan] - 页面规划
   * @param {Array} [params.prototypes] - 原型图列表
   * @param {number} [params.version=1] - 版本号
   * @returns {Promise<string>} PRD Markdown 内容
   */
  async generate({ structuredRequirement, pagesPlan, prototypes, version = 1 }) {
    logger.step('PRD生成', '开始生成 PRD 文档...');

    const template = await this.loadTemplate();

    const prototypeInfo = (prototypes || [])
      .map((p) => {
        if (p.imagePath) {
          return `- ${p.pageName}: ![${p.pageName}](${p.imagePath})`;
        }
        return `- ${p.pageName}: (图片生成失败)`;
      })
      .join('\n');

    const userMessage = `请根据以下信息生成完整的 PRD 文档：

## 结构化需求
${JSON.stringify(structuredRequirement, null, 2)}

## 页面规划
${pagesPlan ? JSON.stringify(pagesPlan, null, 2) : '无页面规划信息'}

## 原型图
${prototypeInfo || '无原型图'}

## PRD 模板结构
${template}

## 版本信息
- 版本号: v${version}.0
- 生成日期: ${new Date().toISOString().split('T')[0]}

请生成完整的 PRD 文档。`;

    const prdContent = await this.client.chat({
      systemPrompt: PRD_GENERATION_PROMPT,
      userMessage,
      temperature: 0.5,
      maxTokens: 16384,
    });

    logger.success('PRD 文档生成完成');
    return prdContent;
  }

  /**
   * 根据反馈修正 PRD 文档
   * @param {object} params
   * @param {string} params.currentPrd - 当前 PRD 内容
   * @param {string} params.feedback - 用户反馈
   * @param {object} params.structuredRequirement - 结构化需求（可能已更新）
   * @param {number} params.version - 新版本号
   * @returns {Promise<string>} 修正后的 PRD Markdown 内容
   */
  async revise({ currentPrd, feedback, structuredRequirement, version }) {
    logger.step('PRD生成', '根据反馈修正 PRD 文档...');

    const userMessage = `## 当前 PRD 文档
${currentPrd}

## 最新结构化需求
${JSON.stringify(structuredRequirement, null, 2)}

## 用户反馈
${feedback}

## 修订信息
- 新版本号: v${version}.0
- 修订日期: ${new Date().toISOString().split('T')[0]}

请根据反馈修正 PRD 文档，输出完整的修改后文档。`;

    const revisedPrd = await this.client.chat({
      systemPrompt: PRD_REVISION_PROMPT,
      userMessage,
      temperature: 0.5,
      maxTokens: 16384,
    });

    logger.success('PRD 文档修正完成');
    return revisedPrd;
  }

  /**
   * 默认 PRD 模板
   */
  getDefaultTemplate() {
    return `# {产品名称} - 产品需求文档 (PRD)

## 文档信息
| 项目 | 内容 |
|------|------|
| 文档版本 | v1.0 |
| 创建日期 | {日期} |
| 产品名称 | {产品名称} |
| 文档状态 | 草稿 |

## 修订记录
| 版本 | 日期 | 修改内容 | 修改人 |
|------|------|---------|--------|

## 1. 产品概述
### 1.1 产品简介
### 1.2 产品愿景
### 1.3 产品目标

## 2. 目标用户
### 2.1 用户画像
### 2.2 使用场景

## 3. 功能需求
### 3.1 功能概览
### 3.2 功能详述
### 3.3 用户故事

## 4. 非功能需求
### 4.1 性能需求
### 4.2 安全需求
### 4.3 可用性需求

## 5. 信息架构
### 5.1 页面结构
### 5.2 页面流程

## 6. 原型设计
### 6.1 关键页面原型

## 7. 数据需求
### 7.1 数据模型
### 7.2 数据流转

## 8. 开放问题与风险

## 9. 里程碑规划

## 附录`;
  }
}
