#!/usr/bin/env bash
# ============================================================================
# cpolar 隧道 + Node 后端保活 watchdog（最简版 / 第一版）
#
# 行为：
#   1) curl 探测公网 URL 是否返回 200 + 包含 boot-screen 标记
#   2) ss 检测 Node 是否在监听 6020
#   3) ps + dashboard API 检测 cpolar 客户端是否在跑 + 隧道是否建立
#   4) 任意一项不合格 → 按顺序重启（Node → cpolar）
#   5) 重启后再次探测，仍失败则告警并退出（不忙循环）
#
# 日志策略：健康时静默，只在"故障→恢复"那一刻记日志
# 退出码：0 = 一切正常或已恢复；1 = 当前不健康且未恢复（需人工介入）
#
# 推荐 cron：每 5 分钟一次
#   */5 * * * *  /root/autodl-tmp/木雅语助手-8.20-0320/scripts/cpolar-keepalive.sh >> /root/autodl-tmp/木雅语助手-8.20-0320/cpolar-watchdog.log 2>&1
#
# 同一时刻只允许一个 watchdog 运行，避免 @reboot、cron 或手动执行互相强杀。
# 固定域名恢复失败时不允许回退随机地址，避免与 PUBLIC_URL 的健康检查形成死循环。
# ============================================================================

set -uo pipefail

# ---------- 可配置项 ----------
PROJECT_DIR="/root/autodl-tmp/木雅语助手-8.20-0320"
SCRIPT_DIR="$PROJECT_DIR/scripts"
PORT="${PORT:-6020}"
PUBLIC_URL="${PUBLIC_URL:-http://assistant3.cpolar.cn/}"
EXPECTED_MARKER="${EXPECTED_MARKER:-boot-screen}"
CURL_TIMEOUT="${CURL_TIMEOUT:-15}"
RECHECK_DELAY="${RECHECK_DELAY:-15}"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
STATE_FILE="${STATE_FILE:-/tmp/cpolar-keepalive.state}"
LOCK_FILE="${LOCK_FILE:-/tmp/cpolar-keepalive.lock}"

# @reboot、cron 和人工执行可能在同一时刻触发；已有实例时安静退出。
exec 8>"$LOCK_FILE"
if ! flock -n 8 2>/dev/null; then
  exit 0
fi

# ---------- 工具函数 ----------
log()   { echo "$LOG_PREFIX $*"; }
ok()    { log "✅ $*"; }
warn()  { log "⚠️  $*"; }
err()   { log "❌ $*"; }
act()   { log "↻ $*"; }

probe_public() {
  local body code
  body="$(curl -s --max-time "$CURL_TIMEOUT" "$PUBLIC_URL" 2>/dev/null || echo '')"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT" "$PUBLIC_URL" 2>/dev/null || echo 000)"
  if [ "$code" = "200" ] && echo "$body" | grep -q "$EXPECTED_MARKER"; then
    echo "OK"
    return 0
  fi
  case "$code" in
    000*) echo "code=000 连接失败：cpolar 客户端断线 / 网络不通" ;;
    404) echo "code=404 cpolar 占位页：云端隧道映射失效" ;;
    502|503|504) echo "code=$code 后端无响应：Node 没监听" ;;
    200) echo "code=200 但缺少 $EXPECTED_MARKER 标记：返回占位页" ;;
    *)   echo "code=$code 非预期" ;;
  esac
  return 1
}

probe_node_port() {
  if ss -tln 2>/dev/null | grep -qE ":$PORT\b"; then
    echo "listening"; return 0
  fi
  echo "not listening"; return 1
}

dashboard_has_tunnel() {
  local api
  for api in 127.0.0.1:4054 127.0.0.1:4040; do
    if curl -s --max-time 3 "http://${api}/api/tunnels" 2>/dev/null | grep -q 'public_url'; then
      return 0
    fi
  done
  return 1
}

public_has_project_marker() {
  curl -s --max-time 5 "$PUBLIC_URL" 2>/dev/null | grep -q "$EXPECTED_MARKER"
}

cpolar_tunnel_ready() {
  dashboard_has_tunnel || public_has_project_marker
}

probe_cpolar_proc() {
  # ⚠️ cpolar 3.x 运行后进程名变为 "cpolar: master process"，必须同时匹配两种形态
  if ! ps aux | grep -E '[c]polar( http|: )' >/dev/null 2>&1; then
    echo "not running"; return 1
  fi
  if ! cpolar_tunnel_ready; then
    echo "running but no tunnel"; return 1
  fi
  echo "running"; return 0
}

restart_node() {
  act "正在重启 Node 服务 (PORT=$PORT)..."
  pkill -f 'tsx server/index.ts' 2>/dev/null || true
  sleep 2
  cd "$PROJECT_DIR"
  # 后台服务必须关闭 watchdog 的锁文件描述符，否则 Node 会长期占住锁。
  ( exec 8>&-; PORT="$PORT" nohup npm run server > server.log 2>&1 & )
  for _ in 1 2 3 4 5; do
    sleep 3
    if ss -tln 2>/dev/null | grep -qE ":$PORT\b"; then
      ok "Node 已监听 :$PORT"
      return 0
    fi
  done
  err "Node 重启后仍未监听 :$PORT"
  return 1
}

restart_cpolar() {
  act "正在重启 cpolar 隧道（转发到 :$PORT）..."
  # 同时杀旧形态（cpolar http ...）和 3.x 形态（cpolar: master process）
  pkill -f 'cpolar http' 2>/dev/null || true
  pkill -f 'cpolar:' 2>/dev/null || true
  sleep 2
  cd "$PROJECT_DIR"
  # watchdog 只维护固定地址，禁止失败后回退随机地址。
  # 子进程先关闭锁文件描述符；锁只由本次 watchdog 持有。
  ( exec 8>&-; CPOLAR_ALLOW_RANDOM_FALLBACK=0 SKIP_PREFLIGHT=1 \
    bash "$SCRIPT_DIR/start-cpolar.sh" "$PORT" > "$PROJECT_DIR/cpolar-start-watchdog.log" 2>&1 ) &
  for _ in $(seq 1 75); do
    sleep 1
    if ps aux | grep -E '[c]polar( http|: )' >/dev/null 2>&1 \
       && cpolar_tunnel_ready; then
      ok "cpolar 进程已起，隧道已就绪（公网标记或4040/4054 API）"
      return 0
    fi
  done
  err "cpolar 重启后未就绪（进程或隧道 API 未就绪）"
  tail -n 20 "$PROJECT_DIR/cpolar-start-watchdog.log" 2>/dev/null | sed 's/^/     /' || true
  tail -n 20 "$PROJECT_DIR/cpolar-fixed-error.log" 2>/dev/null | sed 's/^/     /' || true
  tail -n 10 "$PROJECT_DIR/cpolar.log" 2>/dev/null | sed 's/^/     /' || true
  pkill -9 -f 'cpolar http' 2>/dev/null || true
  pkill -9 -f 'cpolar:' 2>/dev/null || true
  err "已强杀本机残留 cpolar 进程"
  return 1
}

# ---------- 主流程 ----------
main() {
  # 1. 公网探测
  local pub; pub="$(probe_public || true)"
  if [ "$pub" = "OK" ]; then
    if [ "$(cat "$STATE_FILE" 2>/dev/null || echo ok)" != "ok" ]; then
      ok "隧道已自动恢复 🎉 公网 $PUBLIC_URL 健康"
    fi
    echo "ok" > "$STATE_FILE"
    exit 0
  fi
  echo "bad" > "$STATE_FILE"
  warn "公网探测异常：$pub"

  local need_node_restart=0
  local need_cpolar_restart=0

  # 2. Node 端口探测
  local node; node="$(probe_node_port || true)"
  if [ "$node" != "listening" ]; then
    warn "Node 未监听 :$PORT（$node）"
    need_node_restart=1
  else
    ok "Node 在监听 :$PORT"
  fi

  # 3. cpolar 进程探测
  local cp; cp="$(probe_cpolar_proc || true)"
  if [ "$cp" != "running" ]; then
    warn "cpolar 客户端异常（$cp）"
    need_cpolar_restart=1
  else
    ok "cpolar 在跑，隧道 API 正常"
  fi

  # 4. 顺序重启
  if [ "$need_node_restart" = "1" ]; then
    restart_node || { err "Node 重启失败，请人工查看 server.log"; exit 1; }
  fi
  if [ "$need_cpolar_restart" = "1" ]; then
    restart_cpolar || { err "cpolar 重启失败，请人工查看 cpolar.log"; exit 1; }
  fi

  # 5. 复验
  act "等待 $RECHECK_DELAY 秒后复验公网..."
  sleep "$RECHECK_DELAY"
  local re; re="$(probe_public || true)"
  if [ "$re" = "OK" ]; then
    ok "自动恢复完成 🎉 公网 $PUBLIC_URL 恢复 200"
    exit 0
  else
    err "自动恢复失败：$re"
    err "请人工介入："
    echo ""
    echo "  # ① 重启 Node: pkill -f 'tsx server/index.ts'; sleep 2; cd $PROJECT_DIR; PORT=$PORT nohup npm run server > server.log 2>&1 &"
    echo "  # ② 重启 cpolar: pkill -9 -f 'cpolar http'; pkill -9 -f 'cpolar:'; sleep 2; cd $PROJECT_DIR; CPOLAR_ALLOW_RANDOM_FALLBACK=0 SKIP_PREFLIGHT=1 bash $SCRIPT_DIR/start-cpolar.sh $PORT"
    echo "  # ③ 查日志: tail -50 $PROJECT_DIR/server.log; tail -50 $PROJECT_DIR/cpolar.log"
    echo ""
    echo "  # 若 cpolar.log 出现 ERR_CPOLAR_108（会话数超限）：等 20-30 分钟让僵尸会话过期"
    echo "  # 期间不要反复重连（会继续堆积会话）"
    exit 1
  fi
}

main "$@"
