#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if [ "$(uname -s)" != "Linux" ]; then
  echo "此脚本只用于 AutoDL/Linux，Mac 请使用 scripts/start-mac.sh。" >&2
  exit 1
fi

NEED_NODE=1
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$NODE_MAJOR" -ge 20 ]; then
    NEED_NODE=0
  fi
fi

if [ "$NEED_NODE" -eq 1 ]; then
  echo "正在安装 Node.js 20 与 Python 3…"
  apt-get update
  apt-get install -y ca-certificates curl python3
  curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  apt-get install -y nodejs
else
  echo "已检测到 Node.js 20+，跳过 apt 更新，避免被实例中无关的第三方软件源阻断。"
  if ! command -v python3 >/dev/null 2>&1; then
    apt-get update
    apt-get install -y python3
  fi
fi

echo "Node: $(node --version)"
echo "npm:  $(npm --version)"

# 使用 npm install 以兼容 AutoDL 镜像中不同版本的 npm/lockfile 处理方式。
# 项目已移除容易导致 Exit 139 的 Node 原生 SQLite 运行时依赖。
npm install --registry=https://registry.npmmirror.com
npm run build

echo
echo "AutoDL 依赖与生产构建已完成。"
echo "启动命令：./scripts/start-autodl.sh"
