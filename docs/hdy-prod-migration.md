# hdy 正式服务备份与迁移

## 1. 汇总

| 编号 | 项目 | 说明 |
|---|---|---|
| 1 | 代码分支 | `svc/gmanager-hdy-prod` |
| 2 | 正式入口 | `https://hdy.2oranges.cn/gm/` |
| 3 | 数据目录 | `GOOGLE_MANAGER_DATA_DIR`，未设置时默认 `~/.local/share/googlemanager/` |
| 4 | 主密钥 | `<data_dir>/master.key` 或环境变量 `GOOGLE_MANAGER_MASTER_KEY` |
| 5 | 正式静态目录 | `/var/www/gmanager-hdy-prod/gm/` |
| 6 | 官方备份入口 | `POST /api/backups` |

## 2. 先做什么

1. 在源机器进入正式服务 worktree：

```bash
cd ~/.psm/worktrees/Google_Manager/gmanager-svc-hdy-prod
```

2. 生成完整备份包：

```bash
GOOGLE_MANAGER_BACKUP_WITH_CERTS=1 ./scripts/backup-hdy-prod.sh
```

3. 备份包默认输出到：

```bash
~/backups/google-manager/hdy-prod-<timestamp>/
~/backups/google-manager/hdy-prod-<timestamp>.tar.gz
~/backups/google-manager/hdy-prod-<timestamp>.tar.gz.sha256
```

## 3. 备份包包含什么

| 编号 | 路径 | 作用 |
|---|---|---|
| 1 | `db/*.db` | 通过正式服务 API 创建的官方 SQLite 快照 |
| 2 | `db/master.key` | 解密密钥，缺失会导致加密字段不可读 |
| 3 | `config/systemd-user/` | 当前用户服务文件与 override |
| 4 | `config/google-manager/` | 当前用户级环境文件 |
| 5 | `config/nginx/` | 线上 Nginx 配置 |
| 6 | `config/letsencrypt/` | 可选，同域名迁移时可一起带走 |
| 7 | `static/` | 正式静态站点目录 |
| 8 | `meta/` | Git 提交、服务状态、健康检查和清单 |

## 4. 目标机器恢复步骤

1. 准备代码

```bash
git clone https://github.com/chengguijin-maker/Google_Manager.git
cd Google_Manager
git checkout svc/gmanager-hdy-prod
```

2. 准备运行时

```bash
corepack enable
pnpm install
cd frontend && pnpm install && cd ..
cd src-tauri && cargo build --no-default-features --features test-server && cd ..
```

3. 恢复数据目录

```bash
mkdir -p /srv/google-manager/data
cp bundle/db/*.db /srv/google-manager/data/data.db
cp bundle/db/master.key /srv/google-manager/data/master.key
chmod 600 /srv/google-manager/data/master.key
```

4. 安装正式服务模板

```bash
mkdir -p ~/.config/systemd/user ~/.config/google-manager
install -m 0644 systemd/local-services.service ~/.config/systemd/user/local-services.service
install -m 0644 systemd/gm-prod.env.example ~/.config/google-manager/gm-prod.env
```

5. 修改 `~/.config/google-manager/gm-prod.env`

- 把 `GOOGLE_MANAGER_ROOT_DIR` 改成目标机器上的仓库路径。
- 把 `GOOGLE_MANAGER_ADMIN_PASSWORD` 改成实际密码。
- 把 `GOOGLE_MANAGER_DATA_DIR` 改成恢复后的数据目录。
- 把 `GOOGLE_MANAGER_FRONTEND_HEALTHCHECK_URL` 改成目标域名，如 `https://example.com/gm/`。

6. 部署 Nginx

- 参考 `bundle/config/nginx/hdy.2oranges.cn` 或 `docs/nginx-https-gm-routing.md`。
- 若迁移同域名并且已经随包带出证书，可恢复 `config/letsencrypt/`；否则在目标机重新签发证书。

7. 启动服务

```bash
systemctl --user daemon-reload
systemctl --user enable --now local-services.service
systemctl --user status local-services.service --no-pager -l
```

## 5. 最小验证

```bash
curl -I https://example.com/gm/
curl https://example.com/gm/api/auth/check
systemctl --user status local-services.service --no-pager -l
journalctl --user -u local-services.service -n 100 --no-pager
```

## 6. 风险提醒

1. `master.key` 丢失时，数据库里加密字段不可恢复。
2. 当前正式方案会在启动时重新构建 `/gm/` 静态资源，所以目标机仍需要 `pnpm`、前端依赖和后端二进制。
3. 若你只想离线迁走当前可运行版本，也可以把 `static/` 与 `src-tauri/target/debug/google-manager` 一起复制，但长期仍建议保留完整仓库。
