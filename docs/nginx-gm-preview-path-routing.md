# Google Manager 固定开发预览路径方案

## 1. 汇总

| 编号 | 项目 | 建议值 |
|---|---|---|
| 1 | 正式入口 | `https://hy.2oranges.cn/gm/` 固定指向 `master` |
| 2 | 开发预览入口 | `https://hy.2oranges.cn/gm-preview/` |
| 3 | 预览前端 / 后端端口 | `4186 / 3916` |
| 4 | 启动方式 | `systemd --user` 服务 `gm-preview.service` |
| 5 | 数据目录 | `~/.local/share/google-manager/previews/preview` |

## 2. 目标

1. 正式 `/gm/` 长期稳定，不因 feature 分支验收频繁切换。
2. 所有开发版统一复用一个固定入口 `/gm-preview/`。
3. 切换预览 worktree 时，只改环境文件并重启服务。
4. 预览实例拥有独立数据库、主密钥、日志目录，避免误伤正式数据。

## 3. 目录与服务约定

- 用户服务文件：`systemd/gm-preview.service`
- 预览启动脚本：`start-preview.sh`
- 安装脚本路径：`~/.local/bin/gm-start-preview.sh`
- 环境文件：`~/.config/google-manager/gm-preview.env`

## 4. 环境文件示例

```ini
GOOGLE_MANAGER_ROOT_DIR=/home/eric/.psm/worktrees/Google_Manager/multiline-tags-remarks-editor
GOOGLE_MANAGER_FRONTEND_PORT=4186
GOOGLE_MANAGER_BACKEND_PORT=3916
GOOGLE_MANAGER_BASE_PATH=/gm-preview/
VITE_API_URL=/gm-preview/api
GOOGLE_MANAGER_DATA_DIR=/home/eric/.local/share/google-manager/previews/preview
XDG_DATA_HOME=/home/eric/.local/share/google-manager-xdg/previews/preview
GOOGLE_MANAGER_LOG_DIR=/run/user/1000/google-manager/previews/preview
GOOGLE_MANAGER_FRONTEND_HOST=127.0.0.1
GOOGLE_MANAGER_ADMIN_PASSWORD=admin123
```

## 5. systemd 使用方式

```bash
mkdir -p ~/.local/bin ~/.config/systemd/user ~/.config/google-manager
install -m 0755 start-preview.sh ~/.local/bin/gm-start-preview.sh
install -m 0644 systemd/gm-preview.service ~/.config/systemd/user/gm-preview.service
systemctl --user daemon-reload
systemctl --user enable --now gm-preview.service

# 切换到新的 worktree 后重启
systemctl --user restart gm-preview.service

# 查看状态
systemctl --user status gm-preview.service --no-pager -l
journalctl --user -u gm-preview.service -f
```

## 6. Nginx path 路由示例

```nginx
location /gm-preview/api/ {
    proxy_pass http://127.0.0.1:3916/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}

location /gm-preview/ {
    proxy_pass http://127.0.0.1:4186;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

## 7. 验证命令

```bash
# 本机
curl http://127.0.0.1:4186/gm-preview/ | head
curl http://127.0.0.1:3916/api/auth/check

# 外网
curl https://hy.2oranges.cn/gm-preview/ -k | head
curl https://hy.2oranges.cn/gm-preview/api/auth/check -k
```

## 8. 注意事项

1. 切换 worktree 只改 `GOOGLE_MANAGER_ROOT_DIR`，不要改正式 `/gm/` 服务。
2. `GOOGLE_MANAGER_DATA_DIR` 与 `XDG_DATA_HOME` 必须和正式环境隔离。
3. 如果某个 worktree 尚未编译出后端二进制，需要先执行：`cd <worktree>/src-tauri && cargo build --no-default-features --features test-server`。
