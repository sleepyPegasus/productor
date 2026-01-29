/**
 * DeepSeek V3 API 客户端
 * 使用 OpenAI 兼容接口调用 DeepSeek V3 大语言模型
 */

import { logger } from '../utils/logger.js';

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const MODEL_NAME = 'deepseek-chat';

export class DeepSeekClient {
  /**
   * @param {object} config
   * @param {string} config.apiKey - DeepSeek API Key
   * @param {string} [config.baseUrl] - API 基础 URL
   * @param {string} [config.model] - 模型名称
   */
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.model = config.model || MODEL_NAME;
  }

  /**
   * 发送聊天完成请求
   * @param {object} options
   * @param {string} options.systemPrompt - 系统提示词
   * @param {string} options.userMessage - 用户消息
   * @param {number} [options.temperature=0.7] - 温度参数
   * @param {number} [options.maxTokens=4096] - 最大生成 token 数
   * @returns {Promise<string>} 模型回复文本
   */
  async chat({ systemPrompt, userMessage, temperature = 0.7, maxTokens = 4096 }) {
    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
    };

    logger.step('DeepSeek', `请求模型: ${this.model}, temperature: ${temperature}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API 错误 (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('DeepSeek API 返回空内容');
      }

      logger.success(`DeepSeek 响应成功, tokens: ${data.usage?.total_tokens || 'N/A'}`);
      return content;
    } catch (error) {
      logger.error(`DeepSeek 请求失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 发送多轮对话请求
   * @param {object} options
   * @param {string} options.systemPrompt - 系统提示词
   * @param {Array<{role: string, content: string}>} options.messages - 对话历史
   * @param {number} [options.temperature=0.7]
   * @param {number} [options.maxTokens=4096]
   * @returns {Promise<string>}
   */
  async multiTurnChat({ systemPrompt, messages, temperature = 0.7, maxTokens = 4096 }) {
    const url = `${this.baseUrl}/chat/completions`;

    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const body = {
      model: this.model,
      messages: allMessages,
      temperature,
      max_tokens: maxTokens,
    };

    logger.step('DeepSeek', `多轮对话请求, 消息数: ${allMessages.length}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API 错误 (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('DeepSeek API 返回空内容');
      }

      logger.success(`DeepSeek 多轮对话成功, tokens: ${data.usage?.total_tokens || 'N/A'}`);
      return content;
    } catch (error) {
      logger.error(`DeepSeek 多轮对话失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 请求 JSON 格式输出
   * @param {object} options
   * @param {string} options.systemPrompt
   * @param {string} options.userMessage
   * @param {number} [options.temperature=0.3]
   * @param {number} [options.maxTokens=4096]
   * @returns {Promise<object>} 解析后的 JSON 对象
   */
  async chatJson({ systemPrompt, userMessage, temperature = 0.3, maxTokens = 4096 }) {
    const enhancedSystemPrompt = `${systemPrompt}\n\n重要: 你必须严格以 JSON 格式返回结果，不要包含任何 markdown 代码块标记或其他非 JSON 文本。`;

    const content = await this.chat({
      systemPrompt: enhancedSystemPrompt,
      userMessage,
      temperature,
      maxTokens,
    });

    try {
      // 尝试提取 JSON（处理可能的 markdown 代码块包裹）
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1].trim();
      return JSON.parse(jsonStr);
    } catch (error) {
      logger.error(`JSON 解析失败，原始内容: ${content.slice(0, 200)}...`);
      throw new Error(`DeepSeek 返回的内容无法解析为 JSON: ${error.message}`);
    }
  }
}
