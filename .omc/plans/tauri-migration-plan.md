# Google_Manager 迁移到 Tauri 架构规划

## 一、架构对比

### 当前架构 (Flask + React)

```
Google_Manager/
├── app/                    # Python Flask 后端
│   ├── routes/api.py       # REST API 路由
│   ├── services/           # 业务逻辑
│   ├── models/             # SQLAlchemy 模型
│   └── utils/totp.py       # TOTP 工具
├── frontend/               # React 前端
│   └── src/
└── run.py                  # 启动入口 (需要手动运行)
```

**问题：**
- 需要手动启动 Python 进程
- 需要同时管理 Python 和 Node.js 环境
- 部署需要额外配置 (Nginx/Gunicorn)

### 目标架构 (Tauri)

```
Google_Manager/
├── src-tauri/              # Rust 后端 (编译进应用)
│   ├── src/
│   │   ├── lib.rs          # 入口 + 命令注册
│   │   ├── commands/       # IPC 命令处理
│   │   ├── database/       # SQLite 操作
│   │   └── services/       # 业务逻辑
│   ├── Cargo.toml          # Rust 依赖
│   └── tauri.conf.json     # Tauri 配置
├── src/                    # React 前端 (基本复用)
└── package.json            # 一条命令启动
```

**优势：**
- `pnpm dev` 一条命令启动全部
- 打包成桌面应用，双击即可运行
- 无需安装 Python/Node.js 运行环境

---

## 二、功能映射

| 功能模块 | Flask 实现 | Tauri (Rust) 实现 |
|---------|------------|-------------------|
| **账号 CRUD** | `account_service.py` | `commands/accounts.rs` |
| **TOTP 生成** | `pyotp` 库 | `totp-rs` crate |
| **数据库** | SQLAlchemy + SQLite | `rusqlite` + SQLite |
| **历史记录** | `AccountHistory` 模型 | `database/dao/history.rs` |
| **认证** | `auth_service.py` | `commands/auth.rs` |
| **API 调用** | `fetch()` → Flask | `invoke()` → Rust IPC |

---

## 三、迁移步骤

### Phase 1: 项目初始化 (1-2小时)

```bash
# 1. 安装 Tauri CLI
pnpm add -D @tauri-apps/cli

# 2. 初始化 Tauri 项目
pnpm tauri init

# 3. 配置 tauri.conf.json
```

**tauri.conf.json 配置:**
```json
{
  "productName": "GoogleManager",
  "identifier": "com.googlemanager.app",
  "build": {
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "pnpm run dev:frontend",
    "beforeBuildCommand": "pnpm run build:frontend"
  },
  "app": {
    "windows": [{
      "title": "Google 账号管理器",
      "width": 1200,
      "height": 800,
      "minWidth": 900,
      "minHeight": 600
    }]
  }
}
```

### Phase 2: Rust 后端开发 (4-6小时)

#### 2.1 数据模型 (`src-tauri/src/models.rs`)

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub id: i64,
    pub email: String,
    pub password: String,
    pub recovery: Option<String>,
    pub secret: Option<String>,
    pub remark: Option<String>,
    pub status: String,        // "pro" | "inactive"
    pub sold_status: String,   // "sold" | "unsold"
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccountHistory {
    pub id: i64,
    pub account_id: i64,
    pub field_name: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub changed_at: String,
}
```

#### 2.2 数据库操作 (`src-tauri/src/database.rs`)

```rust
use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::State;

pub struct Database(pub Mutex<Connection>);

pub fn init_database() -> Result<Connection> {
    let conn = Connection::open("googlemanager.db")?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            recovery TEXT,
            secret TEXT,
            remark TEXT,
            status TEXT DEFAULT 'pro',
            sold_status TEXT DEFAULT 'unsold',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS account_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            field_name TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )",
        [],
    )?;

    Ok(conn)
}
```

#### 2.3 Tauri 命令 (`src-tauri/src/commands/accounts.rs`)

```rust
use tauri::State;
use crate::database::Database;
use crate::models::Account;

#[tauri::command]
pub fn get_accounts(
    db: State<Database>,
    search: Option<String>
) -> Result<Vec<Account>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let query = match &search {
        Some(s) if !s.is_empty() => format!(
            "SELECT * FROM accounts WHERE email LIKE '%{}%' OR remark LIKE '%{}%'",
            s, s
        ),
        _ => "SELECT * FROM accounts".to_string(),
    };

    // ... 执行查询并返回结果
}

#[tauri::command]
pub fn create_account(
    db: State<Database>,
    account: Account
) -> Result<Account, String> {
    // ... 插入账号
}

#[tauri::command]
pub fn update_account(
    db: State<Database>,
    id: i64,
    account: Account
) -> Result<Account, String> {
    // ... 更新账号并记录历史
}

#[tauri::command]
pub fn delete_account(
    db: State<Database>,
    id: i64
) -> Result<(), String> {
    // ... 删除账号
}
```

#### 2.4 TOTP 生成 (`src-tauri/src/totp.rs`)

```rust
use totp_rs::{Algorithm, Secret, TOTP};

#[tauri::command]
pub fn generate_totp(secret: String) -> Result<TotpResult, String> {
    let secret_clean = secret.replace(" ", "");

    let totp = TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        Secret::Encoded(secret_clean)
            .to_bytes()
            .map_err(|e| e.to_string())?,
    ).map_err(|e| e.to_string())?;

    let code = totp.generate_current().map_err(|e| e.to_string())?;
    let remaining = 30 - (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() % 30) as u32;

    Ok(TotpResult { code, remaining })
}

#[derive(serde::Serialize)]
pub struct TotpResult {
    pub code: String,
    pub remaining: u32,
}
```

### Phase 3: 前端适配 (2-3小时)

#### 3.1 修改 API 调用 (`src/lib/api.ts`)

**之前 (Flask):**
```typescript
export async function getAccounts(search?: string) {
  const response = await fetch(`/api/accounts?search=${search || ''}`);
  return response.json();
}
```

**之后 (Tauri):**
```typescript
import { invoke } from '@tauri-apps/api/core';

export async function getAccounts(search?: string) {
  return await invoke('get_accounts', { search });
}

export async function createAccount(account: Account) {
  return await invoke('create_account', { account });
}

export async function updateAccount(id: number, account: Account) {
  return await invoke('update_account', { id, account });
}

export async function deleteAccount(id: number) {
  return await invoke('delete_account', { id });
}

export async function generateTotp(secret: string) {
  return await invoke('generate_totp', { secret });
}
```

#### 3.2 组件基本复用

现有 React 组件可以直接复用，只需要：
1. 将 `fetch()` 调用改为 `invoke()`
2. 移除 CORS 相关配置
3. 移除登录认证逻辑（桌面应用可选）

### Phase 4: 构建配置 (1小时)

#### 4.1 更新 package.json

```json
{
  "scripts": {
    "dev:frontend": "vite",
    "build:frontend": "vite build",
    "dev": "tauri dev",
    "build": "tauri build"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0"
  }
}
```

#### 4.2 Cargo.toml 依赖

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
totp-rs = { version = "5", features = ["gen_secret"] }
```

---

## 四、迁移优先级

| 优先级 | 任务 | 工时估计 | 依赖 |
|--------|------|----------|------|
| P0 | 初始化 Tauri 项目 | 1h | - |
| P0 | 数据库模块 (rusqlite) | 2h | P0 |
| P1 | 账号 CRUD 命令 | 3h | 数据库 |
| P1 | TOTP 生成命令 | 1h | - |
| P2 | 历史记录模块 | 2h | 账号 CRUD |
| P2 | 前端 API 层适配 | 2h | 后端命令 |
| P3 | 认证模块 (可选) | 1h | - |
| P3 | 系统托盘 | 1h | - |
| P3 | 自动更新 | 1h | - |

**总计: 约 14 小时**

---

## 五、数据迁移

### 从现有 SQLite 迁移

```rust
// 在首次启动时检测并迁移旧数据
pub fn migrate_from_flask_db(old_path: &str, new_conn: &Connection) -> Result<()> {
    let old_conn = Connection::open(old_path)?;

    // 复制 accounts 表
    let mut stmt = old_conn.prepare("SELECT * FROM accounts")?;
    // ... 迁移数据

    Ok(())
}
```

---

## 六、风险与注意事项

### 技术风险

1. **Rust 学习曲线** - 如果不熟悉 Rust，可能需要额外学习时间
2. **跨平台差异** - 需要在 Windows/macOS/Linux 分别测试
3. **二进制体积** - Tauri 应用比 Electron 小，但比纯 Web 大

### 迁移建议

1. **渐进式迁移** - 先实现核心 CRUD，再添加高级功能
2. **保留 Flask 版本** - 迁移期间保持旧版本可用
3. **自动化测试** - 为 Rust 后端编写单元测试

---

## 七、预期收益

| 指标 | Flask 版本 | Tauri 版本 |
|------|------------|------------|
| 启动命令 | `python run.py` + `npm dev` | `pnpm dev` |
| 部署方式 | 需要服务器 + 环境配置 | 双击运行 |
| 安装包大小 | N/A (需要运行时) | ~10-20MB |
| 运行依赖 | Python 3.8+ | 无 |
| 内存占用 | ~100MB (Python + Node) | ~30-50MB |

---

## 八、下一步行动

1. [ ] 确认是否开始迁移
2. [ ] 安装 Rust 工具链 (`rustup`)
3. [ ] 初始化 Tauri 项目结构
4. [ ] 实现核心数据库模块
5. [ ] 逐步迁移各功能模块
