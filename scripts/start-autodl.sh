#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# 阿里云 Key 单独保存在 root 私有文件中，不写入部署包。
if [ -f /root/.muya-env ]; then
  # shellcheck disable=SC1091
  source /root/.muya-env
fi

PORT_VALUE="${PORT:-6006}"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "未检测到 Node.js，将先运行 AutoDL 安装脚本。"
  "$SCRIPT_DIR/install-autodl.sh"
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "当前 Node.js 版本过低，将升级到 Node.js 20。"
  "$SCRIPT_DIR/install-autodl.sh"
fi

if [ ! -d node_modules ]; then
  npm install --registry=https://registry.npmmirror.com
fi

if [ ! -f dist/index.html ]; then
  npm run build
fi

echo "服务已监听 0.0.0.0:${PORT_VALUE}"
echo "公网隧道应转发到本机 ${PORT_VALUE} 端口。"
PORT="$PORT_VALUE" exec npm run server
