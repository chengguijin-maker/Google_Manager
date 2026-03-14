# Google Manager worktree 与运行位基线

## 1. 汇总

| 编号 | 项目 | 当前约定（截至 2026-03-14） |
|---|---|---|
| 1 | 主干分支 / worktree | `master` / `~/.psm/worktrees/Google_Manager/gmanager-master` |
| 2 | 正式服务分支 / worktree | `svc/gmanager-hdy-prod` / `~/.psm/worktrees/Google_Manager/gmanager-svc-hdy-prod` |
| 3 | 运维锚点分支 / 目录 | `ops/gmanager-hdy-baseline-20260314` / `/home/eric/code/Google_Manager` |
| 4 | 开发分支命名 | `feat/gmanager-*` |
| 5 | 开发 worktree 命名 | `gmanager-feat-*` |
| 6 | 正式入口 | `https://hdy.2oranges.cn/gm/` |
| 7 | 固定预览入口 | `https://hdy.2oranges.cn/gm-preview/` |
| 8 | 预览分支策略 | 不单独维护预览分支，所有开发分支共用 `/gm-preview/` |

## 2. 当前已验证状态

截至 `2026-03-14` 已确认：

- 正式服务已经迁移到专用 service worktree：`gmanager-svc-hdy-prod`
- `master` 不再直接承接正式流量，只承担主干集成与默认预览角色
- 正式 `/gm/` 已从 Vite dev server/HMR 切换为静态托管
- 预览 `/gm-preview/` 仍保留 dev/HMR，用于功能验收
- 手机上“切后台回来整页重新载入”的主因已移除；此前根因是正式环境跑了 Vite dev server/HMR

## 3. 角色分工

| 角色 | 分支 | worktree | 说明 |
|---|---|---|---|
| 主干集成 | `master` | `gmanager-master` | 合并主线、保留最新可继续开发基线 |
| 正式服务 | `svc/gmanager-hdy-prod` | `gmanager-svc-hdy-prod` | 对外正式服务，只承接稳定已发布内容 |
| 功能开发 | `feat/gmanager-*` | `gmanager-feat-*` | 每个功能单独 worktree，统一走 `/gm-preview/` 预览 |
| 运维锚点 | `ops/gmanager-hdy-baseline-20260314` | `/home/eric/code/Google_Manager` | 保留运维基线与回退锚点 |

## 4. 命名约定

- 主干 worktree：`gmanager-master`
- 正式服务 worktree：`gmanager-svc-<env>`
- 功能 worktree：`gmanager-feat-<topic>`
- 运维基线分支：`ops/gmanager-<purpose>-<date>`

这样做的目标是：
- 一眼区分主干、正式、功能与运维锚点
- 避免 worktree 名称与业务无关，后续找不到
- 方便 systemd、Nginx、脚本与人工排障统一定位

## 5. 标准发布 / 同步流程

1. 从 `master` 拉出新的功能分支与 `gmanager-feat-*` worktree
2. 需要外网验收时，把 `gm-preview.service` 指向该功能 worktree
3. 功能完成后合并回 `master`
4. 准备发布时，把 `master` 合到 `svc/gmanager-hdy-prod`
5. `local-services.service` 从 `gmanager-svc-hdy-prod` 启动，并发布正式 `/gm/`

## 6. 常用命令

### 6.1 新建功能 worktree

```bash
cd ~/.psm/worktrees/Google_Manager/gmanager-master
git worktree add ~/.psm/worktrees/Google_Manager/gmanager-feat-example -b feat/gmanager-example master
```

### 6.2 切换固定预览到某个功能分支

```bash
sed -i 's#^GOOGLE_MANAGER_ROOT_DIR=.*#GOOGLE_MANAGER_ROOT_DIR=/home/eric/.psm/worktrees/Google_Manager/gmanager-feat-example#' ~/.config/google-manager/gm-preview.env
systemctl --user restart gm-preview.service
```

### 6.3 把主干同步到正式服务分支

```bash
cd ~/.psm/worktrees/Google_Manager/gmanager-svc-hdy-prod
git merge --no-ff master
git push origin svc/gmanager-hdy-prod
```

## 7. 注意事项

1. `master` 不再直接跑正式服务
2. 不单独维护预览分支，避免多一条长期分叉线
3. 正式与预览必须继续隔离数据目录、日志目录和运行入口
4. 正式 `/gm/` 必须继续保持静态托管，不要回退到 dev server/HMR

## 8. 相关文档

- 正式路由与静态托管：`docs/nginx-https-gm-routing.md`
- 固定预览入口：`docs/nginx-gm-preview-path-routing.md`
- hdy 服务器运维基线：`docs/hdy-server-ops.md`
