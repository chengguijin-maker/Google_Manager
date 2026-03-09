#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT_INPUT="${GOOGLE_MANAGER_ROOT_DIR:-$SCRIPT_DIR}"
if ! TARGET_ROOT="$(cd "$TARGET_ROOT_INPUT" 2>/dev/null && pwd)"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 预览工作目录不存在：$TARGET_ROOT_INPUT" >&2
    exit 1
fi

sanitize_name() {
    local raw="$1"
    local cleaned
    cleaned="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/-+/-/g; s/^-+//; s/-+$//')"
    if [[ -z "$cleaned" ]]; then
        return 1
    fi
    printf '%s' "$cleaned"
}

normalize_base_path() {
    local value="$1"
    [[ "$value" == /* ]] || value="/$value"
    [[ "$value" == */ ]] || value="$value/"
    printf '%s' "$value"
}

resolve_base_path() {
    local preview_name="$1"
    case "$preview_name" in
        preview)
            printf '%s' '/gm-preview/'
            ;;
        *)
            normalize_base_path "/gm-preview/${preview_name}"
            ;;
    esac
}

resolve_frontend_port() {
    local preview_name="$1"
    case "$preview_name" in
        preview)
            printf '%s' '4186'
            ;;
        *)
            local checksum slot
            checksum="$(printf '%s' "$preview_name" | cksum | awk '{print $1}')"
            slot=$((checksum % 100))
            printf '%s' "$((4200 + slot))"
            ;;
    esac
}

resolve_backend_port() {
    local preview_name="$1"
    case "$preview_name" in
        preview)
            printf '%s' '3916'
            ;;
        *)
            local checksum slot
            checksum="$(printf '%s' "$preview_name" | cksum | awk '{print $1}')"
            slot=$((checksum % 100))
            printf '%s' "$((3940 + slot))"
            ;;
    esac
}

PREVIEW_NAME_INPUT="${1:-${GOOGLE_MANAGER_PREVIEW_NAME:-}}"
if [[ -z "$PREVIEW_NAME_INPUT" ]]; then
    echo "用法：start-preview.sh <preview-name>" >&2
    exit 1
fi

if ! PREVIEW_NAME="$(sanitize_name "$PREVIEW_NAME_INPUT")"; then
    echo "预览实例名非法：$PREVIEW_NAME_INPUT" >&2
    exit 1
fi

PREVIEW_BASE_ROOT="${GOOGLE_MANAGER_PREVIEW_BASE_ROOT:-/gm-preview}"
DEFAULT_BASE_PATH="$(resolve_base_path "$PREVIEW_NAME")"
DEFAULT_BACKEND_PORT="$(resolve_backend_port "$PREVIEW_NAME")"
DEFAULT_FRONTEND_PORT="$(resolve_frontend_port "$PREVIEW_NAME")"
DEFAULT_DATA_DIR="${HOME}/.local/share/google-manager/previews/${PREVIEW_NAME}"
DEFAULT_XDG_DATA_HOME="${HOME}/.local/share/google-manager-xdg/previews/${PREVIEW_NAME}"
DEFAULT_LOG_DIR="${XDG_RUNTIME_DIR:-/tmp}/google-manager/previews/${PREVIEW_NAME}"

export GOOGLE_MANAGER_PREVIEW_NAME="$PREVIEW_NAME"
export GOOGLE_MANAGER_ROOT_DIR="$TARGET_ROOT"
export GOOGLE_MANAGER_SERVICE_NAME="${GOOGLE_MANAGER_SERVICE_NAME:-Google Manager Preview [$PREVIEW_NAME]}"
export GOOGLE_MANAGER_FRONTEND_HOST="${GOOGLE_MANAGER_FRONTEND_HOST:-127.0.0.1}"
export GOOGLE_MANAGER_FRONTEND_PORT="${GOOGLE_MANAGER_FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}"
export GOOGLE_MANAGER_BACKEND_PORT="${GOOGLE_MANAGER_BACKEND_PORT:-$DEFAULT_BACKEND_PORT}"
export GOOGLE_MANAGER_BASE_PATH="${GOOGLE_MANAGER_BASE_PATH:-$DEFAULT_BASE_PATH}"
export VITE_API_URL="${VITE_API_URL:-${GOOGLE_MANAGER_BASE_PATH%/}/api}"
export GOOGLE_MANAGER_API_TARGET="${GOOGLE_MANAGER_API_TARGET:-http://127.0.0.1:${GOOGLE_MANAGER_BACKEND_PORT}}"
export GOOGLE_MANAGER_HMR_HOST="${GOOGLE_MANAGER_HMR_HOST:-hy.2oranges.cn}"
export GOOGLE_MANAGER_HMR_PROTOCOL="${GOOGLE_MANAGER_HMR_PROTOCOL:-wss}"
export GOOGLE_MANAGER_HMR_CLIENT_PORT="${GOOGLE_MANAGER_HMR_CLIENT_PORT:-443}"
export GOOGLE_MANAGER_HMR_PATH="${GOOGLE_MANAGER_HMR_PATH:-$GOOGLE_MANAGER_BASE_PATH}"
export GOOGLE_MANAGER_DATA_DIR="${GOOGLE_MANAGER_DATA_DIR:-$DEFAULT_DATA_DIR}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-$DEFAULT_XDG_DATA_HOME}"
export GOOGLE_MANAGER_LOG_DIR="${GOOGLE_MANAGER_LOG_DIR:-$DEFAULT_LOG_DIR}"

mkdir -p "$GOOGLE_MANAGER_DATA_DIR" "$XDG_DATA_HOME" "$GOOGLE_MANAGER_LOG_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 预览实例 ${PREVIEW_NAME}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 工作目录：$GOOGLE_MANAGER_ROOT_DIR"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 前端路径：$GOOGLE_MANAGER_BASE_PATH -> 127.0.0.1:${GOOGLE_MANAGER_FRONTEND_PORT}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 后端路径：${VITE_API_URL}/ -> 127.0.0.1:${GOOGLE_MANAGER_BACKEND_PORT}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 数据目录：$GOOGLE_MANAGER_DATA_DIR"

exec "$GOOGLE_MANAGER_ROOT_DIR/start-services.sh"
