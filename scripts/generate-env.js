#!/usr/bin/env node
/**
 * ============================================================================
 * scripts/generate-env.js —— 环境变量注入脚本
 *
 * 作用：读取项目根目录的 .env 文件，解析为键值对，并生成
 *       src/js/env.generated.js（已 gitignore），在页面加载时把配置
 *       挂载到 window.__MYX_ENV__，供 config.js 消费。
 *
 * 用法：node scripts/generate-env.js    （或 npm run env）
 *
 * 设计要点：不引入任何第三方依赖（如 dotenv），降低供应链与安装成本；
 *          仅支持「KEY=VALUE」形式的简单语法，满足本项目需求。
 * ============================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const OUT_FILE = path.join(ROOT, 'src', 'js', 'env.generated.js');

/** 解析 .env 文本为对象（忽略注释与空行，剥离首尾引号） */
function parseEnv(text) {
  const result = {};
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  });
  return result;
}

function main() {
  if (!fs.existsSync(ENV_FILE)) {
    console.warn('[generate-env] 未找到 .env 文件，跳过生成（应用将使用内置默认配置）。');
    console.warn('[generate-env] 如需自定义，请先执行：cp .env.example .env');
    return;
  }

  const env = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));

  // 安全兜底：即便 .env 中误写了密钥，也提醒不要提交
  const banner = [
    '/* 本文件由 scripts/generate-env.js 自动生成，请勿手动修改，亦不要提交到仓库。 */',
    'window.__MYX_ENV__ = Object.assign(window.__MYX_ENV__ || {}, {'
  ];
  const body = Object.keys(env)
    .map((k) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(env[k]))
    .join(',\n');
  const footer = ['});', ''];

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, banner.concat([body]).concat(footer).join('\n'), 'utf8');

  console.log('[generate-env] 已生成 ' + path.relative(ROOT, OUT_FILE) +
    '（共 ' + Object.keys(env).length + ' 个变量）');
}

main();
