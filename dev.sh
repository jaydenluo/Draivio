#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DEV_PORT="${DRAIVIO_DEV_PORT:-5173}"
LOG_DIR="${DRAIVIO_LOG_DIR:-$ROOT_DIR/logs}"
DEV_COMMAND="${DRAIVIO_DEV_COMMAND:-npm run tauri:dev}"
STAMP="$(date '+%Y%m%d-%H%M%S')"
LOG_FILE="$LOG_DIR/dev-$STAMP.log"

mkdir -p "$LOG_DIR"

port_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$DEV_PORT" -sTCP:LISTEN 2>/dev/null || true
  elif command -v fuser >/dev/null 2>&1; then
    fuser -n tcp "$DEV_PORT" 2>/dev/null || true
  fi
}

stop_port_processes() {
  local pids
  pids="$(port_pids | tr '\n' ' ')"
  if [[ -z "${pids// /}" ]]; then
    echo "[Draivio] 端口 $DEV_PORT 没有占用"
    return
  fi

  echo "[Draivio] 清理端口 $DEV_PORT，占用进程：$pids"
  kill $pids 2>/dev/null || true
  for _ in {1..20}; do
    [[ -z "$(port_pids | tr -d '[:space:]')" ]] && return
    sleep 0.1
  done
  echo "[Draivio] 进程仍未退出，发送强制终止信号"
  kill -KILL $pids 2>/dev/null || true
}

stop_port_processes
echo "[Draivio] 日志文件：$LOG_FILE"
echo "[Draivio] 启动命令：$DEV_COMMAND"
echo "[Draivio] 按 Ctrl+C 停止开发服务"

set +e
bash -c "$DEV_COMMAND" 2>&1 | tee "$LOG_FILE"
status=${PIPESTATUS[0]}
set -e
exit "$status"
