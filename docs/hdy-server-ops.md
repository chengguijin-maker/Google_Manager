# hdy 服务器运维基线

## 1. 汇总

| 编号 | 项目 | 当前值 |
|---|---|---|
| 1 | 服务器域名 | `hdy.2oranges.cn` |
| 2 | SSH 入口 | `ssh -p 33305 root@hdy.2oranges.cn` |
| 3 | 正式入口 | `https://hdy.2oranges.cn/gm/` |
| 4 | 预览入口 | `https://hdy.2oranges.cn/gm-preview/` |
| 5 | 正式服务分支 / worktree | `svc/gmanager-hdy-prod` / `~/.psm/worktrees/Google_Manager/gmanager-svc-hdy-prod` |
| 6 | 当前预览分支 / worktree | `master` / `~/.psm/worktrees/Google_Manager/gmanager-master` |
| 7 | 正式后端本机端口 | `3001` |
| 8 | 正式静态目录 | `/var/www/gmanager-hdy-prod/gm/` |
| 9 | 预览前后端本机端口 | `4186 / 3916` |
| 10 | 防火墙放行 | `33305/tcp`、`80/tcp`、`443/tcp` |
| 11 | 防护组件 | `ufw` + `fail2ban` + `certbot.timer` |
| 12 | 迁移状态（2026-03-14） | 已完成“正式服务迁移到 service worktree + `/gm/` 静态托管” |

## 2. 当前生效文件与目录

- `Nginx` 站点：`/etc/nginx/sites-available/hdy.2oranges.cn`
- `SSH socket` 覆盖：`/etc/systemd/system/ssh.socket.d/override.conf`
- `Fail2ban` jail：`/etc/fail2ban/jail.d/sshd.local`
- 正式服务模板：`systemd/local-services.service`
- 正式用户服务文件：`~/.config/systemd/user/local-services.service`
- 预览服务模板：`systemd/gm-preview.service`
- 预览环境文件：`~/.config/google-manager/gm-preview.env`
- 正式静态目录：`/var/www/gmanager-hdy-prod/gm/`
- 正式服务 worktree：`~/.psm/worktrees/Google_Manager/gmanager-svc-hdy-prod`
- 当前预览 worktree：`~/.psm/worktrees/Google_Manager/gmanager-master`

## 3. 服务 / worktree 角色

| 角色 | 分支 | worktree | 作用 |
|---|---|---|---|
| 主干集成 | `master` | `~/.psm/worktrees/Google_Manager/gmanager-master` | 主干开发与默认预览，不直接承接正式流量 |
| 正式服务 | `svc/gmanager-hdy-prod` | `~/.psm/worktrees/Google_Manager/gmanager-svc-hdy-prod` | 对外提供 `https://hdy.2oranges.cn/gm/` |
| 功能开发 | `feat/gmanager-*` | `~/.psm/worktrees/Google_Manager/gmanager-feat-*` | 通过 `/gm-preview/` 做验收 |
| 运维锚点 | `ops/gmanager-hdy-baseline-20260314` | `/home/eric/code/Google_Manager` | 保留运维基线，避免误操作 |

> 当前约定：不再单独维护预览分支；如需预览某个功能分支，只改 `~/.config/google-manager/gm-preview.env` 中的 `GOOGLE_MANAGER_ROOT_DIR`，然后重启 `gm-preview.service`。

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

# 端口
ss -ltnp | rg ":(3001|3916|4186|5173)\b" || true

# 外网入口
curl -I https://hdy.2oranges.cn/gm/
curl https://hdy.2oranges.cn/gm/api/auth/check
curl -I https://hdy.2oranges.cn/gm-preview/
curl https://hdy.2oranges.cn/gm-preview/api/auth/check
```

## 5. 截至 2026-03-14 的已验证结论

- 正式 `/gm/` 已改为 `Nginx` 直接托管静态产物，不再依赖 Vite dev server
- `local-services.service` 当前从 `gmanager-svc-hdy-prod` worktree 启动
- 正式后端监听 `3001`，预览前后端监听 `4186 / 3916`，正式环境不再常驻 `5173`
- 预览 `/gm-preview/` 仍保留 Vite/HMR，便于开发验收
- 手机上“登录后切换应用再回来会整页重载”的主因已移除；根因是正式环境此前跑了 Vite dev server/HMR

## 6. 安全口径

- `SSH` 已切换到 `33305`
- `22/tcp` 已关闭新连接
- `ufw` 默认策略为 `deny incoming`
- `fail2ban` 已按 `33305` 监控 `sshd`
- 对外统一走 `80/443`，不要直接暴露 `3001`、`5173`、`3916`、`4186`

## 7. 相关文档

- 路由与正式静态托管：`docs/nginx-https-gm-routing.md`
- 固定预览入口：`docs/nginx-gm-preview-path-routing.md`
- worktree / 发布策略：`docs/gmanager-worktree-runtime-layout.md`

## 8. 注意事项

- 仓库中的 `hy.2oranges.cn` 旧配置已迁移为 `hdy.2oranges.cn`
- 后端仍保留对旧域名来源的兼容放行，避免历史浏览器缓存或旧入口立即失效
- `curl -I https://hdy.2oranges.cn/gm/api/auth/check` 可能得到 `404`，因为后端未实现 `HEAD`；请使用 `GET` 验证
