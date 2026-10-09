/**
 * env-loader.ts
 *
 * 自动把 /root/.muya-env（或 .env）里的变量加载到 process.env。
 * 解决 cron / docker / 手动启动 Node 时忘记 `source /root/.muya-env` 导致
 * process.env 拿不到 ALIYUN_API_KEY 等关键变量的痛点。
 *
 * 设计原则：
 *   - 零外部依赖（只用 node:fs），不依赖 dotenv
 *   - 支持 bash 风格 `export KEY=VALUE` 和标准 `KEY=VALUE`
 *   - 支持 # 注释和空行
 *   - 支持 VALUE 用单/双引号包裹
 *   - 如果 process.env 里已经有同名变量（运行时通过 API 设置的），不覆盖
 *   - 多个候选路径：/root/.muya-env > /root/.env > .env，找到第一个存在的就用
 *
 * 用法：在 server/index.ts 顶部 `import "./env-loader.js"`（必须 .js 后缀，
 * 因为 tsx 编译时仍按 ESM 解析 .ts 源文件）。
 */

import fs from 'node:fs';

const CANDIDATE_PATHS = [
  '/root/.muya-env',
  '/root/.env',
  '.env',
];

// export KEY=VALUE 或 KEY=VALUE；key 由 [A-Z_][A-Z0-9_]* 组成；value 部分非贪婪
const LINE_RE = /^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/;

let totalLoaded = 0;
let sourcePath: string | null = null;

for (const p of CANDIDATE_PATHS) {
  if (!fs.existsSync(p)) continue;
  try {
    const content = fs.readFileSync(p, 'utf8');
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const m = line.match(LINE_RE);
      if (!m) continue;

      const key = m[1];
      let value = m[2];

      // 去掉首尾匹配的引号（单/双）
      if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
          value = value.slice(1, -1);
        }
      }

      // 已经在 process.env 里就不覆盖（运行时通过 API 端点设置的 key 优先）
      if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;

      process.env[key] = value;
      totalLoaded++;
    }
    sourcePath = p;
    break; // 命中第一个就停，不要多个文件叠加
  } catch (e) {
    console.warn(`[env-loader] 读取 ${p} 失败:`, (e as Error).message);
  }
}

if (sourcePath) {
  console.log(`[env-loader] 从 ${sourcePath} 加载了 ${totalLoaded} 个环境变量`);
} else {
  // 没找到 env 文件不算错误（开发场景可能用 IDE 直接设的变量）
  console.log('[env-loader] 未找到 /root/.muya-env 或 .env，跳过加载');
}