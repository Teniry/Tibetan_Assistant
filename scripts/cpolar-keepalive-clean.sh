#!/usr/bin/env bash
# ============================================================================
# cpolar-keepalive-clean.sh —— 清爽版 watchdog（24 小时对比实验专用）
#
# 设计目标：
#   - 每 5 分钟探一次公网 + Node 端口
#   - 公网不通 → 重启 Node + cpolar → 复验
#   - 健康 → 完全静默退出（0 日志噪音）
#
# 与 cpolar-keepalive.sh（108-aware）的本质区别：
#   - 本版本：故意不识别 ERR_CPOLAR_108
#   - 遇到 108 时会按"重启"动作反复触发，制造僵尸会话
#   - 这正是 24 小时实验的目的：观察清爽逻辑能否扛住 / 多久会再 108
#
# 实验完成后请根据日志决定：
#   - 若 24h 全程没 108 → 说明僵尸已过期，可考虑长期用此版
#   - 若中途出现 108 → 验证了僵尸会周期性堆满，必须换 Cloudflare
#
# 用法：
#   chmod +x scripts/cpolar-keepalive-clean.sh
#   bash scripts/cpolar-keepalive-clean.sh             # 立即跑一次
#   # 配合 cpolar-watchdog-loop.sh 使用（环境变量 KEEPALIVE 指向本脚本）
#
# 停止：
#   pkill -f cpolar-watchdog-loop   # 停 loop
# ============================================================================

set -uo pipefail

# ===== 可配置（环境变量覆盖）=====
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

PORT="${PORT:-6020}"
PUBLIC_URL="${PUBLIC_URL:-http://assistant3.cpolar.cn/}"
LOG_FILE="${LOG_FILE:-${PROJECT_DIR}/cpolar-watchdog-clean.log}"

# 重启命令（默认走项目自带的 restart-autodl.sh —— 包含 Node + cpolar + cron 全流程幂等恢复）
START_NODE_CMD="${START_NODE_CMD:-bash ${SCRIPT_DIR}/restart-autodl.sh}"
START_CPOLAR_CMD="${START_CPOLAR_CMD:-bash ${SCRIPT_DIR}/start-cpolar.sh ${PORT}}"

# 复验等待时间（秒）
VERIFY_WAIT="${VERIFY_WAIT:-30}"

# curl 探测超时（秒）
CURL_TIMEOUT="${CURL_TIMEOUT:-10}"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# ===== 主流程 =====
log "=========================================="
log "🔍 清爽版 watchdog 探针"
log "   公网 URL : ${PUBLIC_URL}"
log "   本地端口 : ${PORT}"
log "   项目目录 : ${PROJECT_DIR}"

# ---------- 1) 探公网 ----------
HTTP_CODE=$(curl -s -o /tmp/cpolar-keepdog-clean.body -w '%{http_code}' --max-time "${CURL_TIMEOUT}" "${PUBLIC_URL}" 2>/dev/null || echo "000")
# v3 改动：不截断 500 字节，整份 HTML 拿下来再 grep
#   因为 boot-screen 的 CSS 规则在 <style> 块里，500 字节覆盖不到 → 会假阴性
HTTP_BODY=$(cat /tmp/cpolar-keepdog-clean.body 2>/dev/null || echo "")
rm -f /tmp/cpolar-keepdog-clean.body

# ---------- 2) 探本地端口 ----------
NODE_OK=0
if command -v ss >/dev/null 2>&1; then
    if ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
        NODE_OK=1
    fi
else
    # 退化方案：netstat
    if netstat -ltn 2>/dev/null | grep -q ":${PORT} "; then
        NODE_OK=1
    fi
fi

# ---------- 2.5) 健康标记检测 ----------
# v3 改动：双标记 —— 命中任意一条就视作"非占位页"
#   - <title>木雅藏语AI助手</title> ← 项目独有 title（最稳）
#   - id="boot-screen"            ← React 启动屏 DOM 标记
# 这样无论是占位页 / cpolar 错误页 / Node 报错页，都能正确识别
HEALTHY_TITLE="木雅藏语AI助手"
HEALTHY_MARKER="id=\"boot-screen\""
if echo "${HTTP_BODY}" | grep -q "${HEALTHY_TITLE}" \
   || echo "${HTTP_BODY}" | grep -q "${HEALTHY_MARKER}"; then
    HEALTHY_TAG=1
else
    HEALTHY_TAG=0
fi

# ---------- 3) 健康判定 ----------
if [[ "${HTTP_CODE}" == "200" ]] && [[ "${HEALTHY_TAG}" == "1" ]] && [[ "${NODE_OK}" == "1" ]]; then
    log "✅ 公网 ${HTTP_CODE} / Node 监听 / 健康标记在 → 一切正常"
    exit 0
fi

# ---------- 4) 不健康：恢复流程 ----------
log "⚠️ 不健康 (HTTP=${HTTP_CODE}, Node=${NODE_OK:-0}, Tag=${HEALTHY_TAG:-0})，开始恢复..."

# 重启 Node（如果不监听）
if [[ "${NODE_OK}" != "1" ]]; then
    log "↻ Node 没监听，重启 Node..."
    eval "${START_NODE_CMD}" >> "${LOG_FILE}" 2>&1 || log "❌ Node 重启命令失败"
    sleep 5
fi

# 重启 cpolar
log "↻ 重启 cpolar 隧道..."
eval "${START_CPOLAR_CMD}" >> "${LOG_FILE}" 2>&1 || log "❌ cpolar 重启命令失败"

# ---------- 5) 复验（必须 HTTP 200 + 健康标记 才算真正恢复）----------
log "⏳ 等待 ${VERIFY_WAIT} 秒后复验..."
sleep "${VERIFY_WAIT}"

HTTP_CODE2=$(curl -s -o /tmp/cpolar-keepdog-clean.body2 -w '%{http_code}' --max-time "${CURL_TIMEOUT}" "${PUBLIC_URL}" 2>/dev/null || echo "000")
HTTP_BODY2=$(cat /tmp/cpolar-keepdog-clean.body2 2>/dev/null || echo "")
rm -f /tmp/cpolar-keepdog-clean.body2

if [[ "${HTTP_CODE2}" == "200" ]] \
   && (echo "${HTTP_BODY2}" | grep -q "${HEALTHY_TITLE}" \
       || echo "${HTTP_BODY2}" | grep -q "${HEALTHY_MARKER}"); then
    log "✅ 复验通过，公网 ${HTTP_CODE2} + 健康标记在"
else
    log "❌ 复验失败 (HTTP=${HTTP_CODE2}) — 健康标记不在"
    log "   排查：curl -s ${PUBLIC_URL} | head -50    # 看是 cpolar 占位页还是 Node 报错页"
    log "   可能: Node 没起来 / cpolar 隧道仍占位 / 公网地址错了"
fi

exit 0