#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if [ -f /root/.muya-env ]; then
  # shellcheck disable=SC1091
  set -a
  source /root/.muya-env
  set +a
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "未找到 Python 3。" >&2
  exit 1
fi

if ! python3 -c 'import importlib.metadata; assert importlib.metadata.version("ragflow-sdk").startswith("0.22.")' >/dev/null 2>&1; then
  echo "需要与当前 RAGFlow 兼容的 ragflow-sdk 0.22.x。" >&2
  echo "当前实例已知可用版本：python3 -m pip install 'ragflow-sdk==0.22.1'" >&2
  exit 1
fi

exec python3 "$PROJECT_DIR/ragflow-import/process.py" "$@"
