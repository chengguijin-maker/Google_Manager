# Google Manager 443 路径反代方案

## 1. 汇总

| 编号 | 项目 | 当前值 |
|---|---|---|
| 1 | 外网入口域名 | `hdy.2oranges.cn` |
| 2 | 外网访问地址 | `https://hdy.2oranges.cn/gm/` |
| 3 | 正式静态目录 | `/var/www/gmanager-hdy-prod/gm/` |
| 4 | 后端本机地址 | `http://127.0.0.1:3001` |
| 5 | API 外网地址 | `https://hdy.2oranges.cn/gm/api/` |
| 6 | 用户服务 | `local-services.service` |

## 2. 路由设计

- `http://hdy.2oranges.cn/`：重定向到 `https://hdy.2oranges.cn/`
- `https://hdy.2oranges.cn/`：重定向到 `https://hdy.2oranges.cn/gm/`
- `https://hdy.2oranges.cn/gm/`：由 `Nginx` 直接托管正式静态站点
- `https://hdy.2oranges.cn/gm/api/`：反代到本机后端 `3001/api/`
- `https://hdy.2oranges.cn/gm-preview/`：反代到本机预览前端 `4186`
- `https://hdy.2oranges.cn/gm-preview/api/`：反代到本机预览后端 `3916/api/`

## 3. Nginx 线上配置

线上生效文件：`/etc/nginx/sites-available/hdy.2oranges.cn`

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name hdy.2oranges.cn;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type text/plain;
        allow all;
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name hdy.2oranges.cn;

    ssl_certificate     /etc/letsencrypt/live/hdy.2oranges.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hdy.2oranges.cn/privkey.pem;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type text/plain;
        allow all;
        try_files $uri =404;
    }

    location = / {
        return 302 /gm/;
    }

    location = /gm {
        return 302 /gm/;
    }

    location /gm/api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /gm/assets/ {
        root /var/www/gmanager-hdy-prod;
        access_log off;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location /gm/ {
        root /var/www/gmanager-hdy-prod;
        try_files $uri $uri/ /gm/index.html;
        add_header Cache-Control "no-cache" always;
    }

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
}
```

## 4. 项目侧配套

### 4.1 `systemd --user`

用户服务文件：`systemd/local-services.service`

关键环境变量：

```ini
Environment=GOOGLE_MANAGER_ROOT_DIR=%h/.psm/worktrees/Google_Manager/gmanager-svc-hdy-prod
Environment=GOOGLE_MANAGER_BASE_PATH=/gm/
Environment=VITE_API_URL=/gm/api
Environment=GOOGLE_MANAGER_FRONTEND_MODE=static
Environment=GOOGLE_MANAGER_FRONTEND_BUILD_DIR=%t/google-manager/build/gm
Environment=GOOGLE_MANAGER_STATIC_DEPLOY_ROOT=/var/www/gmanager-hdy-prod
Environment=GOOGLE_MANAGER_FRONTEND_HEALTHCHECK_URL=https://hdy.2oranges.cn/gm/
```

### 4.2 前端 Vite

- 基路径：`/gm/`
- API 同源路径：`/gm/api`

对应文件：`frontend/vite.config.js`

### 4.3 启动脚本

聚合启动脚本：`start-services.sh`

职责：
- 拉起 Rust HTTP 后端 `3001`
- 构建 `/gm/` 对应的正式静态产物
- 同步静态资源到 `/var/www/gmanager-hdy-prod/gm/`
- 启动后做后端端口健康检查

## 5. 验证命令

```bash
# systemd 用户服务
systemctl --user status local-services.service
journalctl --user -u local-services.service -f

# Nginx 检查与重载
sudo nginx -t
sudo systemctl reload nginx

# 本机验证
ls -la /var/www/gmanager-hdy-prod/gm/
curl -H 'Host: hdy.2oranges.cn' http://127.0.0.1/gm/ | head
curl https://hdy.2oranges.cn/gm/ -k | head
curl https://hdy.2oranges.cn/gm/api/auth/check -k
```

## 6. 当前验证结果

- `https://hdy.2oranges.cn/gm/`：`200`
- `https://hdy.2oranges.cn/gm/api/auth/check`：`200`
- `https://hdy.2oranges.cn/gm-preview/`：`200`
- `https://hdy.2oranges.cn/gm-preview/api/auth/check`：`200`
- `http://hdy.2oranges.cn/`：`301 -> https://hdy.2oranges.cn/`
- `https://hdy.2oranges.cn/`：`302 -> /gm/`

## 7. 注意事项

- 多 worktree path 预览方案见：`docs/nginx-gm-preview-path-routing.md`。


- 当前对公网放行的是 `33305`、`80`、`443`；`3001`、`3916`、`4186` 不直接作为公网入口。
- 公网应统一走 `80/443`，由 Nginx 路径反代转发。
- `curl -I https://hdy.2oranges.cn/gm/api/auth/check` 可能得到 `404`，因为后端未实现 `HEAD`；请使用 `GET` 验证。
