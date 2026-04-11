#!/usr/bin/env bash

set -Eeuo pipefail
shopt -s nullglob

SERVICE_UNIT="${GOOGLE_MANAGER_SERVICE_UNIT:-local-services.service}"
DOMAIN="${GOOGLE_MANAGER_DOMAIN:-hdy.2oranges.cn}"
OUTPUT_ROOT="${1:-${GOOGLE_MANAGER_BACKUP_OUTPUT_ROOT:-$HOME/backups/google-manager}}"
WITH_CERTS="${GOOGLE_MANAGER_BACKUP_WITH_CERTS:-0}"
TIMESTAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
BUNDLE_DIR="${OUTPUT_ROOT%/}/hdy-prod-${TIMESTAMP}"
ARCHIVE_PATH="${BUNDLE_DIR}.tar.gz"

mkdir -p "$BUNDLE_DIR"/{db,config/systemd-user,config/google-manager,config/nginx,static,meta}

log() {
    printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_cmd() {
    local cmd="$1"
    command -v "$cmd" >/dev/null 2>&1 || {
        echo "缺少命令: $cmd" >&2
        exit 1
    }
}

copy_with_optional_sudo() {
    local source="$1"
    local target="$2"

    if sudo -n test -e "$source" 2>/dev/null; then
        sudo cp -a "$source" "$target"
        return 0
    fi

    cp -a "$source" "$target"
}

require_cmd curl
require_cmd jq
require_cmd tar
require_cmd sha256sum

SYSTEMD_ENV="$(systemctl --user show "$SERVICE_UNIT" --property=Environment --value)"

declare -A ENV_MAP=()
for item in $SYSTEMD_ENV; do
    key="${item%%=*}"
    value="${item#*=}"
    ENV_MAP["$key"]="$value"
done

ROOT_DIR="${ENV_MAP[GOOGLE_MANAGER_ROOT_DIR]:-$HOME/.psm/worktrees/Google_Manager/gmanager-svc-hdy-prod}"
BACKEND_PORT="${ENV_MAP[GOOGLE_MANAGER_BACKEND_PORT]:-3001}"
DATA_DIR="${ENV_MAP[GOOGLE_MANAGER_DATA_DIR]:-$HOME/.local/share/googlemanager}"
STATIC_ROOT="${ENV_MAP[GOOGLE_MANAGER_STATIC_DEPLOY_ROOT]:-/var/www/gmanager-hdy-prod}"
ADMIN_PASSWORD="${ENV_MAP[GOOGLE_MANAGER_ADMIN_PASSWORD]:-${GOOGLE_MANAGER_ADMIN_PASSWORD:-}}"

if [[ -z "$ADMIN_PASSWORD" ]]; then
    echo "未找到 GOOGLE_MANAGER_ADMIN_PASSWORD，无法调用官方备份 API" >&2
    exit 1
fi

log "登录正式服务并创建官方数据库备份"
LOGIN_JSON="$(
    timeout 10s curl -fsS \
        -H 'Content-Type: application/json' \
        -d "{\"password\":\"${ADMIN_PASSWORD}\"}" \
        "http://127.0.0.1:${BACKEND_PORT}/api/auth/login"
)"
TOKEN="$(printf '%s' "$LOGIN_JSON" | jq -r '.data.session_token // empty')"

if [[ -z "$TOKEN" ]]; then
    echo "登录成功但未取得 session token" >&2
    exit 1
fi

BACKUP_JSON="$(
    timeout 15s curl -fsS \
        -H "Authorization: Bearer ${TOKEN}" \
        -H 'Content-Type: application/json' \
        -d "{\"reason\":\"bundle_${TIMESTAMP}\"}" \
        "http://127.0.0.1:${BACKEND_PORT}/api/backups"
)"
BACKUP_PATH="$(printf '%s' "$BACKUP_JSON" | jq -r '.data // empty')"

if [[ -z "$BACKUP_PATH" || ! -f "$BACKUP_PATH" ]]; then
    echo "官方备份创建失败: $BACKUP_JSON" >&2
    exit 1
fi

BACKUP_MANIFEST="${BACKUP_PATH%.db}.json"
cp -a "$BACKUP_PATH" "$BUNDLE_DIR/db/"
[[ -f "$BACKUP_MANIFEST" ]] && cp -a "$BACKUP_MANIFEST" "$BUNDLE_DIR/db/"
[[ -f "$DATA_DIR/master.key" ]] && cp -a "$DATA_DIR/master.key" "$BUNDLE_DIR/db/"

log "备份配置与静态资源"
cp -a "$HOME/.config/systemd/user/local-services.service" "$BUNDLE_DIR/config/systemd-user/" 2>/dev/null || true
cp -a "$HOME/.config/systemd/user/gm-preview.service" "$BUNDLE_DIR/config/systemd-user/" 2>/dev/null || true
cp -a "$HOME/.config/systemd/user/local-services.service.d" "$BUNDLE_DIR/config/systemd-user/" 2>/dev/null || true
cp -a "$HOME/.config/google-manager/." "$BUNDLE_DIR/config/google-manager/" 2>/dev/null || true
copy_with_optional_sudo "/etc/nginx/sites-available/hdy.2oranges.cn" "$BUNDLE_DIR/config/nginx/"
copy_with_optional_sudo "/etc/nginx/sites-enabled/hdy.2oranges.cn" "$BUNDLE_DIR/config/nginx/" || true
copy_with_optional_sudo "$STATIC_ROOT" "$BUNDLE_DIR/static/"

if [[ "$WITH_CERTS" == "1" ]] && sudo -n test -d "/etc/letsencrypt/live/${DOMAIN}" 2>/dev/null; then
    mkdir -p "$BUNDLE_DIR/config/letsencrypt"
    copy_with_optional_sudo "/etc/letsencrypt/live/${DOMAIN}" "$BUNDLE_DIR/config/letsencrypt/"
    copy_with_optional_sudo "/etc/letsencrypt/archive/${DOMAIN}" "$BUNDLE_DIR/config/letsencrypt/"
    sudo chown -R "$(id -u):$(id -g)" "$BUNDLE_DIR/config/letsencrypt"
    chmod -R u+rwX "$BUNDLE_DIR/config/letsencrypt"
fi

log "写入元信息"
git -C "$ROOT_DIR" status --short --branch > "$BUNDLE_DIR/meta/git-status.txt"
git -C "$ROOT_DIR" rev-parse HEAD > "$BUNDLE_DIR/meta/git-head.txt"
git -C "$ROOT_DIR" branch --show-current > "$BUNDLE_DIR/meta/git-branch.txt"
git -C "$ROOT_DIR" remote -v > "$BUNDLE_DIR/meta/git-remote.txt"
systemctl --user cat "$SERVICE_UNIT" > "$BUNDLE_DIR/meta/systemd-cat.txt"
systemctl --user status "$SERVICE_UNIT" --no-pager -l > "$BUNDLE_DIR/meta/systemd-status.txt" || true
timeout 10s curl -I "https://${DOMAIN}/gm/" > "$BUNDLE_DIR/meta/frontend-health.txt" 2>&1 || true
timeout 10s curl "https://${DOMAIN}/gm/api/auth/check" > "$BUNDLE_DIR/meta/api-auth-check.json" 2>&1 || true
sudo -n nginx -T > "$BUNDLE_DIR/meta/nginx-T.txt" 2>/dev/null || true

jq -n \
    --arg timestamp "$TIMESTAMP" \
    --arg domain "$DOMAIN" \
    --arg service_unit "$SERVICE_UNIT" \
    --arg root_dir "$ROOT_DIR" \
    --arg data_dir "$DATA_DIR" \
    --arg static_root "$STATIC_ROOT" \
    --arg backup_path "$BACKUP_PATH" \
    --arg backup_sha "$(sha256sum "$BACKUP_PATH" | awk '{print $1}')" \
    --arg git_head "$(git -C "$ROOT_DIR" rev-parse HEAD)" \
    --arg git_branch "$(git -C "$ROOT_DIR" branch --show-current)" \
    '{
        timestamp: $timestamp,
        domain: $domain,
        service_unit: $service_unit,
        root_dir: $root_dir,
        data_dir: $data_dir,
        static_root: $static_root,
        official_backup_db: $backup_path,
        official_backup_sha256: $backup_sha,
        git_head: $git_head,
        git_branch: $git_branch
    }' > "$BUNDLE_DIR/meta/manifest.json"

log "打包压缩备份目录"
tar -C "$OUTPUT_ROOT" -czf "$ARCHIVE_PATH" "$(basename "$BUNDLE_DIR")"
sha256sum "$ARCHIVE_PATH" > "${ARCHIVE_PATH}.sha256"

log "备份完成"
printf 'DIR=%s\nARCHIVE=%s\nSHA256=%s\n' \
    "$BUNDLE_DIR" \
    "$ARCHIVE_PATH" \
    "${ARCHIVE_PATH}.sha256"
