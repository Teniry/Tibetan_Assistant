#!/usr/bin/env bash
set -u

# 阿里云公网隧道健康检查：检测 cpolar“进程仍在但公网映射失效”的情况。
PUBLIC_URL="${PUBLIC_URL:-https://assistant3.cpolar.cn/}"
LOCAL_URL="${LOCAL_URL:-http://127.0.0.1/}"
MARKER="${MARKER:-boot-screen}"
COOLDOWN_SECONDS="${COOLDOWN_SECONDS:-300}"
STATE_FILE="/run/cpolar-healthcheck.last-restart"
FAIL_FILE="/run/cpolar-healthcheck.failures"
LOCK_FILE="/run/cpolar-healthcheck.lock"
LOG_TAG="cpolar-healthcheck"
TMP_BODY="$(mktemp /tmp/cpolar-healthcheck.XXXXXX)"
trap 'rm -f "$TMP_BODY"' EXIT

exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

log() { logger -t "$LOG_TAG" -- "$*"; echo "[$(date '+%F %T')] $*"; }

http_code() {
  local url="$1" timeout="$2" code
  if ! code="$(curl -ksS -o "$TMP_BODY" -w '%{http_code}' --max-time "$timeout" "$url" 2>/dev/null)"; then
    code="000"
  fi
  printf '%s' "$code"
}

public_healthy() {
  local code
  code="$(http_code "$PUBLIC_URL" 5)"
  [[ "$code" == "200" ]] && grep -qF "$MARKER" "$TMP_BODY"
}

local_code="$(http_code "$LOCAL_URL" 10)"
public_code="$(http_code "$PUBLIC_URL" 10)"
public_marker=0
[[ "$public_code" == "200" ]] && grep -qF "$MARKER" "$TMP_BODY" && public_marker=1

if [[ "$local_code" == "200" && "$public_code" == "200" && "$public_marker" == "1" ]]; then
  rm -f "$FAIL_FILE"
  exit 0
fi

# 本机应用本身异常时，重启 cpolar 没有意义；交给应用服务自身处理。
if [[ "$local_code" != "200" ]]; then
  log "本机应用异常：local=$local_code；不重启 cpolar"
  exit 1
fi

# 连续两轮异常才重连，过滤短暂的公网抖动。
failures=0
[[ -r "$FAIL_FILE" ]] && read -r failures < "$FAIL_FILE" || true
failures=$((failures + 1))
printf '%s\n' "$failures" > "$FAIL_FILE"
if (( failures < 2 )); then
  log "首次公网异常：public=$public_code；等待下一轮确认"
  exit 0
fi

now="$(date +%s)"
last="0"
[[ -r "$STATE_FILE" ]] && read -r last < "$STATE_FILE" || true
if (( now - last < COOLDOWN_SECONDS )); then
  log "公网持续异常但仍在冷却期：public=$public_code"
  exit 0
fi

printf '%s\n' "$now" > "$STATE_FILE"
log "检测到公网异常：local=$local_code public=$public_code；重启 cpolar"
if ! systemctl restart cpolar; then
  log "cpolar 服务重启命令失败"
  exit 1
fi

# cpolar 云端注册固定隧道可能需要 30-60 秒。预留最长约 3 分钟，
# 避免旧版只等 25 秒就误判失败并进入长冷却。
# 网络超时时每次探测最多 5 秒，整个恢复窗口最长约 3 分钟。
for attempt in $(seq 1 18); do
  sleep 5
  if public_healthy; then
    rm -f "$FAIL_FILE"
    log "cpolar 已自动恢复（第 ${attempt} 次复验）"
    exit 0
  fi
done

retry_code="$(http_code "$PUBLIC_URL" 5)"
log "cpolar 重启后 3 分钟内仍未恢复：public=$retry_code；5 分钟后允许再次尝试"
exit 1
