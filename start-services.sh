#!/usr/bin/env bash

set -Eeuo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR_INPUT="${GOOGLE_MANAGER_ROOT_DIR:-$SCRIPT_DIR}"
if ! ROOT_DIR="$(cd "$ROOT_DIR_INPUT" 2>/dev/null && pwd)"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 工作目录不存在：$ROOT_DIR_INPUT" >&2
    exit 1
fi

normalize_base_path() {
    local value="$1"
    if [[ -z "$value" || "$value" == "/" ]]; then
        printf '%s' '/'
        return 0
    fi

    [[ "$value" == /* ]] || value="/$value"
    [[ "$value" == */ ]] || value="$value/"
    printf '%s' "$value"
}

SERVICE_NAME="${GOOGLE_MANAGER_SERVICE_NAME:-Google Manager}"
LOG_DIR="${GOOGLE_MANAGER_LOG_DIR:-${XDG_RUNTIME_DIR:-/tmp}/google-manager}"
BACKEND_PORT="${GOOGLE_MANAGER_BACKEND_PORT:-3001}"
FRONTEND_PORT="${GOOGLE_MANAGER_FRONTEND_PORT:-5173}"
FRONTEND_HOST="${GOOGLE_MANAGER_FRONTEND_HOST:-0.0.0.0}"
BASE_PATH="$(normalize_base_path "${GOOGLE_MANAGER_BASE_PATH:-/gm/}")"
API_BASE_PATH="${VITE_API_URL:-${BASE_PATH%/}/api}"
API_TARGET="${GOOGLE_MANAGER_API_TARGET:-http://127.0.0.1:${BACKEND_PORT}}"
FRONTEND_MODE="${GOOGLE_MANAGER_FRONTEND_MODE:-dev}"
STATIC_DEPLOY_ROOT="${GOOGLE_MANAGER_STATIC_DEPLOY_ROOT:-/var/www/gmanager-hdy-prod}"
STATIC_DEPLOY_DIR="${GOOGLE_MANAGER_STATIC_DEPLOY_DIR:-${STATIC_DEPLOY_ROOT%/}${BASE_PATH}}"
FRONTEND_HEALTHCHECK_URL="${GOOGLE_MANAGER_FRONTEND_HEALTHCHECK_URL:-}"
FRONTEND_BUILD_DIR="${GOOGLE_MANAGER_FRONTEND_BUILD_DIR:-$ROOT_DIR/static}"
BACKEND_BIN="${GOOGLE_MANAGER_BACKEND_BIN:-$ROOT_DIR/src-tauri/target/debug/google-manager}"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_LOG="$LOG_DIR/gm-backend.log"
FRONTEND_LOG="$LOG_DIR/gm-frontend.log"
GM_PASSWORD="${GOOGLE_MANAGER_ADMIN_PASSWORD:-admin123}"

backend_pid=""
frontend_pid=""

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

resolve_pnpm() {
    if command -v pnpm >/dev/null 2>&1; then
        command -v pnpm
        return 0
    fi

    return 1
}

setup_runtime_path() {
    export PATH="$HOME/.local/bin:$HOME/.local/share/pnpm:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

    local node_bin
    for node_bin in "$HOME"/.nvm/versions/node/*/bin; do
        export PATH="$node_bin:$PATH"
    done
}

wait_for_tcp_port() {
    local port="$1"
    local name="$2"
    local attempts="${3:-20}"
    local i

    for ((i = 1; i <= attempts; i++)); do
        if ss -ltn "( sport = :$port )" | tail -n +2 | grep -q ":$port"; then
            log "$name 已监听端口 $port"
            return 0
        fi
        sleep 1
    done

    log "$name 在 ${attempts}s 内未监听端口 $port"
    return 1
}

wait_for_http() {
    local url="$1"
    local name="$2"
    local attempts="${3:-20}"
    local i

    for ((i = 1; i <= attempts; i++)); do
        if curl --silent --show-error --fail --max-time 2 "$url" >/dev/null; then
            log "$name HTTP 检查通过：$url"
            return 0
        fi
        sleep 1
    done

    log "$name 在 ${attempts}s 内未通过 HTTP 检查：$url"
    return 1
}

sync_dir_contents() {
    local source_dir="$1"
    local target_dir="$2"

    mkdir -p "$target_dir"

    if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete "$source_dir"/ "$target_dir"/
        return 0
    fi

    find "$target_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -a "$source_dir"/. "$target_dir"/
}

build_static_frontend() {
    local build_sha build_time

    build_sha="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || true)"
    build_time="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

    log "构建 ${SERVICE_NAME} 前端静态资源：$PNPM_BIN run build"
    cd "$FRONTEND_DIR"
    GOOGLE_MANAGER_BASE_PATH="$BASE_PATH" \
        VITE_API_URL="$API_BASE_PATH" \
        GOOGLE_MANAGER_API_TARGET="$API_TARGET" \
        GOOGLE_MANAGER_GIT_SHA="$build_sha" \
        GOOGLE_MANAGER_BUILD_TIME="$build_time" \
        GOOGLE_MANAGER_FRONTEND_BUILD_DIR="$FRONTEND_BUILD_DIR" \
        "$PNPM_BIN" run build >> "$FRONTEND_LOG" 2>&1
}

deploy_static_frontend() {
    local source_dir="$FRONTEND_BUILD_DIR"

    if [[ ! -f "$source_dir/index.html" ]]; then
        log "静态构建产物不存在：$source_dir/index.html"
        return 1
    fi

    sync_dir_contents "$source_dir" "$STATIC_DEPLOY_DIR"
    chmod -R a+rX "$STATIC_DEPLOY_DIR"
    log "${SERVICE_NAME} 静态资源已部署到：$STATIC_DEPLOY_DIR"
}

cleanup() {
    local exit_code="${1:-$?}"

    trap - EXIT INT TERM

    for pid in "$frontend_pid" "$backend_pid"; do
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done

    for pid in "$frontend_pid" "$backend_pid"; do
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            timeout 10s bash -lc "while kill -0 $pid 2>/dev/null; do sleep 0.2; done" || kill -9 "$pid" 2>/dev/null || true
        fi
    done

    exit "$exit_code"
}

trap 'cleanup 0' INT TERM
trap 'cleanup $?' EXIT

if [[ ! -x "$BACKEND_BIN" ]]; then
    log "后端二进制不存在或不可执行：$BACKEND_BIN"
    log "请先执行：cd $ROOT_DIR/src-tauri && cargo build --no-default-features --features test-server"
    exit 1
fi

if [[ ! -d "$FRONTEND_DIR" ]]; then
    log "前端目录不存在：$FRONTEND_DIR"
    exit 1
fi

setup_runtime_path

PNPM_BIN="$(resolve_pnpm || true)"
if [[ -z "$PNPM_BIN" ]]; then
    log "未找到 pnpm，请确认 Node.js / pnpm 已安装并对 systemd 用户环境可见"
    exit 1
fi

: > "$BACKEND_LOG"
: > "$FRONTEND_LOG"

log "启动 ${SERVICE_NAME} 后端：$BACKEND_BIN --test-server --port $BACKEND_PORT"
GOOGLE_MANAGER_ADMIN_PASSWORD="$GM_PASSWORD"     "$BACKEND_BIN" --test-server --port "$BACKEND_PORT"     >> "$BACKEND_LOG" 2>&1 &
backend_pid="$!"

wait_for_tcp_port "$BACKEND_PORT" "${SERVICE_NAME} 后端"

case "$FRONTEND_MODE" in
    dev)
        log "启动 ${SERVICE_NAME} 前端：$PNPM_BIN run dev -- --host $FRONTEND_HOST --port $FRONTEND_PORT --strictPort"
        cd "$FRONTEND_DIR"
        GOOGLE_MANAGER_BASE_PATH="$BASE_PATH" \
            VITE_API_URL="$API_BASE_PATH" \
            GOOGLE_MANAGER_API_TARGET="$API_TARGET" \
            "$PNPM_BIN" run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" --strictPort \
            >> "$FRONTEND_LOG" 2>&1 &
        frontend_pid="$!"
        wait_for_http "http://127.0.0.1:${FRONTEND_PORT}${BASE_PATH}" "${SERVICE_NAME} 前端"
        log "${SERVICE_NAME} 服务已就绪：前端 http://$FRONTEND_HOST:${FRONTEND_PORT}${BASE_PATH} ，后端 http://0.0.0.0:${BACKEND_PORT}"
        ;;
    static)
        build_static_frontend
        deploy_static_frontend

        static_healthcheck_url="$FRONTEND_HEALTHCHECK_URL"
        if [[ -n "$static_healthcheck_url" ]]; then
            wait_for_http "$static_healthcheck_url" "${SERVICE_NAME} 前端静态站点"
        fi
        log "${SERVICE_NAME} 服务已就绪：静态前端目录 ${STATIC_DEPLOY_DIR} ，后端 http://0.0.0.0:${BACKEND_PORT}"
        ;;
    *)
        log "不支持的 GOOGLE_MANAGER_FRONTEND_MODE：$FRONTEND_MODE"
        exit 1
        ;;
esac
log "日志目录：$LOG_DIR"

while true; do
    if ! kill -0 "$backend_pid" 2>/dev/null; then
        log "后端进程已退出"
        wait "$backend_pid"
        exit $?
    fi

    if [[ "$FRONTEND_MODE" == "dev" ]]; then
        if ! kill -0 "$frontend_pid" 2>/dev/null; then
            log "前端进程已退出"
            wait "$frontend_pid"
            exit $?
        fi
    fi

    sleep 5
done
