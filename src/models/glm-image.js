/**
 * GLM-Image API 客户端 (智谱 AI CogView)
 * 用于生成产品原型图/线框图
 */

import { logger } from '../utils/logger.js';

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4/images/generations';
const MODEL_NAME = 'glm-image';

export class GLMImageClient {
  /**
   * @param {object} config
   * @param {string} config.apiKey - GLM-Image API Key
   * @param {string} [config.baseUrl] - API 基础 URL
   * @param {string} [config.model] - 模型名称
   */
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.model = config.model || MODEL_NAME;
  }

  /**
   * 生成图片
   * @param {object} options
   * @param {string} options.prompt - 图片描述提示词
   * @param {string} [options.size='1024x1024'] - 图片尺寸 (如 '1024x1024', '1024x768')
   * @returns {Promise<{url: string}>} 生成结果 (GLM-Image 返回图片 URL)
   */
  async generateImage({
    prompt,
    size = '1024x1024',
  }) {
    const url = this.baseUrl;

    const body = {
      model: this.model,
      prompt,
      size,
    };

    logger.step('GLM-Image', `生成图片: ${prompt.slice(0, 60)}...`);

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
        throw new Error(`GLM-Image API 错误 (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const result = data.data?.[0];

      if (!result || !result.url) {
        throw new Error('GLM-Image API 返回空结果');
      }

      logger.success('GLM-Image 图片生成成功');

      return {
        url: result.url,
      };
    } catch (error) {
      logger.error(`GLM-Image 图片生成失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 批量生成多张图片
   * @param {Array<{prompt: string, fileName: string}>} tasks - 生成任务列表
   * @param {object} [options] - 通用选项
   * @param {string} [options.size='1024x1024'] - 图片尺寸
   * @returns {Promise<Array<{fileName: string, url: string | null, error: string | null}>>}
   */
  async batchGenerate(tasks, options = {}) {
    logger.step('GLM-Image', `批量生成 ${tasks.length} 张图片`);

    const results = [];
    for (const task of tasks) {
      try {
        const result = await this.generateImage({
          prompt: task.prompt,
          ...options,
        });
        results.push({
          fileName: task.fileName,
          url: result.url,
          error: null,
        });
      } catch (error) {
        logger.warn(`图片 "${task.fileName}" 生成失败: ${error.message}`);
        results.push({
          fileName: task.fileName,
          url: null,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => !r.error).length;
    logger.success(`批量生成完成: ${successCount}/${tasks.length} 成功`);
    return results;
  }
}
