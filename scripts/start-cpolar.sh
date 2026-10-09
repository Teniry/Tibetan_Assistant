#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# cpolar 公网隧道启动脚本（AutoDL 专用，适配 cpolar 3.3.x）
#
# 用法：./scripts/start-cpolar.sh [端口]     端口默认 6020
#   绑定固定二级子域名 assistant3（需 cpolar 付费套餐且已在后台预留）
#
# v3.3.x 兼容要点（2026-09-01 排障结论）：
#   1) 配置路径变为 /usr/local/etc/cpolar/cpolar.yml（系统盘，重启会丢）
#      → 本脚本把认证配置固化到数据盘 /root/autodl-tmp/cpolar-conf/cpolar.yml，
#        启动时用 -config 显式指定，系统盘重置后自动重建认证。
#   2) cpolar 3.x 在 stdout 非 TTY（重定向到文件）时静默运行，日志里没有 URL
#      → 改用 dashboard API（http://127.0.0.1:4054/api/tunnels）提取公网地址。
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# AutoDL 关机重启后系统盘（/）会重置，/usr/local/bin 里的 cpolar 会丢；
# 所以把 cpolar 二进制固化到数据盘 /root/autodl-tmp/bin，优先使用数据盘副本
export PATH="/root/autodl-tmp/bin:$PATH"
# watchdog 场景已知隧道挂了，跳过 preflight 直接重建（省 16 秒）；手动运行仍走 preflight
SKIP_PREFLIGHT="${SKIP_PREFLIGHT:-0}"
# 本项目依赖固定域名 assistant3，失败时默认不切换随机地址。
# 只有人工明确设置 CPOLAR_ALLOW_RANDOM_FALLBACK=1 时才允许随机地址兜底。
ALLOW_RANDOM_FALLBACK="${CPOLAR_ALLOW_RANDOM_FALLBACK:-0}"

# 防止并发运行（cron 与手动同时触发会各自拉起 cpolar 进程，堆积账号会话）
exec 9>/tmp/cpolar-start.lock
if ! flock -n 9 2>/dev/null; then
  echo "⏳ 另一个 start-cpolar.sh 正在运行，本次跳过（避免并发创建多个会话）"
  exit 0
fi

PORT_VALUE="${1:-${PORT:-6020}}"
SUBDOMAIN="${CPOLAR_SUBDOMAIN-assistant3}"

if [ -f /root/.muya-env ]; then
  # shellcheck disable=SC1091
  source /root/.muya-env
fi
AUTHTOKEN="${CPOLAR_AUTHTOKEN:-}"
if [ -z "$AUTHTOKEN" ]; then
  echo "❌ 未配置 CPOLAR_AUTHTOKEN；请使用环境变量或受限权限配置文件提供，不得硬编码到项目源码。"
  exit 1
fi

# ── 认证配置固化到数据盘（新版 cpolar 默认写系统盘 /usr/local/etc/cpolar/，重启会丢）──
CONF_DIR="/root/autodl-tmp/cpolar-conf"
CONF="$CONF_DIR/cpolar.yml"
mkdir -p "$CONF_DIR"
if [ ! -f "$CONF" ]; then
  if [ -f /usr/local/etc/cpolar/cpolar.yml ]; then
    cp /usr/local/etc/cpolar/cpolar.yml "$CONF"
    echo "✅ 已从系统盘迁移配置到数据盘：$CONF"
  else
    cat > "$CONF" <<EOF
authtoken: $AUTHTOKEN
tunnels:
  website:
    proto: http
    addr: "$PORT_VALUE"
EOF
    echo "✅ 已生成认证配置（数据盘）：$CONF"
  fi
fi
# 确保 authtoken 为最新（直接改文件，绕开 cpolar authtoken 命令的 CLI 兼容问题）
if ! grep -q "^authtoken: $AUTHTOKEN$" "$CONF"; then
  sed -i "s|^authtoken:.*|authtoken: $AUTHTOKEN|" "$CONF"
fi

# cpolar 在 nohup 重定向下日志会被缓冲，优先 stdbuf 强制行缓冲
if command -v stdbuf >/dev/null 2>&1; then
  CPOLAR="stdbuf -oL cpolar"
else
  CPOLAR="cpolar"
fi

# 1. 安装 cpolar（已安装则跳过；安装带超时，避免网络慢时永久挂起）
if ! command -v cpolar >/dev/null 2>&1; then
  echo "未检测到 cpolar，开始安装（限时 90 秒）..."
  curl -L --max-time 90 https://www.cpolar.com/static/downloads/install-release-cpolar.sh -o /tmp/install-cpolar.sh \
    || { echo "❌ 下载安装脚本失败（网络不通？）"; exit 1; }
  sudo bash /tmp/install-cpolar.sh \
    || { echo "❌ cpolar 安装失败"; exit 1; }
  if ! command -v cpolar >/dev/null 2>&1; then
    echo "❌ cpolar 安装后仍不可用"
    exit 1
  fi
fi

# 无论是本次新安装还是系统盘已有版本，都补一份到数据盘。
# 修复“系统 cpolar 可用，但 /root/autodl-tmp/bin/cpolar 不存在”的情况。
CPOLAR_RESOLVED="$(command -v cpolar)"
mkdir -p /root/autodl-tmp/bin
if [ "$CPOLAR_RESOLVED" != "/root/autodl-tmp/bin/cpolar" ]; then
  cp "$CPOLAR_RESOLVED" /root/autodl-tmp/bin/cpolar
  chmod +x /root/autodl-tmp/bin/cpolar
  hash -r
  echo "✅ cpolar 已固化到数据盘：/root/autodl-tmp/bin/cpolar"
fi

# 2. 先做公网预检；健康时直接复用，不结束已有的固定隧道。
#    只有预检失败或 watchdog 明确要求重建时，才会执行后面的进程清理。
#
# 停掉旧隧道时要同时匹配旧命令行形态和 3.x master/worker 形态。
#    （-9 强杀：残留的 cpolar 进程会在云端各占 1 个会话槽位，僵尸会话 20-30 分钟才过期，
#     这正是 ERR_CPOLAR_108「会话数超限」的主要来源）
#    ⚠️ 2026-09-07 修复：cpolar 3.x 运行后会把进程名改成 "cpolar: master process"，
#    只 pkill 'cpolar http' 永远匹配不到它 → 老进程占着 4054 端口 → 新进程起不来 → 死循环。
#    必须同时杀 "cpolar:" 开头的 master/worker 进程。

# 3. 预检：隧道若已在运行且公网能访问到我们页面，直接复用
preflight_url() {
  local proto body
  for proto in https http; do
    body="$(curl -s --max-time 8 "${proto}://${SUBDOMAIN}.cpolar.cn/" 2>/dev/null || true)"
    if printf '%s' "$body" | grep -q 'boot-screen'; then
      echo "${proto}://${SUBDOMAIN}.cpolar.cn"
      return 0
    fi
  done
  return 1
}

# 从 cpolar dashboard API 提取公网地址（3.x 非 TTY 静默，日志无 URL，必须走 API）
wait_for_url() {
  local timeout="$1" url="" api body raw
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    # 固定域名已经能返回项目页面时，直接判定隧道成功。某些 cpolar 3.x
    # 版本虽然隧道正常，但 dashboard 参数会回落到4040或 API 暂时不可读。
    if [ -n "${SUBDOMAIN:-}" ]; then
      body="$(curl -s --max-time 3 "https://${SUBDOMAIN}.cpolar.cn/" 2>/dev/null || true)"
      if printf '%s' "$body" | grep -q 'boot-screen'; then
        echo "https://${SUBDOMAIN}.cpolar.cn"
        return 0
      fi
    fi
    for api in 127.0.0.1:4054 127.0.0.1:4040; do
      raw="$(curl -s --max-time 1 "http://${api}/api/tunnels" 2>/dev/null || true)"
      url="$(printf '%s' "$raw" \
        | grep -oE '"public_url"[[:space:]]*:[[:space:]]*"https?://[^"]+"' \
        | head -n 1 \
        | sed -E 's/.*"public_url"[[:space:]]*:[[:space:]]*"//; s/"$//' || true)"
      if [ -n "$url" ]; then
        echo "$url"
        return 0
      fi
    done
    sleep 1
  done
  return 1
}

echo "---------------------------------------------"
URL=""
if [ -n "$SUBDOMAIN" ] && [ "$SKIP_PREFLIGHT" != "1" ]; then
  if EXISTING="$(preflight_url)"; then
    echo "✅ 隧道已在运行且公网正常：$EXISTING（跳过重启，直接复用）"
    echo "   打开即可进入木雅语助手主页（2D/3D 选择页）"
    echo "---------------------------------------------"
    exit 0
  fi
fi

# 公网预检未通过，清理残留进程后再建立新隧道。
pkill -9 -f "cpolar http" 2>/dev/null || true
pkill -9 -f "cpolar:" 2>/dev/null || true
sleep 1

if [ -n "$SUBDOMAIN" ]; then
  echo "尝试绑定固定二级子域名：${SUBDOMAIN}.cpolar.cn ..."
  rm -f cpolar.log
  # cpolar 常驻进程不能继承 start-cpolar 的 flock 描述符9，否则启动脚本
  # 退出后锁仍会一直被 cpolar 占用，下一次故障恢复将无法进入。
  ( exec 9>&-; nohup $CPOLAR http -config "$CONF" -dashboard 127.0.0.1:4054 \
    -subdomain="$SUBDOMAIN" -region=cn "$PORT_VALUE" > cpolar.log 2>&1 & )
  if URL="$(wait_for_url 30)"; then
    echo "✅ 固定公网地址：$URL"
    echo "   打开即可进入木雅语助手主页（2D/3D 选择页）"
  else
    cp -f cpolar.log cpolar-fixed-error.log 2>/dev/null || true
    echo "⚠️  绑定固定子域名 ${SUBDOMAIN} 失败。"
    echo "   失败详情（cpolar.log 摘要）："
    tail -n 8 cpolar.log 2>/dev/null | sed 's/^/     /' || true
    # 认证/会话类错误专项处理：此时再起随机地址进程也必然失败，且会继续堆积账号会话 → 强杀退出
    if grep -qE 'ERR_CPOLAR_108|simultaneous cpolar client sessions|登录用户数超过限制' cpolar.log 2>/dev/null; then
      echo "❌ 检测到账号会话数超限（ERR_CPOLAR_108），已强杀本机全部 cpolar 进程，不再回退随机地址。"
      echo "   原因：账号并发客户端会话已达上限（Basic 套餐 = 16 个），多为僵尸会话未释放或其他设备占用。"
      echo "   处理：① 等 20-30 分钟让云端僵尸会话自动过期；"
      echo "        ② 登录 cpolar 官网后台查看在线客户端/会话并手动下线；"
      echo "        ③ 确认没有其他机器（本机 Windows、其他 AutoDL 实例）在用同一账号跑 cpolar。"
      pkill -9 -f "cpolar http" 2>/dev/null || true
      pkill -9 -f "cpolar:" 2>/dev/null || true
      exit 1
    fi
    if [ "$ALLOW_RANDOM_FALLBACK" != "1" ]; then
      echo "❌ 当前为固定域名守护模式，已禁止回退随机地址，避免 watchdog 反复误判和重启。"
      echo "   完整固定域名错误已保留到：$PROJECT_DIR/cpolar-fixed-error.log"
      pkill -9 -f "cpolar http" 2>/dev/null || true
      pkill -9 -f "cpolar:" 2>/dev/null || true
      exit 1
    fi
    echo "↻ 手动启动允许随机地址兜底，正在回退到随机地址。"
    echo "   如需固定域名：升级 cpolar 付费套餐 → 官网后台「预留 → 保留二级子域名」"
    echo "   填 assistant3（地区 China）→ 重新运行本脚本。"
    pkill -9 -f "cpolar http" 2>/dev/null || true
    pkill -9 -f "cpolar:" 2>/dev/null || true
    sleep 1
  fi
fi

if [ -z "$URL" ]; then
  rm -f cpolar.log
  ( exec 9>&-; nohup $CPOLAR http -config "$CONF" -dashboard 127.0.0.1:4054 \
    -region=cn "$PORT_VALUE" > cpolar.log 2>&1 & )
  if URL="$(wait_for_url 30)"; then
    echo "✅ 公网地址：$URL"
    echo "   打开即可进入木雅语助手主页（2D/3D 选择页）"
    echo "   注意：免费版随机地址在重启后可能变化，重跑本脚本即可"
  else
    echo "❌ 未获取到公网地址，请检查：tail -n 40 cpolar.log"
    # 失败也要强杀残留进程：卡在重连的 cpolar 进程会在云端占用会话槽位（会话泄漏根源）
    pkill -9 -f "cpolar http" 2>/dev/null || true
    pkill -9 -f "cpolar:" 2>/dev/null || true
    exit 1
  fi
fi
echo "---------------------------------------------"
