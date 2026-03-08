# Mobile UI/UX 修复验收清单（2026-03-08）

## 1. 汇总

| 编号 | 项目 | 状态 | 说明 |
|---|---|---|---|
| 1 | 默认每页 100 条对齐 | 已验证 | `AccountListView`、`usePagination`、`Pagination` 口径一致 |
| 2 | 搜索/筛选触发分页重置 | 已验证 | 已补列表页分页重置联动快测 |
| 3 | HTTP 导出字符串分支 | 已验证 | 已补浏览器下载分支快测 |
| 4 | 适配器环境检测 | 已验证 | 现有测试覆盖 `__TAURI__`/`__TAURI_INTERNALS__`/HTTP 强制分支 |
| 5 | Rust 导出排序/分组逻辑 | 已验证 | 桌面 feature 定向用例通过 |
| 6 | 分页 Hook / 组件独立快测 | 已验证 | 已补 `usePagination` 与 `Pagination` 独立快测 |
| 7 | 移动端窄屏/触屏体验 | 已验证 | 已补 `ExportDialog` 窄屏布局与操作快测，并完成移动端布局优化 |
| 8 | 文档口径统一 | 已完成 | README 已改为仅声明 Windows / Linux 发布支持 |

## 2. 本次确认范围

本次验收聚焦以下近期修复链路：

1. 默认分页条数统一为 `100`
2. 搜索/筛选/排序相关分页重置
3. 浏览器模式导出账号文本
4. Tauri v2 / HTTP 适配器检测
5. 导出排序、分组、模板配置
6. 分页 Hook 与分页组件边界逻辑
7. 导出弹窗窄屏布局与触发操作

## 3. 关键代码确认

| 编号 | 位置 | 结论 |
|---|---|---|
| 1 | `frontend/src/components/AccountListView.jsx` | 列表页使用 `usePagination(sortedAccounts, 100)` |
| 2 | `frontend/src/hooks/usePagination.js` | Hook 默认 `initialPageSize = 100` |
| 3 | `frontend/src/components/Pagination.jsx` | 每页选项为 `100 / 200 / 500` |
| 4 | `frontend/src/components/AccountListView.jsx` | 搜索、排序、筛选动作会调用 `pagination.resetPage()` |
| 5 | `frontend/src/components/AccountListView.jsx` | 导出账号支持 Tauri 返回对象与 HTTP 直接字符串两条分支 |
| 6 | `frontend/src/services/adapters/index.ts` | 适配器检测覆盖 `__TAURI__`、`__TAURI_INTERNALS__`、`?use_http=true`、`VITE_USE_HTTP=true` |
| 7 | `frontend/src/components/ExportDialog.jsx` | 窄屏下改为更友好的单列分隔符和纵向底部操作布局 |

## 4. 本次执行的验证

| 编号 | 命令 | 结果 |
|---|---|---|
| 1 | `cd frontend && pnpm test -- --run src/__tests__/ExportDialog.test.jsx src/__tests__/usePagination.test.js src/__tests__/Pagination.test.jsx src/__tests__/AccountListView.test.jsx src/__tests__/AccountListView.export.test.jsx` | 通过，`15` 个文件、`304` 个测试通过 |
| 2 | `cd frontend && pnpm build` | 通过 |
| 3 | `cd src-tauri && cargo test --no-default-features --features desktop test_export_query_uses_search_branch_when_account_ids_is_empty` | 通过 |
| 4 | `cd src-tauri && cargo test --no-default-features --features desktop test_export_output` | 通过 |

## 5. 已补的关键快测

| 编号 | 文件 | 覆盖点 |
|---|---|---|
| 1 | `frontend/src/__tests__/usePagination.test.js` | 默认 100 条、页码裁剪、修改页容量重置首页、数据缩小时自动回退 |
| 2 | `frontend/src/__tests__/Pagination.test.jsx` | 首页/上一页/下一页/末页禁用与触发、页码跳转、省略号显示、切换每页条数 |
| 3 | `frontend/src/__tests__/AccountListView.test.jsx` | 切到后续页后，搜索输入会把分页重置回第一页 |
| 4 | `frontend/src/__tests__/AccountListView.export.test.jsx` | HTTP 模式直接返回字符串时，触发浏览器 Blob 下载 |
| 5 | `frontend/src/__tests__/ExportDialog.test.jsx` | 窄屏滚动容器、单列布局、底部操作区、关闭与自定义导出操作 |

## 6. 当前状态

### 已完成收尾

1. 窄屏导出弹窗布局已优化，并完成组件级窄屏快测。
2. README 平台口径已统一为当前公开发布仅支持 Windows / Linux。

### 可选增强项

1. 如需更强证明力，可补一条真实浏览器小屏宽度下的 E2E 回归。
2. 如需对外发布验收结果，可将本文或其摘要同步到最终发布说明中。

## 7. 结论

### 7.1 已完成部分

1. 当前代码层面的修复已经基本闭环。
2. 分页默认值、分页重置、分页 Hook/组件、HTTP 导出、适配器检测、Rust 导出逻辑都已拿到有效验证。
3. 作为“代码修复是否完成”的回答，可以判定为 **基本完成并可交付**。

### 7.2 尚未完全闭环部分

1. 当前代码、快测与文档收尾已经闭环。
2. 如需更高置信度，建议补真实浏览器小屏 E2E，但这属于增强项而非本轮阻塞项。

### 7.3 当前建议口径

- 对外可表述为：**本轮修复已完成主要功能与关键回归验证。**
- 不建议表述为：**所有相关任务 100% 全部完成。**
