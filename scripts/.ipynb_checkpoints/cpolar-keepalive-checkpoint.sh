#!/usr/bin/env bash
# ============================================================================
# cpolar 隧道 + Node 后端保活 watchdog
#
# 用法（单独执行 / cron 调用均可）：
#   ./scripts/cpolar-keepalive.sh
#
# 行为：
#   1) curl 探测公网 URL 是否返回 200（最权威，覆盖隧道+后端+静态资源）
#   2) ss/netstat 检测 Node 是否在监听 6020
#   3) ps 检测 cpolar 客户端进程是否在跑
#   4) 任意一项不合格 → 按顺序重启（Node → cpolar）
#   5) 重启后再次探测，仍失败则告警并退出（不忙循环）
#
# 日志策略（关键）：健康时零输出（静默），只在两类时刻写日志：
#   - 检测到故障时（记录【异常原因】+【对应解决命令】+ 自动执行的动作）
#   - 故障自动恢复的那一刻（记录一次恢复事件）
# 自动恢复失败时会输出完整的人工介入命令清单（重启 Node / 重启 cpolar / 查日志）。
# 因此日志文件几乎不会增长，且内容全是有效事件，可直接当故障史+操作手册看。
# 健康状态记在 /tmp/cpolar-keepalive.state（重启后自动重置为健康态，无副作用）。
#
# 推荐 cron：每 5 分钟一次，足以覆盖各种失效场景且零打扰、零噪音
#   */5 * * * *  /root/autodl-tmp/木雅语助手-8.20-0320/scripts/cpolar-keepalive.sh >> /root/autodl-tmp/木雅语助手-8.20-0320/cpolar-watchdog.log 2>&1
#
# 退出码：
#   0 = 一切正常或已恢复
#   1 = 当前不健康且未恢复（需人工介入）
# ============================================================================

set -uo pipefail

# ---------- 可配置项 ----------
PROJECT_DIR="/root/autodl-tmp/木雅语助手-8.20-0320"
SCRIPT_DIR="$PROJECT_DIR/scripts"
PORT="${PORT:-6020}"
PUBLIC_URL="${PUBLIC_URL:-http://assistant3.cpolar.cn/}"
EXPECTED_MARKER="${EXPECTED_MARKER:-boot-screen}"   # 200 OK 还可能是 404 占位页，检查此标记更准
CURL_TIMEOUT="${CURL_TIMEOUT:-15}"
RECHECK_DELAY="${RECHECK_DELAY:-15}"                # 重启后等多久再验证
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
STATE_FILE="${STATE_FILE:-/tmp/cpolar-keepalive.state}"   # 记录上次健康状态，实现"只写事件日志"
# ERR_CPOLAR_108（账号并发会话数超限）专项退避：
#   - 每次触发 108 后退避时间指数增长（30 分钟 → 60 → 120 → 240 → 480 → 720，封顶 12 小时）
#   - 避免固定 30 分钟退避期满就立刻再撞 108 死循环（cpolar 僵尸会话回收时间经常 > 30 分钟）
#   - 连续触发 N 次后只输出【必须人工介入】告警，不再重试
# 配套状态文件：
#   BACKOFF_108_FILE   上次触发时间戳（epoch 秒）
#   BACKOFF_108_HITS   连续触发次数（用于指数退避 + 连击告警）
#   BACKOFF_108_LOCK   「账号被其他设备占用」状态：写盘后即便不退避也不再重试（必须人工清零）
BACKOFF_108_FILE="${BACKOFF_108_FILE:-/tmp/cpolar-keepalive.108backoff}"
BACKOFF_108_HITS="${BACKOFF_108_HITS:-/tmp/cpolar-keepalive.108hits}"
BACKOFF_108_LOCK="${BACKOFF_108_LOCK:-/tmp/cpolar-keepalive.108lock}"
BACKOFF_108_BASE="${BACKOFF_108_BASE:-1800}"   # 第一次退避 30 分钟
BACKOFF_108_MAX="${BACKOFF_108_MAX:-43200}"    # 最长 12 小时
BACKOFF_108_HARDSTOP="${BACKOFF_108_HARDSTOP:-5}"   # 连续 5 次后硬停止，只告警

# 标识探测为 watch 模式（cpolar log 不需要清空）
export CPOLAR_SUBDOMAIN="${CPOLAR_SUBDOMAIN-assistant3}"

# ---------- 工具函数 ----------
log()   { echo "$LOG_PREFIX $*"; }
ok()    { log "✅ $*"; }
warn()  { log "⚠️  $*"; }
err()   { log "❌ $*"; }
act()   { log "↻ $*"; }

probe_public() {
  # 公网探测：返回 boot-screen 视为健康，否则视为不可用（含 404 占位）
  # 返回值为详细原因文本，方便日志直接解释"为什么坏了"
  local body code
  body="$(curl -s --max-time "$CURL_TIMEOUT" "$PUBLIC_URL" 2>/dev/null || echo '')"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT" "$PUBLIC_URL" 2>/dev/null || echo 000)"
  if [ "$code" = "200" ] && echo "$body" | grep -q "$EXPECTED_MARKER"; then
    echo "OK"
    return 0
  fi
  # 详细原因分类（000* 通配：个别 curl 版本失败时可能输出 000000）
  case "$code" in
    000*) echo "code=000 连接失败：cpolar 客户端断线 / 网络不通 / AutoDL 实例休眠" ;;
    404) echo "code=404 cpolar 占位页：云端隧道映射已失效（24h 无流量被释放 / 隧道未启动）" ;;
    502|503|504) echo "code=$code 后端无响应：Node 服务没在跑 / 端口不一致 / 服务卡死" ;;
    200) echo "code=200 但缺少 $EXPECTED_MARKER 标记：返回的是占位页或旧版本页面" ;;
    *)   echo "code=$code 非预期状态码" ;;
  esac
  return 1
}

probe_node_port() {
  if ss -tln 2>/dev/null | grep -qE ":$PORT\b"; then
    echo "listening"
    return 0
  fi
  echo "not listening"
  return 1
}

probe_cpolar_proc() {
  if ! ps aux | grep -E '[c]polar http' >/dev/null 2>&1; then
    echo "not running"
    return 1
  fi
  # 进程在跑但隧道未建立（如 24h 无流量映射被释放、客户端卡 connecting）→ 视为僵尸，需重启
  if ! curl -s --max-time 3 "http://127.0.0.1:4054/api/tunnels" 2>/dev/null | grep -q 'public_url' \
     && ! curl -s --max-time 3 "http://127.0.0.1:4040/api/tunnels" 2>/dev/null | grep -q 'public_url'; then
    echo "running but no tunnel"
    return 1
  fi
  echo "running"
  return 0
}

# 检测 cpolar.log 中是否存在「账号并发会话数超限」错误（ERR_CPOLAR_108）
is_session_limit_error() {
  grep -qE 'ERR_CPOLAR_108|simultaneous cpolar client sessions|登录用户数超过限制' \
    "$PROJECT_DIR/cpolar.log" 2>/dev/null
}

restart_node() {
  act "正在重启 Node 服务 (PORT=$PORT)..."
  echo "     命令: pkill -f 'tsx server/index.ts'; sleep 2; PORT=$PORT nohup npm run server > server.log 2>&1 &"
  pkill -f 'tsx server/index.ts' 2>/dev/null || true
  sleep 2
  cd "$PROJECT_DIR"
  PORT="$PORT" nohup npm run server > server.log 2>&1 &
  for _ in 1 2 3 4 5; do
    sleep 3
    if ss -tln 2>/dev/null | grep -qE ":$PORT\b"; then
      ok "Node 已监听 :$PORT"
      return 0
    fi
  done
  err "Node 重启后仍未监听 :$PORT"
  err "手动解决: pkill -f 'tsx server/index.ts'; sleep 2; cd $PROJECT_DIR; PORT=$PORT nohup npm run server > server.log 2>&1 &  然后 tail -50 $PROJECT_DIR/server.log 查原因"
  return 1
}

restart_cpolar() {
  act "正在重启 cpolar 隧道（转发到 :$PORT）..."
  echo "     命令: pkill -f 'cpolar http'; sleep 2; SKIP_PREFLIGHT=1 bash $SCRIPT_DIR/start-cpolar.sh $PORT"
  pkill -f 'cpolar http' 2>/dev/null || true
  sleep 2
  cd "$PROJECT_DIR"
  SKIP_PREFLIGHT=1 bash "$SCRIPT_DIR/start-cpolar.sh" "$PORT" >/dev/null 2>&1 &
  # 给隧道最多 75 秒：3.x 非 TTY 静默，进程在跑不算数，必须等 dashboard API 出现隧道
  for _ in $(seq 1 75); do
    sleep 1
    if ps aux | grep -E '[c]polar http' >/dev/null 2>&1 \
       && curl -s --max-time 3 "http://127.0.0.1:4054/api/tunnels" 2>/dev/null | grep -q 'public_url'; then
      ok "cpolar 进程已起，隧道已建立"
      return 0
    fi
  done
  err "cpolar 重启后未就绪（进程或隧道 API 未就绪）"
  err "cpolar.log 最近内容（帮助定位）："
  tail -n 10 "$PROJECT_DIR/cpolar.log" 2>/dev/null | sed 's/^/     /' || true
  # 强杀残留 cpolar 进程：卡在重连的进程会在云端各占 1 个会话槽位（会话泄漏根源）
  pkill -9 -f 'cpolar http' 2>/dev/null || true
  err "已强杀本机残留 cpolar 进程（防止继续占用账号会话槽位）"
  err "手动解决: pkill -9 -f 'cpolar http'; sleep 2; cd $PROJECT_DIR; SKIP_PREFLIGHT=1 bash $SCRIPT_DIR/start-cpolar.sh $PORT  然后 tail -50 $PROJECT_DIR/cpolar.log 查原因"
  return 1
}

# ---------- 主流程 ----------
main() {
  local need_node_restart=0
  local need_cpolar_restart=0

  # 1. 公网探测
  local pub; pub="$(probe_public || true)"
  if [ "$pub" = "OK" ]; then
    # 健康时静默：只在"从故障恢复"的那一刻记一条，其余轮次零输出
    if [ "$(cat "$STATE_FILE" 2>/dev/null || echo ok)" != "ok" ]; then
      ok "隧道已自动恢复 🎉 公网 $PUBLIC_URL 健康（200 + $EXPECTED_MARKER）"
    fi
    echo "ok" > "$STATE_FILE"
    exit 0
  else
    echo "bad" > "$STATE_FILE"
    warn "公网探测异常：$pub"

    # ── ERR_CPOLAR_108 专项处理（会话数超限）────────────────────────────────────
    # 核心原则：盲重试只会继续堆积僵尸会话，必须退避 + 指数退避 + 终态硬停止
    if is_session_limit_error; then
      pkill -9 -f 'cpolar http' 2>/dev/null || true

      # 状态1：已被硬停止（人工清零 BACKOFF_108_LOCK 后才会再尝试）
      if [ -f "$BACKOFF_108_LOCK" ]; then
        err "🛑 ERR_CPOLAR_108 已被自动恢复系统硬停止（连续失败达上限），请人工介入"
        err "   本机已无 cpolar 进程 → 16 个会话配额被其他设备/僵尸占满，本系统无力恢复"
        err "   解除方式：处理完账号问题后手动执行："
        err "     rm -f $BACKOFF_108_LOCK $BACKOFF_108_HITS && $SCRIPT_DIR/start-cpolar.sh $PORT"
        exit 1
      fi

      # 计算当前退避窗口（指数增长：30min → 60 → 120 → 240 → 480 → 720，封顶 12h）
      local hits now last backoff wait_left
      hits="$(cat "$BACKOFF_108_HITS" 2>/dev/null || echo 0)"
      hits=$((hits + 1))
      echo "$hits" > "$BACKOFF_108_HITS"
      # 指数退避：BACKOFF_108_BASE * 2^(hits-1)，封顶 BACKOFF_108_MAX
      if [ "$hits" -le 1 ]; then
        backoff="$BACKOFF_108_BASE"
      else
        backoff=$((BACKOFF_108_BASE * (1 << (hits - 1))))
      fi
      [ "$backoff" -gt "$BACKOFF_108_MAX" ] && backoff="$BACKOFF_108_MAX"
      now="$(date +%s)"
      last="$(cat "$BACKOFF_108_FILE" 2>/dev/null || echo 0)"
      wait_left=$((last + backoff - now))
      [ "$wait_left" -lt 0 ] && wait_left=0

      # 状态2：仍在退避期内 → 静默退出（避免刷屏）
      if [ "$wait_left" -gt 0 ]; then
        # 健康时静默，但 108 必须可见（要让你知道"还在等"），改成简短一行
        log "⏳ ERR_CPOLAR_108 退避中（第 ${hits} 次）：还需等待 $((wait_left / 60)) 分钟再重试"
        exit 1
      fi

      # 状态3：退避期满 → 输出完整错误 + 倒计时本轮退避期
      date +%s > "$BACKOFF_108_FILE"

      # 区分本地问题 vs 账号问题（关键诊断）
      local proc_count
      proc_count="$(ps aux | grep -E '[c]polar http' | wc -l | tr -d ' ')"
      if [ "$proc_count" = "0" ]; then
        err "🛑 ERR_CPOLAR_108（第 ${hits} 次触发）：账号配额被其他设备占用，本机无 cpolar 进程但云端满"
        err "   本系统已无能为力（杀不到任何进程释放槽位）"
        err "   必须人工处理：① cpolar 官网后台 → 在线客户端/会话 → 手动下线僵尸会话"
        err "                   ② 排查本机 Windows 客户端、其他 AutoDL 实例、其他设备是否在用同一账号"
        err "   解除方式（处理完账号问题后）："
        err "     rm -f $BACKOFF_108_LOCK $BACKOFF_108_HITS && $SCRIPT_DIR/start-cpolar.sh $PORT"
        # 一旦判定为"被其他设备占用" → 立即硬停止，不再每 30 分钟撞一次 108
        touch "$BACKOFF_108_LOCK"
        exit 1
      fi

      err "⚠️  ERR_CPOLAR_108（第 ${hits} 次触发）：账号并发会话数已达上限（Basic 套餐 = 16 个）"
      err "   本机已强杀全部 cpolar 进程；云端僵尸会话需等约 20-30 分钟自动过期"
      err "   进入 $((backoff / 60)) 分钟退避期（指数退避，第 ${hits} 次），到期自动重试"
      err "   人工加速：① cpolar 官网后台手动下线僵尸会话；② 排查其他设备是否占用"

      # 连击告警：连续触发达上限次数 → 硬停止 + 升级到置顶告警
      if [ "$hits" -ge "$BACKOFF_108_HARDSTOP" ]; then
        err "🛑 已连续触发 ERR_CPOLAR_108 ${hits} 次，自动恢复系统放弃重连"
        err "   退避期不断增长已无意义（说明云端会话被长期持有）"
        err "   必须人工处理后手动重启隧道："
        err "     rm -f $BACKOFF_108_LOCK $BACKOFF_108_HITS && $SCRIPT_DIR/start-cpolar.sh $PORT"
        touch "$BACKOFF_108_LOCK"
        exit 1
      fi

      exit 1
    fi

    # 健康/正常路径下首次成功时清零 108 计数（说明已恢复）
    rm -f "$BACKOFF_108_FILE" "$BACKOFF_108_HITS" "$BACKOFF_108_LOCK" 2>/dev/null || true

    # 2. Node 端口探测（决定要不要重启 Node）
    local node; node="$(probe_node_port || true)"
    if [ "$node" != "listening" ]; then
      warn "原因：Node 服务未监听 :$PORT（$node）—— 公网 502 的常见根源"
      act  "解决：重启 Node 服务（即将自动执行）→"
      echo "     pkill -f 'tsx server/index.ts'; sleep 2; cd $PROJECT_DIR; PORT=$PORT nohup npm run server > server.log 2>&1 &"
      need_node_restart=1
    else
      ok "Node 在监听 :$PORT"
    fi

    # 3. cpolar 进程探测（决定要不要重启 cpolar；含"进程在但隧道已死"的僵尸识别）
    local cp; cp="$(probe_cpolar_proc || true)"
    if [ "$cp" != "running" ]; then
      warn "原因：cpolar 客户端异常（$cp）—— 公网将直接无法访问或映射失效"
      act  "解决：重启 cpolar 隧道（即将自动执行）→"
      echo "     pkill -f 'cpolar http'; sleep 2; cd $PROJECT_DIR; SKIP_PREFLIGHT=1 bash $SCRIPT_DIR/start-cpolar.sh $PORT"
      need_cpolar_restart=1
    else
      ok "cpolar 进程在运行，隧道 API 正常"
    fi

    # 4. 按顺序恢复：Node 先，cpolar 后（让 cpolar 指到活的 Node）
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
      err "请人工介入，按顺序手动执行以下命令："
      echo ""
      echo "  # ── ① 重启 Node 服务（后端）──"
      echo "  pkill -f 'tsx server/index.ts'; sleep 2; cd $PROJECT_DIR; PORT=$PORT nohup npm run server > server.log 2>&1 &"
      echo "  ss -tlnp | grep $PORT        # 确认在监听"
      echo ""
      echo "  # ── ② 重启 cpolar 隧道（公网入口）──"
      echo "  pkill -9 -f 'cpolar http'; sleep 2; cd $PROJECT_DIR; SKIP_PREFLIGHT=1 bash $SCRIPT_DIR/start-cpolar.sh $PORT"
      echo "  # 若 cpolar.log 出现 ERR_CPOLAR_108（会话数超限）：等 20-30 分钟让僵尸会话过期，"
      echo "  # 或到 cpolar 官网后台手动下线僵尸会话；期间不要反复重连（会继续堆积会话）。"
      echo "  # 若提示『未检测到 cpolar』→ 系统盘重置导致二进制丢失，脚本会自动重装并固化到 /root/autodl-tmp/bin"
      echo ""
      echo "  # ── ③ 查日志定位（三份日志都要看）──"
      echo "  tail -50 $PROJECT_DIR/server.log          # Node 报错？端口冲突？"
      echo "  tail -50 $PROJECT_DIR/cpolar.log          # 隧道地址是否生成？"
      echo "  tail -30 $PROJECT_DIR/cpolar-watchdog.log # watchdog 本次诊断记录"
      echo ""
      echo "  # ── ④ 以上都正常仍不通 → AutoDL 实例层面问题 ──"
      echo "  # 去 AutoDL 控制台确认实例未休眠/未欠费，必要时【控制台重启实例】，"
      echo "  # 重启后需重新执行 ①②③（实例重启会杀掉所有进程和隧道）。"
      echo ""
      echo "  恢复后验证: curl -s $PUBLIC_URL | grep $EXPECTED_MARKER"
      exit 1
    fi
  fi
}

main "$@"
