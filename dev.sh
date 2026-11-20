#!/usr/bin/env bash

# Parse the complete entry point before starting long-running child processes.
# An editor may replace this file while the development server is running.
main() {
  set -Eeuo pipefail

  usage() {
    echo '用法：./dev.sh [web|desktop]'
    echo '  web      清理端口并启动 Web 预览（默认）'
    echo '  desktop  清理 5173 端口并启动 Tauri 桌面端'
    echo '  --help   显示帮助，不清理端口或启动服务'
  }

  if [[ $# -gt 1 ]]; then
    usage >&2
    return 2
  fi
  DEV_MODE="${1:-web}"
  case "$DEV_MODE" in
    web|desktop) ;;
    -h|--help) usage; return 0 ;;
    *) usage >&2; return 2 ;;
  esac

  ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  cd "$ROOT_DIR"

  DEV_PORT="${DRAIVIO_DEV_PORT:-5173}"
  LOG_DIR="${DRAIVIO_LOG_DIR:-$ROOT_DIR/logs}"
  if [[ "$DEV_MODE" == "desktop" ]]; then
    if [[ "$DEV_PORT" != "5173" ]]; then
      echo '[Draivio] 桌面模式使用固定端口 5173，请移除 DRAIVIO_DEV_PORT 设置' >&2
      return 2
    fi
    DEV_COMMAND="${DRAIVIO_DEV_COMMAND:-npm run tauri:dev}"
  else
    DEV_COMMAND="${DRAIVIO_DEV_COMMAND:-npm exec -- vite --port ${DEV_PORT} --strictPort}"
  fi
  STAMP="$(date '+%Y%m%d-%H%M%S')"
  LOG_FILE="$LOG_DIR/dev-$STAMP.log"

  mkdir -p "$LOG_DIR"

  node "$ROOT_DIR/scripts/clear-dev-port.mjs" "$DEV_PORT"
  echo "[Draivio] 启动模式：${DEV_MODE}"
  echo "[Draivio] 日志文件：$LOG_FILE"
  echo "[Draivio] 启动命令：$DEV_COMMAND"
  echo "[Draivio] 按 Ctrl+C 停止开发服务"

  set +e
  bash -c "$DEV_COMMAND" 2>&1 | tee "$LOG_FILE"
  status=${PIPESTATUS[0]}
  set -e
  exit "$status"
}

main "$@"
