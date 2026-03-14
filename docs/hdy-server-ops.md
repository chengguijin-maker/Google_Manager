# hdy 服务器运维基线

## 1. 汇总

| 编号 | 项目 | 当前值 |
|---|---|---|
| 1 | 服务器域名 | `hdy.2oranges.cn` |
| 2 | SSH 入口 | `ssh -p 33305 root@hdy.2oranges.cn` |
| 3 | 正式入口 | `https://hdy.2oranges.cn/gm/` |
| 4 | 预览入口 | `https://hdy.2oranges.cn/gm-preview/` |
| 5 | 正式后端本机端口 | `3001` |
| 6 | 正式静态目录 | `/var/www/gmanager-hdy-prod/gm/` |
| 7 | 预览前后端本机端口 | `4186 / 3916` |
| 8 | 防火墙放行 | `33305/tcp`、`80/tcp`、`443/tcp` |
| 9 | 防护组件 | `ufw` + `fail2ban` + `certbot.timer` |

## 2. 当前生效文件

- `Nginx` 站点：`/etc/nginx/sites-available/hdy.2oranges.cn`
- `SSH socket` 覆盖：`/etc/systemd/system/ssh.socket.d/override.conf`
- `Fail2ban` jail：`/etc/fail2ban/jail.d/sshd.local`
- 正式服务模板：`systemd/local-services.service`
- 远端正式服务覆盖：`~/.config/systemd/user/local-services.service.d/override.conf`
- 预览环境文件：`~/.config/google-manager/gm-preview.env`
- 正式静态目录：`/var/www/gmanager-hdy-prod/gm/`

## 3. 安全口径

- `SSH` 已切换到 `33305`
- `22/tcp` 已关闭新连接
- `ufw` 默认策略为 `deny incoming`
- `fail2ban` 已按 `33305` 监控 `sshd`

## 4. 快速核验命令

```bash
# 远端登录
ssh -p 33305 root@hdy.2oranges.cn

# 防火墙与防爆破
sudo ufw status verbose
sudo fail2ban-client status sshd

# 用户服务
systemctl --user status local-services.service --no-pager
systemctl --user status gm-preview.service --no-pager

# 外网入口
curl -I https://hdy.2oranges.cn/gm/
curl https://hdy.2oranges.cn/gm/api/auth/check
curl -I https://hdy.2oranges.cn/gm-preview/
curl https://hdy.2oranges.cn/gm-preview/api/auth/check
```

## 5. 说明

- 仓库中的 `hy.2oranges.cn` 旧配置已迁移为 `hdy.2oranges.cn`
- 后端仍保留对旧域名来源的兼容放行，避免历史浏览器缓存或旧入口立即失效
- 正式 `/gm/` 已改为 `Nginx` 直接托管静态产物，不再依赖 Vite dev server
- 对外统一走 `80/443`，不要直接暴露 `3001`、`5173`、`3916`、`4186`
