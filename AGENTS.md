# AGENTS.md — Google Manager 代码库深度文档

> 基于 deepinit 深度分析 | 最后更新 2026-02-11

## 项目概览

**Google Manager** — 谷歌账号资产管理系统。Tauri 桌面应用架构。

## 架构总览

```
┌────────────────────────────────────────────────────────────┐
│                    React 18 前端 (Vite 4)                    │
│   App.jsx → AccountListView / ImportView / ExportDialog    │
│                   ↓ services/api.js (Facade)               │
│           adapters/index.ts (Factory + 运行时检测)           │
│     ┌──────────────┴──────────────┐                        │
│     ▼                             ▼                        │
│  TauriAdapter                 HttpAdapter                  │
│  (invoke → Rust)              (fetch → Rust HTTP)          │
└──┬──────────────────────────────┬──────────────────────────┘
   │                              │
   ▼                              ▼
┌──────────────────────────────────────┐
│ Tauri/Rust  (src-tauri/)             │
│ commands.rs / http_server.rs         │
│ database.rs                          │
└──────────────┬───────────────────────┘
               │
          SQLite 数据库
       (accounts + account_history)
```

## 目录结构

```
/
├── frontend/                 # React 前端
│   └── src/
│       ├── App.jsx           # 根组件：全局状态、2FA 定时器、视图路由
│       ├── components/       # UI 组件（JSX）
│       │   ├── AccountListView.jsx  # 主容器：状态管理、导出、批量操作（~400行）
│       │   ├── AccountTable.jsx     # 表格渲染：列定义、行渲染、行内编辑
│       │   ├── BatchToolbar.jsx     # 批量操作工具栏
│       │   ├── ImportView.jsx       # 导入：单个/批量、格式解析 UI（~300行）
│       │   ├── ExportDialog.jsx     # 导出：字段选择、分隔符、预览
│       │   ├── HistoryDrawer.jsx    # 历史记录抽屉面板
│       │   ├── LoginPage.jsx        # 登录页
│       │   └── Pagination.jsx       # 分页组件
│       ├── hooks/            # 自定义 Hooks
│       │   ├── usePagination.js       # 分页逻辑
│       │   ├── useInlineEdit.js       # 行内编辑逻辑
│       │   └── useAccountSelection.js # 多选逻辑（Ctrl/Shift/拖拽）
│       ├── utils/
│       │   └── importParser.js  # 导入文本解析（纯函数模块）
│       ├── services/         # 业务逻辑层
│       │   ├── api.js        # 统一 API 门面（Facade）
│       │   ├── types.ts      # ApiAdapter 接口 + 类型定义
│       │   ├── utils.ts      # camelCase ↔ snake_case 工具
│       │   └── adapters/     # 适配器模式
│       │       ├── index.ts          # 工厂：运行时检测 Tauri/HTTP
│       │       ├── tauri-adapter.ts  # Tauri invoke + 自动命名转换
│       │       └── http-adapter.ts   # HTTP fetch（对接 Rust 测试服务器）
│       └── __tests__/        # Vitest 单元测试
│
├── src-tauri/                # Tauri/Rust 桌面应用（主方向）
│   ├── Cargo.toml            # Rust 依赖（tauri 2.10, rusqlite, totp-rs, actix-web）
│   ├── capabilities/         # Tauri 权限配置
│   └── src/
│       ├── main.rs           # 入口：--test-server 模式 / GUI 模式
│       ├── lib.rs            # Tauri builder + 插件 + 命令注册（11 个）
│       ├── database.rs       # Database struct + 公共方法 + 自动迁移
│       ├── commands.rs       # Tauri command 薄包装层
│       └── http_server.rs    # actix-web 测试服务器薄包装层
│
├── e2e/                      # E2E 测试（Chrome DevTools MCP）
│   └── chrome-devtools-test-plan.md  # 32 个测试用例
│
├── static/                   # Vite 构建输出
├── Makefile                  # 构建命令
├── package.json              # 根脚本（test:unit/rust/parallel）
├── CLAUDE.md                 # 项目指南
└── AGENTS.md                 # 本文档
```

## 模块详解

### 1. 前端 (`frontend/src/`)

#### 核心设计模式

| 模式 | 位置 | 作用 |
|------|------|------|
| **Adapter** | `services/adapters/` | 统一 Tauri/HTTP 双后端接口 |
| **Facade** | `services/api.js` | 简化 API 调用，隐藏适配器选择 |
| **Factory** | `adapters/index.ts` | 运行时检测环境并创建适配器 |
| **Strategy** | `utils.ts` | camelCase ↔ snake_case 命名转换 |

#### 适配器检测逻辑

```
1. window.__TAURI__ 存在 → TauriAdapter (invoke → Rust)
2. VITE_USE_HTTP=true 或 URL ?use_http=true → HttpAdapter (fetch → Rust HTTP 测试服务器)
3. 默认 → HttpAdapter
```

#### 组件职责

| 组件 | 行数 | 核心功能 |
|------|------|---------|
| `AccountListView.jsx` | ~400 | 状态管理、搜索/筛选 UI、导出、批量操作编排 |
| `AccountTable.jsx` | ~400 | 表格渲染、行内编辑单元格、列定义 |
| `BatchToolbar.jsx` | ~120 | 批量操作按钮栏（删除/设置标签/手机号等） |
| `ImportView.jsx` | ~300 | 单个/批量导入 UI、实时预览 |
| `ExportDialog.jsx` | ~380 | 字段选择、分隔符配置、范围管理、实时预览 |
| `HistoryDrawer.jsx` | ~240 | 字段变更历史展示 |

#### Hooks

| Hook | 功能 |
|------|------|
| `usePagination.js` | 页码/页大小/边界处理 |
| `useInlineEdit.js` | 双击编辑、组名自动完成、ESC/Enter 处理 |
| `useAccountSelection.js` | Ctrl+点击多选、Shift+范围选、拖拽选择 |

#### 导入解析器 (`utils/importParser.js`)

```
分隔符优先级: ---- > —— > --- > | > --
字段识别: 邮箱 → 恢复邮箱 → 2FA密钥(含2fa.live URL提取) → 年份(2015-2030) → 手机号 → 国家 → 密码 → 备注
特殊格式: "卡号：xxx密码：xxx----2FA密钥"
```

### 2. Tauri/Rust 后端 (`src-tauri/`)

#### 模块关系

```
main.rs  ─── CLI 参数解析
  ├── GUI 模式 → lib.rs::run()
  │                 └── Tauri Builder + Plugins + Commands
  └── 测试模式 → lib.rs::run_http_server(port)
                     └── http_server.rs (actix-web)

commands.rs ── 薄包装层 → database.rs 公共方法
http_server.rs ── 薄包装层 → database.rs 公共方法

database.rs ── Database { Mutex<Connection> }
  ├── query_accounts()
  ├── create_account()
  ├── update_account() + 变更追踪
  ├── delete_account()
  ├── toggle_status() / toggle_sold_status()
  ├── get_account_history()
  └── export_database_sql() / export_accounts_text()
```

#### Tauri Commands（11 个）

| 命令 | 功能 |
|------|------|
| `get_accounts` | 查询列表（search + sold_status 筛选） |
| `create_account` | 创建账号（默认 inactive/unsold） |
| `update_account` | 更新账号 + 追踪字段变更 |
| `delete_account` | 删除账号 + 级联删除历史 |
| `toggle_status` | 切换 pro ↔ inactive |
| `toggle_sold_status` | 切换 sold ↔ unsold |
| `get_account_history` | 变更历史（按时间倒序） |
| `generate_totp` | 生成 2FA（SHA1/6位/30秒） |
| `batch_import` | 批量导入 |
| `export_database_sql` | 导出 SQL |
| `export_accounts_text` | 导出文本（自定义字段/分隔符） |

#### 数据库 Schema

```sql
-- accounts 表
id INTEGER PRIMARY KEY AUTOINCREMENT,
email TEXT UNIQUE NOT NULL,
password TEXT NOT NULL,
recovery TEXT, phone TEXT, secret TEXT,
reg_year TEXT, country TEXT, group_name TEXT, remark TEXT,
status TEXT DEFAULT 'inactive',    -- pro | inactive
sold_status TEXT DEFAULT 'unsold', -- sold | unsold
created_at TEXT, updated_at TEXT

-- account_history 表
id, account_id, field_name, old_value, new_value, changed_at
FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
```

### 3. E2E 测试 (`e2e/`)

Chrome DevTools MCP 交互式测试，测试计划详见 `e2e/chrome-devtools-test-plan.md`。

## 测试体系

### 两层测试

| 层 | 框架 | 运行命令 | 测试数 |
|----|------|---------|-------|
| 前端单元 | Vitest + jsdom | `cd frontend && pnpm test -- --run` | 4+ 文件 |
| Rust 单元 | cargo test | `cd src-tauri && cargo test` | 13 个 |
| E2E | Chrome DevTools MCP | 交互式 | 32 个用例 |

### 并行测试

```bash
pnpm run test:parallel:acceptance  # 前端 + Rust 并行
```

## 数据流

### 读取流程（getAccounts）

```
Component → api.getAccounts(search, soldStatus)
  → getAdapter() → Tauri/Http Adapter
    → invoke('get_accounts', {search, sold_status})  [Tauri]
    → fetch('/api/accounts?search=&sold_status=')     [HTTP]
  → 后端查询 SQLite → 返回 snake_case JSON
  → snakeToCamel() 转换 → Component 渲染
```

## 技术栈速查

| 层 | 技术 | 版本 |
|---|---|---|
| 前端 | React + Vite + TailwindCSS | 18 / 4 / 3 |
| 桌面 | Tauri + Rust | 2.10 |
| 数据库 | SQLite | rusqlite 0.31 |
| 2FA | totp-rs / otplib | 5 / 13 |
| 测试 | Vitest + cargo test + Chrome DevTools MCP | — |
| 包管理 | pnpm (前端) + cargo (Rust) | — |
| HTTP 服务器 | actix-web (测试用) | 4 |

## 关键约定

1. **语言**: 中文（注释、UI、commit message）
2. **前端**: 组件用 JSX，services/adapters 用 TypeScript
3. **包管理**: 使用 pnpm 替代 npm
4. **命名**: 前端 camelCase ↔ 后端 snake_case，适配器层自动转换
5. **构建**: Vite 输出到根 `static/`
6. **Tauri**: 命令通过 `#[tauri::command]` 宏暴露，在 `lib.rs` 注册
7. **数据库路径**: Rust → `dirs::data_dir()/google-manager/`
8. **状态值**: status = `"pro"` | `"inactive"`，sold_status = `"sold"` | `"unsold"`

## 开发指南

### 添加新字段

1. **数据库**: 在 `database.rs` 的 `init_database()` 添加 `ALTER TABLE ... ADD COLUMN`
2. **Rust 模型**: 更新 `Account`/`AccountInput` struct
3. **Database 方法**: 更新 `database.rs` 中公共方法的 INSERT/UPDATE/SELECT
4. **Tauri 命令**: commands.rs 自动调用 database 方法，一般无需改动
5. **HTTP 服务器**: http_server.rs 自动调用 database 方法，一般无需改动
6. **前端类型**: 更新 `frontend/src/services/types.ts`
9. **前端适配器**: 更新两个 adapter 文件
10. **前端组件**: 更新相关视图组件

### 添加新 API 端点

1. **Database**: 在 `database.rs` 添加公共方法
2. **Tauri**: 在 `commands.rs` 添加薄包装 command，`lib.rs` 注册
3. **HTTP**: 在 `http_server.rs` 添加薄包装 handler + route 注册
4. **前端**: 在 `types.ts` 扩展接口，两个 adapter 实现，`api.js` 暴露

### 导入格式扩展

解析逻辑位于 `frontend/src/utils/importParser.js`：
- `parseImportText(text)` → `{ parsed, formatStats, detectedFormats }`
- 分隔符识别: 按优先级匹配
- 字段识别: 邮箱/年份/手机/国家用正则，其余按位置
- 特殊格式: 正则匹配 `卡号：xxx密码：xxx----2FA密钥`
