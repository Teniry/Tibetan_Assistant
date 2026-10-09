#!/usr/bin/env bash
# ============================================================================
# switch-to-clean-watchdog.sh —— 一键停 108-aware loop、启动清爽版（24h 实验专用）
#
# 操作步骤：
#   1. 停掉可能仍在跑的旧 watchdog loop（指向 cpolar-keepalive.sh）
#   2. 用环境变量 KEEPALIVE 重启 loop，让它指向清爽版 cpolar-keepalive-clean.sh
#   3. 立即触发一次清爽版探针，确认它能跑通
#
# 用法（服务器上执行）：
#   bash /root/autodl-tmp/木雅语助手-8.20-0320/scripts/switch-to-clean-watchdog.sh
#
# 回滚到 108-aware 版：
#   pkill -f cpolar-watchdog-loop
#   cd /root/autodl-tmp/木雅语助手-8.20-0320
#   nohup bash scripts/cpolar-watchdog-loop.sh > /dev/null 2>&1 &
# ============================================================================
set -uo pipefail

PROJECT_DIR="/root/autodl-tmp/木雅语助手-8.20-0320"
SCRIPTS_DIR="$PROJECT_DIR/scripts"
LOG_CLEAN="$PROJECT_DIR/cpolar-watchdog-clean.log"
LOG_LOOP="$PROJECT_DIR/cpolar-watchdog-loop.log"

echo "════════════════════════════════════════════"
echo " 切换 watchdog → 清爽版（24h 实验）"
echo "════════════════════════════════════════════"

# 1) 停掉旧 loop
echo ""
echo "⏹  停掉旧 watchdog loop（如有）..."
pkill -f cpolar-watchdog-loop 2>/dev/null || true
sleep 1
echo "   已停"

# 2) 用清爽版脚本作为 KEEPALIVE，重启 loop
echo ""
echo "▶  启动清爽版 loop（KEEPALIVE=cpolar-keepalive-clean.sh）..."
cd "$PROJECT_DIR" || exit 1

# 让 KEEPALIVE 环境变量只对本进程生效，用 setsid 防止它跟着当前会话退出
KEEPALIVE="$SCRIPTS_DIR/cpolar-keepalive-clean.sh" \
LOG="$LOG_CLEAN" \
setsid nohup bash "$SCRIPTS_DIR/cpolar-watchdog-loop.sh" \
  > "$LOG_LOOP" 2>&1 < /dev/null &
disown || true

sleep 2

# 3) 确认 loop 已起来
if pgrep -f cpolar-watchdog-loop >/dev/null 2>&1; then
    echo "✅ loop 已运行："
    pgrep -af cpolar-watchdog-loop
else
    echo "❌ loop 启动失败，请看 $LOG_LOOP"
    exit 1
fi

# 4) 立即触发一次清爽版探针（让用户立刻看到效果）
echo ""
echo "🔍 立即跑一次清爽版探针（无需等 5 分钟）..."
KEEPALIVE="$SCRIPTS_DIR/cpolar-keepalive-clean.sh" \
LOG="$LOG_CLEAN" \
bash "$SCRIPTS_DIR/cpolar-keepalive-clean.sh"

# 5) 输出最新日志
echo ""
echo "════════════════════════════════════════════"
echo " 📄 $LOG_CLEAN 最新 30 行"
echo "════════════════════════════════════════════"
tail -30 "$LOG_CLEAN" 2>/dev/null || echo "(日志文件不存在)"

echo ""
echo "════════════════════════════════════════════"
echo " ⏰ 24 小时后请回来"
echo "    tail -f $LOG_CLEAN"
echo "    观察日志：若全程只有 ✅ 行 → 实验成功（僵尸真的过期了）"
echo "           若出现 ⚠️ / ❌ 行 → 验证了僵尸还会回来，必须换 Cloudflare"
echo "════════════════════════════════════════════"