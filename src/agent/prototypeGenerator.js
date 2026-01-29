/**
 * 原型生成 Agent
 * 负责根据结构化需求生成产品原型图（线框图/UI概念图）
 */

import { join } from 'node:path';
import { logger } from '../utils/logger.js';
import { saveBase64Image } from '../utils/fileManager.js';

const PAGE_PLANNING_PROMPT = `你是一位资深 UI/UX 设计师和产品架构师。根据提供的结构化产品需求，你需要规划产品的页面结构。

请完成以下工作：
1. 根据功能需求，确定需要哪些关键页面/屏幕
2. 为每个页面描述其核心内容和布局
3. 定义页面之间的导航流转关系

返回 JSON 格式：
{
  "pages": [
    {
      "id": "page_001",
      "name": "页面名称",
      "description": "页面功能描述",
      "keyElements": ["核心元素1", "核心元素2"],
      "layoutDescription": "详细的布局描述，包括各区域的位置和内容",
      "navigatesTo": ["page_002"]
    }
  ],
  "flowDescription": "整体页面流转描述"
}`;

const IMAGE_PROMPT_TEMPLATE = `Clean, professional UI wireframe design for a {productType} application.
Page: {pageName} - {pageDescription}.
Layout: {layoutDescription}.
Key elements: {keyElements}.
Style: minimal wireframe, clean lines, grayscale, professional UI design, modern interface layout, clearly labeled sections and buttons, no decorative elements, blueprint style.`;

const IMAGE_NEGATIVE_PROMPT = 'colorful, photorealistic, 3d rendering, artistic, decorative, blurry, low quality, text heavy';

export class PrototypeGenerator {
  /**
   * @param {import('../models/deepseek.js').DeepSeekClient} deepseekClient
   * @param {import('../models/glm-image.js').GLMImageClient} glmImageClient
   */
  constructor(deepseekClient, glmImageClient) {
    this.deepseek = deepseekClient;
    this.glmImage = glmImageClient;
  }

  /**
   * 根据结构化需求规划页面结构
   * @param {object} structuredRequirement - 结构化需求
   * @returns {Promise<object>} 页面规划
   */
  async planPages(structuredRequirement) {
    logger.step('原型生成', '规划页面结构...');

    const result = await this.deepseek.chatJson({
      systemPrompt: PAGE_PLANNING_PROMPT,
      userMessage: `以下是产品的结构化需求，请规划页面结构：\n\n${JSON.stringify(structuredRequirement, null, 2)}`,
      temperature: 0.4,
      maxTokens: 4096,
    });

    logger.success(`页面规划完成: ${result.pages?.length || 0} 个页面`);
    for (const page of result.pages || []) {
      logger.info(`  - ${page.name}: ${page.description}`);
    }

    return result;
  }

  /**
   * 为每个页面生成图像提示词
   * @param {object} pagesPlan - 页面规划
   * @param {string} productType - 产品类型
   * @returns {Array<{pageId: string, pageName: string, prompt: string}>}
   */
  buildImagePrompts(pagesPlan, productType) {
    return (pagesPlan.pages || []).map((page) => {
      const prompt = IMAGE_PROMPT_TEMPLATE
        .replace('{productType}', productType)
        .replace('{pageName}', page.name)
        .replace('{pageDescription}', page.description)
        .replace('{layoutDescription}', page.layoutDescription)
        .replace('{keyElements}', (page.keyElements || []).join(', '));

      return {
        pageId: page.id,
        pageName: page.name,
        prompt,
      };
    });
  }

  /**
   * 生成原型图
   * @param {object} structuredRequirement - 结构化需求
   * @param {string} outputDir - 输出目录
   * @returns {Promise<{pagesPlan: object, prototypes: Array}>}
   */
  async generate(structuredRequirement, outputDir) {
    logger.step('原型生成', '开始生成产品原型...');

    // Step 1: 规划页面
    const pagesPlan = await this.planPages(structuredRequirement);

    // Step 2: 构建图像提示词
    const imagePrompts = this.buildImagePrompts(
      pagesPlan,
      structuredRequirement.productType || 'web'
    );

    // Step 3: 调用 GLM-Image 生成图片
    logger.step('原型生成', `开始生成 ${imagePrompts.length} 张原型图...`);

    const tasks = imagePrompts.map((item) => ({
      prompt: item.prompt,
      fileName: `${item.pageId}_${item.pageName}.png`,
    }));

    const results = await this.glmImage.batchGenerate(tasks, {
      width: 1024,
      height: 768,
      negativePrompt: IMAGE_NEGATIVE_PROMPT,
    });

    // Step 4: 保存图片到本地
    const prototypes = [];
    const protoDir = join(outputDir, 'prototypes');

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const pageInfo = imagePrompts[i];

      if (result.base64) {
        const filePath = join(protoDir, result.fileName);
        await saveBase64Image(filePath, result.base64);
        prototypes.push({
          pageId: pageInfo.pageId,
          pageName: pageInfo.pageName,
          imagePath: filePath,
          prompt: pageInfo.prompt,
        });
      } else {
        logger.warn(`页面 "${pageInfo.pageName}" 原型图生成失败: ${result.error}`);
        prototypes.push({
          pageId: pageInfo.pageId,
          pageName: pageInfo.pageName,
          imagePath: null,
          prompt: pageInfo.prompt,
          error: result.error,
        });
      }
    }

    logger.success(`原型生成完成: ${prototypes.filter((p) => p.imagePath).length}/${prototypes.length} 张成功`);

    return { pagesPlan, prototypes };
  }
}
