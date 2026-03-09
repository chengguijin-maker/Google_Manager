# Google Manager 443 路径反代方案

## 1. 汇总

| 编号 | 项目 | 当前值 |
|---|---|---|
| 1 | 外网入口域名 | `hy.2oranges.cn` |
| 2 | 外网访问地址 | `https://hy.2oranges.cn/gm/` |
| 3 | 前端本机地址 | `http://127.0.0.1:5173/gm/` |
| 4 | 后端本机地址 | `http://127.0.0.1:3001` |
| 5 | API 外网地址 | `https://hy.2oranges.cn/gm/api/` |
| 6 | 用户服务 | `local-services.service` |

## 2. 路由设计

- `http://hy.2oranges.cn/`：重定向到 `https://hy.2oranges.cn/`
- `https://hy.2oranges.cn/`：重定向到 `https://hy.2oranges.cn/gm/`
- `https://hy.2oranges.cn/gm/`：反代到本机前端 `5173`
- `https://hy.2oranges.cn/gm/api/`：反代到本机后端 `3001/api/`
- `https://hy.2oranges.cn/webdav/`：保留原有 WebDAV 转发

## 3. Nginx 线上配置

线上生效文件：`/etc/nginx/sites-available/hy.2oranges.cn`

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name hy.2oranges.cn;

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
    server_name hy.2oranges.cn;

    ssl_certificate     /etc/letsencrypt/live/hy.2oranges.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hy.2oranges.cn/privkey.pem;

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

    location = /webdav {
        return 301 /webdav/;
    }

    location /webdav/ {
        proxy_pass http://127.0.0.1:6065;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        client_max_body_size 0;
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

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /gm/ {
        proxy_pass http://127.0.0.1:5173;
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
Environment=GOOGLE_MANAGER_BASE_PATH=/gm/
Environment=VITE_API_URL=/gm/api
Environment=GOOGLE_MANAGER_HMR_HOST=hy.2oranges.cn
Environment=GOOGLE_MANAGER_HMR_PROTOCOL=wss
Environment=GOOGLE_MANAGER_HMR_CLIENT_PORT=443
Environment=GOOGLE_MANAGER_HMR_PATH=/gm/
```

### 4.2 前端 Vite

- 基路径：`/gm/`
- HMR 路径：`/gm/`
- API 同源路径：`/gm/api`

对应文件：`frontend/vite.config.js`

### 4.3 启动脚本

聚合启动脚本：`start-services.sh`

职责：
- 拉起 Rust HTTP 后端 `3001`
- 拉起 Vite 前端 `5173`
- 注入 `/gm/` 基路径和 `/gm/api` API 路径
- 启动后做端口与 HTTP 健康检查

## 5. 验证命令

```bash
# systemd 用户服务
systemctl --user status local-services.service
journalctl --user -u local-services.service -f

# Nginx 检查与重载
sudo nginx -t
sudo systemctl reload nginx

# 本机验证
curl -I http://127.0.0.1:5173/
curl http://127.0.0.1:5173/gm/ | head
curl https://hy.2oranges.cn/gm/ -k | head
curl https://hy.2oranges.cn/gm/api/auth/check -k
```

## 6. 当前验证结果

- `https://hy.2oranges.cn/gm/`：`200`
- `https://hy.2oranges.cn/gm/api/auth/check`：`200`
- `http://hy.2oranges.cn/`：`301 -> https://hy.2oranges.cn/`
- `https://hy.2oranges.cn/`：`302 -> /gm/`

## 7. 注意事项

- 多 worktree path 预览方案见：`docs/nginx-gm-preview-path-routing.md`。


- `5173`、`3001` 当前只放行给 `172.0.0.0/8`，不建议直接作为公网入口。
- 公网应统一走 `80/443`，由 Nginx 路径反代转发。
- `curl -I https://hy.2oranges.cn/gm/api/auth/check` 可能得到 `404`，因为后端未实现 `HEAD`；请使用 `GET` 验证。
