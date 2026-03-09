#!/usr/bin/env bash
# ─── AI Client 一键启动脚本 ──────────────────────────────────────────
# 用法: ./start.sh [start|stop|restart|status]
# ─────────────────────────────────────────────────────────────────────
set -e

ACTION=${1:-start}
ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PID="$ROOT/.backend.pid"
FRONTEND_PID="$ROOT/.frontend.pid"

# ← 改成你的 conda 环境中的 Python 路径
PYTHON="/Users/dongyu/miniconda3/envs/chatbot/bin/python"
UVICORN="/Users/dongyu/miniconda3/envs/chatbot/bin/uvicorn"

is_running() {
  local pidfile=$1
  [ -f "$pidfile" ] && kill -0 "$(cat $pidfile)" 2>/dev/null
}

start_backend() {
  if is_running "$BACKEND_PID"; then
    echo "  ⚠️  后端已在运行 (PID $(cat $BACKEND_PID))"
    return
  fi
  echo "  🚀 启动后端…"
  cd "$ROOT/backend"
  nohup "$UVICORN" main:app --host 0.0.0.0 --port 8000 --reload \
    > "$ROOT/logs/backend.log" 2>&1 &
  echo $! > "$BACKEND_PID"
  echo "     PID: $(cat $BACKEND_PID) | 日志: $ROOT/logs/backend.log"
}

start_frontend() {
  if is_running "$FRONTEND_PID"; then
    echo "  ⚠️  前端已在运行 (PID $(cat $FRONTEND_PID))"
    return
  fi
  echo "  🎨 启动前端…"
  cd "$ROOT/frontend"
  [ ! -d "node_modules" ] && npm install --silent
  nohup npm run dev > "$ROOT/logs/frontend.log" 2>&1 &
  echo $! > "$FRONTEND_PID"
  echo "     PID: $(cat $FRONTEND_PID) | 日志: $ROOT/logs/frontend.log"
}

stop_service() {
  local pidfile=$1 name=$2
  if is_running "$pidfile"; then
    # Kill process group to also kill child processes (e.g. uvicorn reloader)
    kill -- -$(ps -o pgid= -p "$(cat $pidfile)" | tr -d ' ') 2>/dev/null \
      || kill "$(cat $pidfile)" 2>/dev/null || true
    echo "  🛑 已停止 $name"
  else
    echo "  ℹ️  $name 未运行"
  fi
  rm -f "$pidfile"
}

status_service() {
  local pidfile=$1 name=$2
  if is_running "$pidfile"; then
    echo "  ✅ $name 运行中 (PID $(cat $pidfile))"
  else
    echo "  ❌ $name 未运行"
  fi
}

mkdir -p "$ROOT/logs"

case "$ACTION" in
  start)
    echo "── AI Client ──────────────────────────────"
    start_backend
    start_frontend
    sleep 2
    echo ""
    echo "✅ 启动完成！"
    echo "   🌐 前端:  http://localhost:5173"
    echo "   📡 后端:  http://localhost:8000/docs"
    ;;
  stop)
    echo "── 停止服务 ───────────────────────────────"
    stop_service "$BACKEND_PID" "后端"
    stop_service "$FRONTEND_PID" "前端"
    ;;
  restart)
    "$0" stop
    sleep 1
    "$0" start
    ;;
  status)
    echo "── 服务状态 ───────────────────────────────"
    status_service "$BACKEND_PID" "后端 (FastAPI :8000)"
    status_service "$FRONTEND_PID" "前端 (Vite :5173)"
    ;;
  *)
    echo "用法: $0 [start|stop|restart|status]"
    exit 1
    ;;
esac
