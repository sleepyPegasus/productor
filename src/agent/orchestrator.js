/**
 * 流程编排引擎 (Orchestrator)
 * 管理从需求输入到 PRD 输出的完整流水线，包括迭代循环
 */

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';
import { saveTextFile, saveJsonFile, readTextFile, readJsonFile, fileExists, createProjectOutputDir } from '../utils/fileManager.js';
import { RequirementAnalyzer } from './requirementAnalyzer.js';
import { PrototypeGenerator } from './prototypeGenerator.js';
import { PRDGenerator } from './prdGenerator.js';
import { FeedbackProcessor } from './feedbackProcessor.js';

/**
 * 项目状态枚举
 */
const STATUS = {
  INIT: 'init',
  ANALYZING: 'analyzing',
  PROTOTYPING: 'prototyping',
  GENERATING: 'generating',
  REVIEWING: 'reviewing',
  REVISING: 'revising',
  APPROVED: 'approved',
};

export class Orchestrator {
  /**
   * @param {object} config
   * @param {import('../models/deepseek.js').DeepSeekClient} config.deepseekClient
   * @param {import('../models/nanobanana.js').NanobananaClient} config.nanobananaClient
   * @param {string} config.outputDir - 输出根目录
   */
  constructor(config) {
    this.deepseek = config.deepseekClient;
    this.nanobanana = config.nanobananaClient;
    this.outputDir = config.outputDir;

    // 初始化各 Agent
    this.requirementAnalyzer = new RequirementAnalyzer(this.deepseek);
    this.prototypeGenerator = new PrototypeGenerator(this.deepseek, this.nanobanana);
    this.prdGenerator = new PRDGenerator(this.deepseek);
    this.feedbackProcessor = new FeedbackProcessor(this.deepseek);

    // 项目状态
    this.state = null;
  }

  /**
   * 创建新项目
   * @param {string} rawRequirement - 用户原始需求
   * @returns {Promise<object>} 项目状态
   */
  async createProject(rawRequirement) {
    const projectId = randomUUID().slice(0, 8);
    const projectDir = await createProjectOutputDir(this.outputDir, projectId);

    this.state = {
      projectId,
      projectDir,
      projectName: null,
      version: 0,
      status: STATUS.INIT,
      rawRequirement,
      structuredRequirement: null,
      pagesPlan: null,
      prototypes: [],
      prdContent: null,
      prdPath: null,
      history: [],
    };

    await this.saveState();
    logger.info(`项目已创建: ${projectId}`);
    return this.state;
  }

  /**
   * 运行完整流水线（首次生成）
   * @param {string} rawRequirement - 用户原始需求
   * @returns {Promise<object>} 包含生成结果的对象
   */
  async runFullPipeline(rawRequirement) {
    logger.banner('AI-PRD Generator - 开始生成流水线');

    // 创建项目
    await this.createProject(rawRequirement);

    // Phase 1: 需求分析
    await this.runRequirementAnalysis(rawRequirement);

    // Phase 2: 原型生成
    await this.runPrototypeGeneration();

    // Phase 3: PRD 生成
    await this.runPRDGeneration();

    // 更新状态为待评审
    this.state.status = STATUS.REVIEWING;
    await this.saveState();

    logger.banner('流水线完成 - 等待用户评审');

    return {
      projectId: this.state.projectId,
      version: this.state.version,
      structuredRequirement: this.state.structuredRequirement,
      prototypes: this.state.prototypes,
      prdPath: this.state.prdPath,
      prdContent: this.state.prdContent,
    };
  }

  /**
   * Phase 1: 需求分析
   */
  async runRequirementAnalysis(rawRequirement) {
    logger.divider();
    logger.banner('Phase 1: 需求分析');
    this.state.status = STATUS.ANALYZING;

    const structuredReq = await this.requirementAnalyzer.analyze(rawRequirement);
    this.state.structuredRequirement = structuredReq;
    this.state.projectName = structuredReq.productName;

    await this.saveState();
    return structuredReq;
  }

  /**
   * Phase 2: 原型生成
   */
  async runPrototypeGeneration() {
    logger.divider();
    logger.banner('Phase 2: 原型生成');
    this.state.status = STATUS.PROTOTYPING;

    const { pagesPlan, prototypes } = await this.prototypeGenerator.generate(
      this.state.structuredRequirement,
      this.state.projectDir
    );

    this.state.pagesPlan = pagesPlan;
    this.state.prototypes = prototypes;

    await this.saveState();
    return { pagesPlan, prototypes };
  }

  /**
   * Phase 3: PRD 生成
   */
  async runPRDGeneration() {
    logger.divider();
    logger.banner('Phase 3: PRD 生成');
    this.state.status = STATUS.GENERATING;
    this.state.version += 1;

    const prdContent = await this.prdGenerator.generate({
      structuredRequirement: this.state.structuredRequirement,
      pagesPlan: this.state.pagesPlan,
      prototypes: this.state.prototypes,
      version: this.state.version,
    });

    // 保存 PRD 文件
    const prdFileName = `PRD_v${this.state.version}.md`;
    const prdPath = join(this.state.projectDir, prdFileName);
    await saveTextFile(prdPath, prdContent);

    // 保存版本记录
    const versionPath = join(this.state.projectDir, 'versions', `v${this.state.version}.md`);
    await saveTextFile(versionPath, prdContent);

    this.state.prdContent = prdContent;
    this.state.prdPath = prdPath;

    // 添加历史记录
    this.state.history.push({
      version: this.state.version,
      timestamp: new Date().toISOString(),
      action: this.state.version === 1 ? 'created' : 'revised',
      feedback: null,
      prdPath,
    });

    await this.saveState();
    return prdContent;
  }

  /**
   * 处理用户反馈并迭代
   * @param {string} feedback - 用户反馈
   * @returns {Promise<object>} 更新后的结果
   */
  async processUserFeedback(feedback) {
    logger.banner('处理用户反馈 - 开始迭代');
    this.state.status = STATUS.REVISING;

    // Step 1: 分析反馈
    const analysis = await this.feedbackProcessor.analyzeFeedback({
      feedback,
      currentPrd: this.state.prdContent,
      structuredRequirement: this.state.structuredRequirement,
    });

    const actions = this.feedbackProcessor.determineActions(analysis);

    // Step 2: 按需重新执行各阶段
    if (actions.reanalyze) {
      logger.step('迭代', '需要重新分析需求...');
      const revisedReq = await this.requirementAnalyzer.revise(
        this.state.rawRequirement,
        this.state.structuredRequirement,
        feedback
      );
      this.state.structuredRequirement = revisedReq;
    }

    if (actions.regeneratePrototype) {
      logger.step('迭代', '需要重新生成原型...');
      await this.runPrototypeGeneration();
    }

    if (actions.revisePrd) {
      logger.step('迭代', '修正 PRD 文档...');
      this.state.version += 1;

      const revisedPrd = await this.prdGenerator.revise({
        currentPrd: this.state.prdContent,
        feedback,
        structuredRequirement: this.state.structuredRequirement,
        version: this.state.version,
      });

      // 保存新版本
      const prdFileName = `PRD_v${this.state.version}.md`;
      const prdPath = join(this.state.projectDir, prdFileName);
      await saveTextFile(prdPath, revisedPrd);

      const versionPath = join(this.state.projectDir, 'versions', `v${this.state.version}.md`);
      await saveTextFile(versionPath, revisedPrd);

      this.state.prdContent = revisedPrd;
      this.state.prdPath = prdPath;

      // 记录变更
      const changeSummary = this.feedbackProcessor.generateChangeSummary(analysis);
      this.state.history.push({
        version: this.state.version,
        timestamp: new Date().toISOString(),
        action: 'revised',
        feedback: changeSummary,
        prdPath,
      });
    }

    // 更新状态为待评审
    this.state.status = STATUS.REVIEWING;
    await this.saveState();

    logger.banner(`迭代完成 - v${this.state.version} 等待评审`);

    return {
      projectId: this.state.projectId,
      version: this.state.version,
      structuredRequirement: this.state.structuredRequirement,
      prototypes: this.state.prototypes,
      prdPath: this.state.prdPath,
      prdContent: this.state.prdContent,
      changeAnalysis: analysis,
    };
  }

  /**
   * 用户批准当前版本
   */
  async approve() {
    this.state.status = STATUS.APPROVED;

    // 保存最终版本到专门的文件
    const finalPath = join(this.state.projectDir, 'PRD_FINAL.md');
    await saveTextFile(finalPath, this.state.prdContent);

    await this.saveState();

    logger.banner(`PRD 已批准 - 最终版本: v${this.state.version}`);
    logger.success(`最终文档: ${finalPath}`);

    return { finalPath, version: this.state.version };
  }

  /**
   * 检查需求完整性（用于追问环节）
   * @param {string} rawRequirement
   * @returns {Promise<{sufficient: boolean, questions: string[]}>}
   */
  async checkRequirementCompleteness(rawRequirement) {
    return this.requirementAnalyzer.checkCompleteness(rawRequirement);
  }

  /**
   * 保存项目状态到磁盘
   */
  async saveState() {
    if (!this.state || !this.state.projectDir) return;
    const statePath = join(this.state.projectDir, 'project-state.json');
    // 排除 prdContent 以减少文件大小
    const stateToSave = { ...this.state };
    delete stateToSave.prdContent;
    await saveJsonFile(statePath, stateToSave);
  }

  /**
   * 从磁盘加载项目状态
   * @param {string} projectDir - 项目目录
   */
  async loadState(projectDir) {
    const statePath = join(projectDir, 'project-state.json');
    if (await fileExists(statePath)) {
      this.state = await readJsonFile(statePath);
      this.state.projectDir = projectDir;

      // 重新加载 PRD 内容
      if (this.state.prdPath && (await fileExists(this.state.prdPath))) {
        this.state.prdContent = await readTextFile(this.state.prdPath);
      }

      logger.success(`项目已加载: ${this.state.projectId} (v${this.state.version})`);
      return this.state;
    }
    throw new Error(`项目状态文件不存在: ${statePath}`);
  }

  /**
   * 获取当前项目状态摘要
   */
  getStatusSummary() {
    if (!this.state) return '无活动项目';

    return {
      projectId: this.state.projectId,
      projectName: this.state.projectName,
      version: this.state.version,
      status: this.state.status,
      features: this.state.structuredRequirement?.coreFeatures?.length || 0,
      prototypes: this.state.prototypes?.length || 0,
      historyCount: this.state.history?.length || 0,
    };
  }
}
