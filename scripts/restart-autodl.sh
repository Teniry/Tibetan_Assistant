#!/usr/bin/env bash
# ============================================================================
# AutoDL 实例（关机/重启）后一键恢复脚本
# 顺序：① Node 后端 → ② cpolar 隧道 → ③ cron 定时保活 → ④ 公网验证
#
# 用法（服务器上执行一次即可）：
#   bash /root/autodl-tmp/木雅语助手-8.20-0320/scripts/restart-autodl.sh
#
# 建议一劳永逸：AutoDL 控制台 → 实例「自定义开机命令」填入：
#   bash /root/autodl-tmp/木雅语助手-8.20-0320/scripts/restart-autodl.sh
# 之后实例每次开机自动恢复，无需手动操作。
# ============================================================================
set -uo pipefail

PROJECT_DIR="/root/autodl-tmp/木雅语助手-8.20-0320"
PORT="${PORT:-6020}"
PUBLIC_URL="${PUBLIC_URL:-http://assistant3.cpolar.cn/}"
MARKER="${MARKER:-boot-screen}"

echo "════════════════════════════════════════════"
echo " ① 启动 Node 后端（端口 $PORT）"
echo "════════════════════════════════════════════"
if ss -tln 2>/dev/null | grep -qE ":$PORT\b"; then
  echo "✅ Node 已在监听 :$PORT，跳过启动"
else
  pkill -f 'tsx server/index.ts' 2>/dev/null || true
  sleep 2
  cd "$PROJECT_DIR" || exit 1
  PORT="$PORT" nohup npm run server > server.log 2>&1 &
  sleep 4
  if ss -tln 2>/dev/null | grep -qE ":$PORT\b"; then
    echo "✅ Node 已监听 :$PORT"
  else
    echo "⚠️  Node 未监听 :$PORT，请查看：tail -30 $PROJECT_DIR/server.log"
  fi
fi

echo ""
echo "════════════════════════════════════════════"
echo " ② 启动 cpolar 隧道（转发到 :$PORT）"
echo "════════════════════════════════════════════"
cd "$PROJECT_DIR" || exit 1
CPOLAR_ALLOW_RANDOM_FALLBACK=0 bash scripts/start-cpolar.sh "$PORT"

echo ""
echo "════════════════════════════════════════════"
echo " ③ 启动 cron 定时保活检查（每 5 分钟）"
echo "════════════════════════════════════════════"
# AutoDL 系统盘重置后 cron 也会丢，缺失时自动重装
if ! command -v cron >/dev/null 2>&1; then
  echo "⚠️  未检测到 cron（系统盘重置会丢失），自动安装（限时 120 秒）..."
  apt-get update -qq && apt-get install -y cron >/dev/null 2>&1 \
    || echo "❌ apt 安装 cron 失败，将用 watchdog-loop 兜底"
fi
if command -v cron >/dev/null 2>&1; then
  service cron start
  if crontab -l 2>/dev/null | grep -q 'cpolar-keepalive'; then
    echo "✅ crontab 已有 keepalive 条目，无需重复写入"
  else
    (crontab -l 2>/dev/null; echo "*/5 * * * * $PROJECT_DIR/scripts/cpolar-keepalive.sh >> $PROJECT_DIR/cpolar-watchdog.log 2>&1") | crontab -
    echo "✅ 已写入 crontab：*/5 * * * * cpolar-keepalive.sh"
  fi
  crontab -l | grep cpolar-keepalive
else
  echo "⚠️  兜底方案：nohup bash $PROJECT_DIR/scripts/cpolar-watchdog-loop.sh > /dev/null 2>&1 &"
  nohup bash "$PROJECT_DIR/scripts/cpolar-watchdog-loop.sh" > /dev/null 2>&1 &
fi

echo ""
echo "════════════════════════════════════════════"
echo " ④ 验证公网（最长等待 30 秒）"
echo "════════════════════════════════════════════"
for _ in 1 2 3 4 5 6; do
  sleep 5
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PUBLIC_URL" 2>/dev/null || echo 000)"
  body="$(curl -s --max-time 10 "$PUBLIC_URL" 2>/dev/null || true)"
  if [ "$code" = "200" ] && printf '%s' "$body" | grep -q "$MARKER"; then
    echo "✅ 公网已恢复：$PUBLIC_URL （HTTP 200 + $MARKER 标记）"
    echo "   打开即可进入木雅语助手主页"
    exit 0
  fi
  echo "   （等待中… HTTP $code）"
done
echo ""
echo "❌ 公网未恢复，请按以下顺序人工排查："
echo "   tail -50 $PROJECT_DIR/server.log           # Node 报错？端口冲突？"
echo "   tail -50 $PROJECT_DIR/cpolar.log           # 隧道地址是否生成？"
echo "   tail -30 $PROJECT_DIR/cpolar-watchdog.log  # watchdog 诊断记录"
exit 1
