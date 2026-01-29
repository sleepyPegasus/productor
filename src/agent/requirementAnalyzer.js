/**
 * 需求分析 Agent
 * 负责将用户的自然语言需求转化为结构化的需求文档
 */

import { logger } from '../utils/logger.js';

const SYSTEM_PROMPT = `你是一位资深产品经理和需求分析专家。你的任务是将用户的自然语言需求描述转化为结构化的产品需求文档。

你需要完成以下工作：
1. 理解用户的核心诉求，提取产品名称、类型和概述
2. 识别目标用户群体，构建用户画像
3. 拆解功能需求为具体的功能点，并按优先级排序（P0=必须, P1=重要, P2=锦上添花）
4. 为每个功能编写用户故事（User Story）
5. 识别非功能性需求（性能、安全、可用性等）
6. 列出约束条件和假设前提

返回严格的 JSON 格式，结构如下：
{
  "productName": "产品名称",
  "productType": "web | mobile | desktop | api | mini-program | other",
  "productSummary": "一句话产品概述",
  "targetUsers": [
    { "persona": "用户角色名", "description": "角色描述" }
  ],
  "coreFeatures": [
    {
      "id": "F001",
      "name": "功能名称",
      "description": "功能详细描述",
      "priority": "P0 | P1 | P2",
      "userStories": ["作为...我希望...以便..."]
    }
  ],
  "nonFunctionalRequirements": [
    { "category": "性能|安全|可用性|兼容性|可维护性", "description": "描述" }
  ],
  "constraints": ["约束条件"],
  "assumptions": ["假设前提"]
}`;

const CLARIFICATION_PROMPT = `你是一位资深产品经理。基于用户提供的需求描述，你需要判断信息是否充足。
如果信息不足以生成完整的产品需求文档，请列出需要用户补充的问题（最多5个最关键的问题）。
如果信息已经足够，返回空数组。

返回 JSON 格式：
{
  "sufficient": true/false,
  "questions": ["问题1", "问题2", ...]
}`;

const REVISION_PROMPT = `你是一位资深产品经理和需求分析专家。你之前已经生成了一版结构化需求，现在用户提供了反馈意见。
请根据用户的反馈修正结构化需求，并返回完整的更新后的 JSON 结构。

原始需求输入和已有结构化结果会一起提供给你，请结合反馈进行修正。返回与原始格式完全一致的 JSON。`;

export class RequirementAnalyzer {
  /**
   * @param {import('../models/deepseek.js').DeepSeekClient} deepseekClient
   */
  constructor(deepseekClient) {
    this.client = deepseekClient;
  }

  /**
   * 检查需求信息是否充分，若不足则返回需要追问的问题
   * @param {string} rawRequirement - 用户原始需求描述
   * @returns {Promise<{sufficient: boolean, questions: string[]}>}
   */
  async checkCompleteness(rawRequirement) {
    logger.step('需求分析', '检查需求信息完整性...');

    const result = await this.client.chatJson({
      systemPrompt: CLARIFICATION_PROMPT,
      userMessage: `用户需求描述:\n${rawRequirement}`,
      temperature: 0.3,
    });

    if (result.sufficient) {
      logger.success('需求信息充分，可以进行分析');
    } else {
      logger.warn(`需求信息不足，需要追问 ${result.questions.length} 个问题`);
    }

    return result;
  }

  /**
   * 分析需求并生成结构化需求文档
   * @param {string} rawRequirement - 用户原始需求描述
   * @returns {Promise<object>} 结构化需求对象
   */
  async analyze(rawRequirement) {
    logger.step('需求分析', '开始分析用户需求...');

    const result = await this.client.chatJson({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `请分析以下用户需求并生成结构化的产品需求文档：\n\n${rawRequirement}`,
      temperature: 0.4,
      maxTokens: 8192,
    });

    logger.success(`需求分析完成: ${result.productName || '未命名产品'}`);
    logger.info(`  - 核心功能: ${result.coreFeatures?.length || 0} 项`);
    logger.info(`  - 目标用户: ${result.targetUsers?.length || 0} 类`);
    logger.info(`  - 非功能需求: ${result.nonFunctionalRequirements?.length || 0} 项`);

    return result;
  }

  /**
   * 根据反馈修正结构化需求
   * @param {string} rawRequirement - 原始需求
   * @param {object} currentRequirement - 当前结构化需求
   * @param {string} feedback - 用户反馈
   * @returns {Promise<object>} 修正后的结构化需求
   */
  async revise(rawRequirement, currentRequirement, feedback) {
    logger.step('需求分析', '根据反馈修正需求...');

    const userMessage = `原始用户需求:\n${rawRequirement}\n\n当前结构化需求:\n${JSON.stringify(currentRequirement, null, 2)}\n\n用户反馈:\n${feedback}\n\n请根据反馈修正结构化需求，返回完整的 JSON。`;

    const result = await this.client.chatJson({
      systemPrompt: REVISION_PROMPT,
      userMessage,
      temperature: 0.4,
      maxTokens: 8192,
    });

    logger.success('需求修正完成');
    return result;
  }
}
