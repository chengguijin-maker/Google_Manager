# Google Manager

<p align="center">
  <img src="https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react" alt="React">
  <img src="https://img.shields.io/badge/Tauri-2.x-FFC131?style=for-the-badge&logo=tauri" alt="Tauri">
  <img src="https://img.shields.io/badge/Rust-1.77+-000000?style=for-the-badge&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite" alt="SQLite">
</p>

<p align="center">
  <b>专业的 Google 账号资产管理桌面应用</b>
  <br>
  <sub>基于 Tauri + Rust + React 构建，支持批量导入、2FA验证码生成、加密存储等功能</sub>
</p>

---

## ✨ 功能特性

- 📊 **账号列表管理** - 筛选、排序、分页浏览
- 🔐 **加密存储** - 密码和 2FA 密钥使用 AES-256-GCM 加密
- 📥 **批量导入** - 支持多种格式快速导入账号
- 📤 **导出功能** - SQL 和文本格式导出
- 🗑️ **软删除** - 回收站功能，可恢复已删除账号
- 📜 **历史追踪** - 完整的账号修改历史记录
- 🔑 **TOTP 生成** - 一键生成二步验证码
- 🔒 **主密钥保护** - 数据库加密，安全可靠
- 🎨 **现代化界面** - 响应式设计，支持暗色/亮色主题

---

## 📸 界面预览

<details>
<summary>点击展开预览图</summary>

### 登录页面
![登录页面]<img width="2550" height="1292" alt="image" src="https://github.com/user-attachments/assets/0e3faef6-37ff-4a46-b03b-3a4c396eb30b" />


### 账号列表
![账号列表]<img width="2550" height="1292" alt="image" src="https://github.com/user-attachments/assets/6662353d-6f92-4edd-b007-f3aa94b5bf3f" />


### 批量导入
![批量导入]<img width="2550" height="1292" alt="image" src="https://github.com/user-attachments/assets/1889262e-5510-4a20-8b8f-faaf3e58d030" />
<img width="2550" height="1292" alt="image" src="https://github.com/user-attachments/assets/5132326f-9019-46fd-9d39-1e784b8b69cb" />


### 修改历史
![修改历史]<img width="2550" height="1292" alt="image" src="https://github.com/user-attachments/assets/a0befb6a-269c-4c8c-8320-5a98c4a34c54" />


</details>

---

## 🚀 快速开始

### 环境要求

- **Rust**: 1.77.2 或更高版本
- **Node.js**: 20.x 或更高版本
- **pnpm**: 8.x 或更高版本
- **操作系统**: Windows 10+, macOS 10.15+, Linux (Ubuntu 20.04+)

### 安装步骤

1. **克隆项目**
```bash
git clone https://github.com/chengguijin-maker/Google_Manager.git
cd Google_Manager
```

2. **安装依赖**
```bash
# 使用 Makefile（推荐）
make install

# 或手动安装
pnpm install
cd frontend && pnpm install
```

3. **配置环境变量**

复制 `.env.example` 到 `.env` 并设置必需的环境变量：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```bash
# 管理员登录密码（必需）
GOOGLE_MANAGER_ADMIN_PASSWORD=your_secure_password

# 数据库加密主密钥（可选，不设置则自动生成）
# GOOGLE_MANAGER_MASTER_KEY=your_32_byte_hex_or_base64_key
```

**重要**:
- `GOOGLE_MANAGER_ADMIN_PASSWORD` 是必需的，用于登录管理界面
- `GOOGLE_MANAGER_MASTER_KEY` 是可选的，用于加密数据库中的敏感信息
- 如果不设置主密钥，系统会自动生成并保存到 `master.key` 文件

4. **启动项目**

```bash
# 桌面开发模式（推荐用于功能开发）
make dev

# 浏览器 HTTP 模式（不启动桌面窗口）
make test-server
# 然后在另一个终端：
pnpm run dev:test

# Linux 用户服务模式（推荐用于长期运行 / 外网接入）
cd src-tauri && cargo build --no-default-features --features test-server
mkdir -p ~/.config/systemd/user
install -m 0644 systemd/local-services.service ~/.config/systemd/user/local-services.service
systemctl --user daemon-reload
systemctl --user enable --now local-services.service
```

5. **访问应用**

| 方式 | 地址 | 说明 |
|---|---|---|
| 桌面模式 | 自动打开窗口 | 适合本机开发调试 |
| 本机浏览器 | `http://127.0.0.1:5173/gm/` | `start-services.sh` 会拉起前端与后端，并默认挂在 `/gm/` |
| 局域网浏览器 | `http://<服务器IP>:5173/gm/` | 前端默认监听 `0.0.0.0`，并使用 `/gm/` 路径 |
| 公网访问 | `https://hy.2oranges.cn/gm/` | `443` 为统一入口，通过路径访问 Google Manager |

**当前防火墙口径**:
- `ufw` 已启用
- `80/tcp`、`443/tcp` 对公网开放
- `3001`、`5173` 当前仅放行给 `172.0.0.0/8`
- 当前已通过 `Nginx` 将 `https://hy.2oranges.cn/gm/` 反代到本机前端，并将 `https://hy.2oranges.cn/gm/api/` 反代到本机后端

---

## 📦 下载与运行

### 1. 下载安装包

访问 [Releases 页面](https://github.com/chengguijin-maker/Google_Manager/releases) 下载对应平台的安装包：

- **Windows**: MSI 或 NSIS 安装程序
- **Linux**: DEB 包或 AppImage

### 2. 设置环境变量（必需）

应用启动前必须设置管理员密码：

**Linux**:
```bash
export GOOGLE_MANAGER_ADMIN_PASSWORD="your_password"
```

**Windows (PowerShell)**:
```powershell
$env:GOOGLE_MANAGER_ADMIN_PASSWORD="your_password"
```

**Windows (CMD)**:
```cmd
set GOOGLE_MANAGER_ADMIN_PASSWORD=your_password
```

### 3. 运行应用

- **Windows**: 双击运行 MSI 或 NSIS 安装程序，安装后从开始菜单启动
- **Linux (DEB)**:
  ```bash
  sudo dpkg -i google-manager-linux_*.deb
  google-manager
  ```
- **Linux (AppImage)**:
  ```bash
  chmod +x google-manager-linux_*.AppImage
  ./google-manager-linux_*.AppImage
  ```

**注意**: 首次运行时，应用会自动生成主密钥文件 `master.key`，请妥善保管此文件。

---

## 📁 项目结构

```
Google_Manager/
├── frontend/              # React 前端
│   ├── src/
│   │   ├── components/   # React 组件
│   │   ├── services/     # API 服务层
│   │   │   ├── adapters/ # Tauri/HTTP 适配器
│   │   │   └── api.js    # 统一 API 门面
│   │   ├── hooks/        # React Hooks
│   │   └── utils/        # 工具函数
│   └── package.json
├── src-tauri/            # Rust 后端
│   ├── src/
│   │   ├── main.rs       # 入口点
│   │   ├── lib.rs        # Tauri 库
│   │   ├── commands.rs   # Tauri 命令
│   │   ├── database.rs   # 数据库逻辑
│   │   ├── auth.rs       # 认证模块
│   │   ├── crypto.rs     # 加密模块
│   │   ├── totp.rs       # TOTP 生成
│   │   └── http_server.rs # HTTP 服务器
│   └── Cargo.toml
├── systemd/              # 用户服务单元模板
├── start-services.sh     # 前后端聚合启动与健康检查
├── static/               # 前端构建产物
├── Makefile              # 构建脚本
└── README.md
```

---

## 🔧 开发指南

### 桌面开发模式

启动 Tauri 桌面应用开发模式：

```bash
make dev
```

这会同时启动前端开发服务器和 Tauri 应用窗口。

### HTTP 测试服务器模式

如果需要在浏览器中测试（不启动桌面窗口）：

```bash
# 终端 1: 启动 HTTP 测试服务器（默认端口 3001）
make test-server

# 终端 2: 启动前端开发服务器（连接到 HTTP 服务器）
pnpm run dev:test
```

访问方式：
- 本机：`http://127.0.0.1:5173/gm/`
- 局域网：`http://<服务器IP>:5173/gm/`
- 公网：`https://hy.2oranges.cn/gm/`

### Linux 用户服务模式（默认长期运行方式）

适合需要常驻运行、由 `systemd --user` 托管、并配合反向代理提供外网访问的场景。

```bash
# 1) 构建 HTTP 后端二进制
cd src-tauri
cargo build --no-default-features --features test-server
cd ..

# 2) 安装并启动用户服务
mkdir -p ~/.config/systemd/user
install -m 0644 systemd/local-services.service ~/.config/systemd/user/local-services.service
systemctl --user daemon-reload
systemctl --user enable --now local-services.service

# 3) 查看状态与日志
systemctl --user status local-services.service
journalctl --user -u local-services.service -f
```

默认行为：
- `start-services.sh` 会同时启动后端 `3001` 与前端 `5173`
- 前端默认监听 `0.0.0.0`，并使用 `GOOGLE_MANAGER_BASE_PATH=/gm/`
- 用户服务默认注入 `VITE_API_URL=/gm/api` 与 HMR 反代参数
- 日志默认写入 `/run/user/$UID/google-manager/`
- 如需自定义，可设置 `GOOGLE_MANAGER_FRONTEND_HOST`、`GOOGLE_MANAGER_FRONTEND_PORT`、`GOOGLE_MANAGER_BACKEND_PORT`、`GOOGLE_MANAGER_BASE_PATH`

### 外网访问建议

| 方式 | 建议级别 | 说明 |
|---|---|---|
| 直接暴露 `5173/3001` | 不推荐 | 适合临时内网调试，不适合长期公网暴露 |
| 仅开放 `80/443` | 推荐 | 通过 `Nginx` / `Caddy` 反代到本机服务 |
| 前端走 `/gm/`、接口走同源 `/gm/api/` | 推荐 | 便于统一鉴权、路径隔离与减少跨域问题 |

详细配置见：`docs/nginx-https-gm-routing.md`

### 构建

#### 构建前端静态文件

```bash
make build
```

构建产物会输出到 `static/` 目录。

#### 构建桌面应用

```bash
cd src-tauri
cargo tauri build
```

构建产物位置：
- **Windows**: `src-tauri/target/release/google-manager.exe`
- **Linux**: `src-tauri/target/release/google-manager`
- **macOS**: `src-tauri/target/release/bundle/macos/`

### 测试

#### 运行所有测试

```bash
make test
```

#### 仅前端测试

```bash
cd frontend
pnpm test -- --run
```

#### 仅 Rust 测试

```bash
cd src-tauri
cargo test
```

#### 测试覆盖率

```bash
cd frontend
pnpm run test:coverage
```

### 代码检查

```bash
# Rust 编译检查（桌面模式）
make rust-check

# Rust 编译检查（HTTP 服务器模式）
make rust-check-test-server
```

---

## 🏗️ 架构说明

### 双后端设计

应用支持两种运行模式：

1. **桌面模式**（生产环境）: 使用 Tauri invoke 直接调用 Rust 函数
2. **HTTP 模式**（测试环境）: 使用 HTTP API 调用 Rust 后端

前端通过适配器模式自动选择合适的后端：

```
React UI
  → services/api.js (统一门面)
  → services/adapters/ (适配器工厂)
      → TauriAdapter (Tauri invoke)
      → HttpAdapter (HTTP fetch)
  → Rust 后端 (commands.rs / http_server.rs)
  → database.rs (业务逻辑)
```

### 数据安全

- 密码和 2FA 密钥使用 AES-256-GCM 加密存储
- 主密钥可通过环境变量或自动生成
- 支持软删除和回收站功能
- 账号历史记录完整追踪
- 认证系统：连续 3 次失败封禁 24 小时，session 有效期 7 天

### 数据库位置

数据库文件存储在系统数据目录：

- **Windows**: `%APPDATA%/googlemanager/data.db`
- **Linux**: `~/.local/share/googlemanager/data.db`
- **macOS**: `~/Library/Application Support/googlemanager/data.db`

---

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite |
| UI 样式 | TailwindCSS |
| 图标库 | Lucide React |
| 桌面框架 | Tauri 2.x |
| 后端语言 | Rust 1.77+ |
| 数据库 | SQLite 3 |
| 加密 | AES-256-GCM |
| 认证 | Session-based |

---

## ❓ 常见问题

### 1. 编译错误：找不到 Tauri 依赖

确保已安装 Rust 和 Tauri 前置依赖：

```bash
# 更新 Rust
rustup update

# Linux 需要安装系统依赖
sudo apt-get update
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf
```

### 2. 前端无法连接后端

检查环境变量是否正确设置：

```bash
echo $GOOGLE_MANAGER_ADMIN_PASSWORD
```

### 3. 如何重置管理员密码

修改环境变量 `GOOGLE_MANAGER_ADMIN_PASSWORD` 后重启应用。

### 4. 数据库加密密钥丢失怎么办

如果 `master.key` 文件丢失且未设置环境变量，数据库中的加密数据将无法解密。请务必备份 `master.key` 文件。

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 📄 开源协议

本项目采用 MIT License 开源协议。

---

## 📞 联系方式

- **GitHub**: https://github.com/chengguijin-maker/Google_Manager
- **Issues**: https://github.com/chengguijin-maker/Google_Manager/issues

---

<p align="center">
  Made with ❤️ for Google Account Management
</p>






