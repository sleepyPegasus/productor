#!/usr/bin/env node

/**
 * AI-PRD Generator Agent
 * 入口文件 - 提供 CLI 交互界面
 *
 * 流程: 用户需求 → 需求分析 → 原型生成 → PRD 生成 → 用户确认 → 迭代循环
 */

import 'dotenv/config';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { logger } from './utils/logger.js';
import { DeepSeekClient } from './models/deepseek.js';
import { GLMImageClient } from './models/glm-image.js';
import { Orchestrator } from './agent/orchestrator.js';
import { ensureDir } from './utils/fileManager.js';

// ─── 配置 ───────────────────────────────────────────────

function loadConfig() {
  const config = {
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    },
    glmImage: {
      apiKey: process.env.GLM_IMAGE_API_KEY || '',
      baseUrl: process.env.GLM_IMAGE_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/images/generations',
      model: process.env.GLM_IMAGE_MODEL || 'glm-image',
    },
    outputDir: resolve(process.env.OUTPUT_DIR || './output'),
  };

  return config;
}

// ─── Readline 辅助 ──────────────────────────────────────

function createRL() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function askMultiline(rl, prompt) {
  console.log(prompt);
  console.log('(输入完成后，单独输入一行 "END" 结束)\n');

  const lines = [];
  return new Promise((resolve) => {
    const onLine = (line) => {
      if (line.trim().toUpperCase() === 'END') {
        rl.removeListener('line', onLine);
        resolve(lines.join('\n'));
      } else {
        lines.push(line);
      }
    };
    rl.on('line', onLine);
  });
}

// ─── 显示工具 ───────────────────────────────────────────

function displayRequirementSummary(req) {
  logger.divider();
  console.log(`\n  产品名称: ${req.productName}`);
  console.log(`  产品类型: ${req.productType}`);
  console.log(`  产品概述: ${req.productSummary}\n`);

  console.log('  目标用户:');
  (req.targetUsers || []).forEach((u) => {
    console.log(`    - ${u.persona}: ${u.description}`);
  });

  console.log('\n  核心功能:');
  (req.coreFeatures || []).forEach((f) => {
    console.log(`    [${f.priority}] ${f.id} ${f.name}: ${f.description}`);
  });

  console.log('\n  非功能需求:');
  (req.nonFunctionalRequirements || []).forEach((n) => {
    console.log(`    [${n.category}] ${n.description}`);
  });
  logger.divider();
}

function displayPrototypes(prototypes) {
  logger.divider();
  console.log('\n  原型图列表:');
  (prototypes || []).forEach((p) => {
    const status = p.imagePath ? 'OK' : 'FAILED';
    console.log(`    [${status}] ${p.pageName}: ${p.imagePath || p.error}`);
  });
  logger.divider();
}

function displayPRDPreview(prdContent) {
  logger.divider();
  const lines = prdContent.split('\n');
  const previewLines = lines.slice(0, 50);
  console.log('\n  PRD 文档预览 (前50行):');
  console.log('  ' + previewLines.join('\n  '));
  if (lines.length > 50) {
    console.log(`\n  ... (共 ${lines.length} 行, 已省略后续内容)`);
  }
  logger.divider();
}

// ─── 主流程 ─────────────────────────────────────────────

async function main() {
  const config = loadConfig();
  const rl = createRL();

  logger.banner('AI-PRD Generator Agent v1.0');
  console.log('  将您的产品构想转化为专业的 PRD 文档');
  console.log('  模型: DeepSeek V3 (文本) + GLM-Image (图像)\n');

  // 检查 API Key
  if (!config.deepseek.apiKey) {
    logger.warn('未设置 DEEPSEEK_API_KEY 环境变量');
    logger.info('请在 .env 文件中配置或通过环境变量设置');
    logger.info('演示模式: 将使用模拟数据运行\n');
  }

  if (!config.glmImage.apiKey) {
    logger.warn('未设置 GLM_IMAGE_API_KEY 环境变量');
    logger.info('原型图生成将被跳过\n');
  }

  // 初始化客户端
  const deepseekClient = new DeepSeekClient(config.deepseek);
  const glmImageClient = new GLMImageClient(config.glmImage);

  await ensureDir(config.outputDir);

  const orchestrator = new Orchestrator({
    deepseekClient,
    glmImageClient,
    outputDir: config.outputDir,
  });

  // ─── Step 1: 获取用户需求 ───

  logger.step('Step 1', '请输入您的产品需求');
  const rawRequirement = await askMultiline(
    rl,
    '\n请描述您想要开发的产品 (尽可能详细地描述功能、目标用户、使用场景等):'
  );

  if (!rawRequirement.trim()) {
    logger.error('未输入任何需求，程序退出');
    rl.close();
    process.exit(1);
  }

  // ─── Step 1.5: 需求完整性检查 ───

  try {
    logger.step('Step 1.5', '检查需求完整性...');
    const completeness = await orchestrator.checkRequirementCompleteness(rawRequirement);

    let finalRequirement = rawRequirement;

    if (!completeness.sufficient && completeness.questions?.length > 0) {
      console.log('\n  为了生成更完整的 PRD，AI 有以下问题需要确认:\n');
      completeness.questions.forEach((q, i) => {
        console.log(`  ${i + 1}. ${q}`);
      });

      const supplement = await askMultiline(
        rl,
        '\n请补充以上问题的回答 (如果暂时不想回答，直接输入 END 跳过):'
      );

      if (supplement.trim()) {
        finalRequirement = `${rawRequirement}\n\n补充说明:\n${supplement}`;
      }
    }

    // ─── Step 2-4: 运行完整流水线 ───

    const result = await orchestrator.runFullPipeline(finalRequirement);

    // 显示结果摘要
    logger.banner('生成结果');
    displayRequirementSummary(result.structuredRequirement);
    displayPrototypes(result.prototypes);
    displayPRDPreview(result.prdContent);

    console.log(`\n  PRD 文件已保存至: ${result.prdPath}`);
    console.log(`  项目目录: ${orchestrator.state.projectDir}\n`);

    // ─── Step 5: 用户确认与迭代循环 ───

    let iterating = true;
    while (iterating) {
      const action = await ask(rl, '\n请选择操作:\n  [A] 确认通过 - 生成最终版本\n  [R] 提出修改 - 提交反馈修正\n  [V] 查看完整 PRD\n  [Q] 退出 (保留当前版本)\n\n请选择 (A/R/V/Q): ');

      switch (action.toUpperCase()) {
        case 'A': {
          const { finalPath } = await orchestrator.approve();
          console.log(`\n  最终 PRD 已保存: ${finalPath}`);
          iterating = false;
          break;
        }

        case 'R': {
          const feedback = await askMultiline(
            rl,
            '\n请输入您的修改意见 (请尽可能详细描述需要修改的内容):'
          );

          if (feedback.trim()) {
            const updated = await orchestrator.processUserFeedback(feedback);
            logger.banner(`PRD 已更新至 v${updated.version}`);
            displayPRDPreview(updated.prdContent);
            console.log(`\n  新版本已保存至: ${updated.prdPath}`);
          } else {
            logger.warn('未输入反馈内容，跳过');
          }
          break;
        }

        case 'V': {
          console.log('\n' + orchestrator.state.prdContent);
          break;
        }

        case 'Q': {
          logger.info(`项目已保存，可稍后继续。项目ID: ${orchestrator.state.projectId}`);
          iterating = false;
          break;
        }

        default:
          logger.warn('无效选项，请输入 A, R, V 或 Q');
      }
    }
  } catch (error) {
    logger.error(`运行错误: ${error.message}`);

    if (error.message.includes('API')) {
      logger.info('提示: 请检查 API Key 配置是否正确');
    }

    logger.info(`错误详情: ${error.stack}`);
  }

  rl.close();
  logger.info('AI-PRD Generator 已退出');
}

// ─── 启动 ───────────────────────────────────────────────

main().catch((err) => {
  logger.error(`致命错误: ${err.message}`);
  process.exit(1);
});
