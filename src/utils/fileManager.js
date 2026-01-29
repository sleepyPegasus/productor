/**
 * 文件管理工具 - 处理输出文件的读写和版本管理
 */

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { logger } from './logger.js';

/**
 * 确保目录存在，不存在则创建
 */
export async function ensureDir(dirPath) {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * 保存文本文件
 */
export async function saveTextFile(filePath, content) {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, content, 'utf-8');
  logger.success(`文件已保存: ${filePath}`);
  return filePath;
}

/**
 * 保存 JSON 文件
 */
export async function saveJsonFile(filePath, data) {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  logger.success(`JSON 已保存: ${filePath}`);
  return filePath;
}

/**
 * 读取文本文件
 */
export async function readTextFile(filePath) {
  return readFile(filePath, 'utf-8');
}

/**
 * 读取 JSON 文件
 */
export async function readJsonFile(filePath) {
  const text = await readFile(filePath, 'utf-8');
  return JSON.parse(text);
}

/**
 * 检查文件是否存在
 */
export async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 为项目创建输出目录结构
 */
export async function createProjectOutputDir(baseOutputDir, projectId) {
  const projectDir = join(baseOutputDir, projectId);
  await ensureDir(join(projectDir, 'prototypes'));
  await ensureDir(join(projectDir, 'versions'));
  return projectDir;
}

/**
 * 保存 Base64 图片为 PNG 文件
 */
export async function saveBase64Image(filePath, base64Data) {
  await ensureDir(dirname(filePath));
  const buffer = Buffer.from(base64Data, 'base64');
  await writeFile(filePath, buffer);
  logger.success(`图片已保存: ${filePath}`);
  return filePath;
}

/**
 * 从 URL 下载图片并保存到本地
 */
export async function downloadAndSaveImage(filePath, imageUrl) {
  await ensureDir(dirname(filePath));
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`下载图片失败 (${response.status}): ${imageUrl}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));
  logger.success(`图片已下载保存: ${filePath}`);
  return filePath;
}
