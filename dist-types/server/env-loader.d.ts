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
export {};
