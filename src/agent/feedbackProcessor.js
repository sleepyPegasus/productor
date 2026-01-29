/**
 * 反馈处理 Agent
 * 负责解析用户反馈，确定修改范围，协调各模块进行增量修正
 */

import { logger } from '../utils/logger.js';

const FEEDBACK_ANALYSIS_PROMPT = `你是一位资深产品经理。用户对当前生成的 PRD 文档提出了反馈意见。
请分析反馈内容，确定：
1. 反馈涉及的修改类型
2. 需要重新执行的流程阶段
3. 具体的修改指令

返回 JSON 格式：
{
  "summary": "反馈摘要",
  "changeType": "minor | major | overhaul",
  "affectedPhases": {
    "requirementAnalysis": true/false,
    "prototypeGeneration": true/false,
    "prdGeneration": true/false
  },
  "modifications": [
    {
      "target": "需求分析 | 原型设计 | PRD文档",
      "section": "具体章节或功能",
      "action": "add | modify | remove",
      "detail": "具体修改描述"
    }
  ],
  "preserveExisting": ["需要保留不变的部分"]
}`;

export class FeedbackProcessor {
  /**
   * @param {import('../models/deepseek.js').DeepSeekClient} deepseekClient
   */
  constructor(deepseekClient) {
    this.client = deepseekClient;
  }

  /**
   * 分析用户反馈
   * @param {object} params
   * @param {string} params.feedback - 用户反馈文本
   * @param {string} params.currentPrd - 当前 PRD 内容
   * @param {object} params.structuredRequirement - 当前结构化需求
   * @returns {Promise<object>} 反馈分析结果
   */
  async analyzeFeedback({ feedback, currentPrd, structuredRequirement }) {
    logger.step('反馈处理', '分析用户反馈...');

    const userMessage = `## 当前 PRD 文档摘要
产品: ${structuredRequirement.productName}
功能数: ${structuredRequirement.coreFeatures?.length || 0}
当前 PRD 前500字:
${currentPrd.slice(0, 500)}...

## 用户反馈
${feedback}

请分析反馈并确定需要修改的范围。`;

    const analysis = await this.client.chatJson({
      systemPrompt: FEEDBACK_ANALYSIS_PROMPT,
      userMessage,
      temperature: 0.3,
    });

    logger.success(`反馈分析完成: 变更类型=${analysis.changeType}`);
    logger.info(`  - 需重新分析需求: ${analysis.affectedPhases?.requirementAnalysis ? '是' : '否'}`);
    logger.info(`  - 需重新生成原型: ${analysis.affectedPhases?.prototypeGeneration ? '是' : '否'}`);
    logger.info(`  - 需修正PRD文档: ${analysis.affectedPhases?.prdGeneration ? '是' : '否'}`);
    logger.info(`  - 修改项数: ${analysis.modifications?.length || 0}`);

    return analysis;
  }

  /**
   * 根据反馈分析结果确定需要重新执行的流程
   * @param {object} analysis - 反馈分析结果
   * @returns {{reanalyze: boolean, regeneratePrototype: boolean, revisePrd: boolean}}
   */
  determineActions(analysis) {
    const phases = analysis.affectedPhases || {};
    return {
      reanalyze: phases.requirementAnalysis === true,
      regeneratePrototype: phases.prototypeGeneration === true,
      revisePrd: phases.prdGeneration !== false, // 默认总是修正 PRD
    };
  }

  /**
   * 生成变更摘要（用于版本记录）
   * @param {object} analysis - 反馈分析结果
   * @returns {string}
   */
  generateChangeSummary(analysis) {
    const mods = analysis.modifications || [];
    const lines = mods.map((m) => `[${m.action}] ${m.target} - ${m.section}: ${m.detail}`);
    return `${analysis.summary}\n变更明细:\n${lines.join('\n')}`;
  }
}
