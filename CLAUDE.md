# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Snapshot

Google Manager 已从 Flask/Python 迁移到 **Tauri + Rust + React** 桌面架构。

- 代码与运行逻辑以 `src-tauri/` + `frontend/` 为准
- `README.md` 仍包含旧 Flask 启动说明，**不要按 README 的 Python 命令执行**

## Common Commands

### Install

```bash
make install
```

### Development

```bash
# 桌面开发模式（Tauri GUI）
make dev

# HTTP 测试服务器（不编译 GUI 依赖，默认 3001）
make test-server

# 前端开发服务器（连接 HTTP 测试服务器）
pnpm run dev:test
# 等价：cd frontend && VITE_USE_HTTP=true pnpm dev
```

### Build

```bash
# 构建前端到根目录 static/
make build

# Tauri 桌面应用生产构建
cd src-tauri && cargo tauri build
```

### Checks / Lint

```bash
# Rust 快速编译检查（桌面模式）
make rust-check

# Rust 编译检查（test-server feature）
make rust-check-test-server
```

说明：仓库当前未配置 `eslint`/`prettier` 脚本；日常以 Rust compile check + 单元测试作为主要质量门禁。

### Tests

```bash
# 推荐：前端 + Rust 并行单测
make test
# 等价：pnpm run test:parallel:acceptance

# 仅前端单测
pnpm run test:unit
# 等价：cd frontend && pnpm test -- --run

# 仅 Rust 单测（桌面默认 feature）
pnpm run test:rust
# 等价：cd src-tauri && cargo test

# Rust 单测（test-server feature）
pnpm run test:rust:test-server

# 单个前端测试文件
cd frontend && pnpm test -- --run src/__tests__/ImportParser.test.js

# 单个 Rust 测试
cd src-tauri && cargo test test_name

# 前端测试覆盖率
cd frontend && pnpm run test:coverage
```

## High-Level Architecture

```text
React UI (frontend/src)
  -> services/api.js (Facade)
  -> services/adapters/index.ts (Factory)
      -> TauriAdapter (@tauri-apps/api invoke)
      -> HttpAdapter (fetch /api/*)
  -> Rust entry points (commands.rs / http_server.rs)
  -> database.rs (single source of truth for business + SQLite)
```

核心思想：

- 前端只依赖 `services/api.js`，不直接调用 Tauri/HTTP
- `commands.rs` 与 `http_server.rs` 都是薄包装，业务逻辑集中在 `database.rs`
- 双后端（Tauri invoke / HTTP）通过 adapter 统一，便于测试与桌面发布复用

## Frontend Structure & Flow

### Key files

- `frontend/src/App.jsx`：应用入口与视图切换
- `frontend/src/components/AccountListView.jsx`：列表主流程（筛选、操作、导出等）
- `frontend/src/components/ImportView.jsx`：导入与解析交互
- `frontend/src/services/api.js`：统一 API 门面
- `frontend/src/services/adapters/index.ts`：运行时适配器选择
- `frontend/src/services/adapters/tauri-adapter.ts`：Tauri invoke 实现
- `frontend/src/services/adapters/http-adapter.ts`：HTTP 实现

### Adapter selection rules

`frontend/src/services/adapters/index.ts` 的决策顺序：

1. URL 参数 `?use_http=true` 或 `VITE_USE_HTTP=true` -> `HttpAdapter`
2. 否则若存在 `window.__TAURI__` -> `TauriAdapter`
3. 否则 -> `HttpAdapter`

### Important behavior

- 前端内部字段使用 camelCase，后端为 snake_case；由 `frontend/src/services/utils.ts` 在适配器层统一转换
- 后端 `update_account` 要求完整 `AccountInput`，两个 adapter 都会先取当前账号再合并局部更新
- `HttpAdapter` 不支持 `exportDatabaseSql`/`exportAccountsText`（仅桌面模式支持）
- 导入解析逻辑在 `frontend/src/utils/importParser.js`，支持普通分隔格式和 `卡号:...密码:...` 特殊格式，并支持从 `2fa.live` URL 提取密钥

## Rust Backend Structure & Runtime

### Runtime entry

- `src-tauri/src/main.rs`：按 feature + CLI 参数决定启动模式
- `src-tauri/src/lib.rs`：
  - `run()`：桌面 Tauri 模式，注册全部 `#[tauri::command]`
  - `run_http_server(port)`：HTTP 测试服务器模式

### Core modules

- `src-tauri/src/database.rs`：数据库连接、迁移、查询、导入导出、软删除、回收站、备份
- `src-tauri/src/commands.rs`：Tauri command 薄包装层
- `src-tauri/src/http_server.rs`：actix-web 路由薄包装层
- `src-tauri/src/auth.rs`：认证与会话
- `src-tauri/src/crypto.rs`：AES-256-GCM 加解密
- `src-tauri/src/key_manager.rs`：主密钥加载/生成
- `src-tauri/src/totp.rs`：TOTP 生成

### Cargo features

`src-tauri/Cargo.toml`：

- `default = ["desktop"]`
- `desktop`：Tauri GUI 依赖
- `test-server`：actix-web 依赖

修改 `http_server.rs` 或 HTTP 路由后，务必运行 `make rust-check-test-server`。

## Data, Auth, and Security Model

### SQLite & soft delete

- 主表：`accounts`
- 历史表：`account_history`
- 软删除字段：`deleted_at`
  - 活跃数据：`deleted_at IS NULL`
  - 回收站：`deleted_at IS NOT NULL`

### Status values

- `status`: `"pro" | "inactive"`
- `sold_status`: `"sold" | "unsold"`

### Local data paths

- 数据目录：`dirs::data_dir()/googlemanager/`
- 主数据库：`data.db`
- 备份目录：`backups/`
- 主密钥文件：`master.key`

### Auth model

- 登录密码来自环境变量：`GOOGLE_MANAGER_ADMIN_PASSWORD`
- 认证状态为进程内内存态（重启会丢失 session）
- 连续 3 次失败封禁 24 小时
- session TTL 为 7 天
- token 存储键：前端 `localStorage` 中的 `gm_session_token`

### Encryption model

- `password` 与 `secret` 在数据库中使用 AES-256-GCM 加密存储
- 主密钥来源：
  - 优先环境变量 `GOOGLE_MANAGER_MASTER_KEY`（32 字节，hex 或 base64）
  - 否则从本地 `master.key` 读取/首次生成

### Environment variables

```bash
# 管理员登录密码（必需）
export GOOGLE_MANAGER_ADMIN_PASSWORD="your_admin_password"

# 数据库加密主密钥（可选，不设置则自动生成到 master.key）
export GOOGLE_MANAGER_MASTER_KEY="your_32_byte_hex_or_base64_key"
```

## Testing Notes

- 前端测试：Vitest + jsdom，配置见 `frontend/vitest.config.js`
- 测试初始化与 Tauri mock：`frontend/src/__tests__/setup.js`
- E2E 文档：`e2e/chrome-devtools-test-plan.md`

E2E 本地启动顺序：

1. `make test-server`
2. `pnpm run dev:test`
3. 使用 Chrome DevTools MCP 访问 `http://127.0.0.1:5173`

## Development Workflows

### Add a new database field

1. 在 `database.rs::init_database()` 增加迁移（`ALTER TABLE ... ADD COLUMN`）
2. 更新 `Account` / `AccountInput`
3. 更新 `database.rs` 内相关 `SELECT/INSERT/UPDATE` 与映射
4. 前端更新 `frontend/src/services/types.ts`
5. 更新两个 adapter 的字段映射与相关 UI

### Add a new API capability

1. 在 `database.rs` 增加公共方法
2. 在 `commands.rs` 增加 Tauri command，并在 `lib.rs` 注册
3. 在 `http_server.rs` 增加 handler + route
4. 在前端 `types.ts`、两个 adapter、`api.js` 补齐接口

## Project Conventions

- 文案、注释、提交信息使用中文
- 前端组件层主要用 JSX，services/adapters 层使用 TypeScript
- 包管理使用 `pnpm`（不要改回 `npm`）
- 前端构建产物输出到根目录 `static/`
