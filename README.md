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
- **操作系统**: Windows 10+、Linux (Ubuntu 20.04+)
- **发布说明**: 当前公开发布产物仅提供 Windows 和 Linux，暂不提供 macOS 安装包

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
| 本机浏览器 | `http://127.0.0.1:5173/gm/` | 适合执行 `pnpm run dev:test` 后本机调试 |
| 局域网浏览器 | `http://<服务器IP>:5173/gm/` | 适合临时内网调试，不作为正式入口 |
| 公网访问 | `https://hdy.2oranges.cn/gm/` | `443` 为统一入口，由 `Nginx` 直接托管正式静态文件 |

**当前防火墙口径**:
- `ufw` 已启用
- `33305/tcp`、`80/tcp`、`443/tcp` 对公网开放
- `22/tcp` 已关闭；`3001`、`5173`、`3916`、`4186` 不直接作为公网入口
- 当前已通过 `Nginx` 直接托管 `https://hdy.2oranges.cn/gm/` 的静态资源，并将 `https://hdy.2oranges.cn/gm/api/` 反代到本机后端

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
- 公网：`https://hdy.2oranges.cn/gm/`

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
- `start-services.sh` 会启动后端 `3001`，并以 `static` 模式构建正式前端
- 正式静态资源默认发布到 `/var/www/gmanager-hdy-prod/gm/`
- 正式构建中间产物默认写入 `%t/google-manager/build/gm`
- `Nginx` 直接托管 `/gm/` 静态资源，并将 `/gm/api/` 转发到本机后端
- 日志默认写入 `/run/user/$UID/google-manager/`
- hdy 线上正式流量固定由 `svc/gmanager-hdy-prod` 分支对应的 `gmanager-svc-hdy-prod` worktree 承接，`master` 不再直接对外跑正式服务
- 如需自定义，可设置 `GOOGLE_MANAGER_BACKEND_PORT`、`GOOGLE_MANAGER_BASE_PATH`、`GOOGLE_MANAGER_ROOT_DIR`、`GOOGLE_MANAGER_DATA_DIR`、`XDG_DATA_HOME`、`GOOGLE_MANAGER_FRONTEND_BUILD_DIR`、`GOOGLE_MANAGER_STATIC_DEPLOY_ROOT`

### 推荐 worktree 运行布局

截至 `2026-03-14`，推荐按以下口径长期维护：

| 角色 | 分支 | worktree | 说明 |
|---|---|---|---|
| 主干集成 | `master` | `~/.psm/worktrees/Google_Manager/gmanager-master` | 主干开发与默认预览，不直接承接正式流量 |
| 正式服务 | `svc/gmanager-hdy-prod` | `~/.psm/worktrees/Google_Manager/gmanager-svc-hdy-prod` | 承接 `https://hdy.2oranges.cn/gm/` 正式流量 |
| 功能开发 | `feat/gmanager-*` | `~/.psm/worktrees/Google_Manager/gmanager-feat-*` | 统一通过 `/gm-preview/` 做外网预览 |
| 运维锚点 | `ops/gmanager-hdy-baseline-20260314` | `/home/eric/code/Google_Manager` | 保留运维基线，不直接对外 |

约定：
- 不再单独维护预览分支，所有开发分支共用固定入口 `/gm-preview/`
- 正式 `/gm/` 已切换到静态托管，移动端“切后台回来整页重载”的主因（Vite dev server/HMR）已被移除
- 建议 worktree 统一使用 `gmanager-*` 命名，便于定位与运维

详细说明见：`docs/gmanager-worktree-runtime-layout.md`

### 外网访问建议

| 方式 | 建议级别 | 说明 |
|---|---|---|
| 直接暴露 `5173/3001` | 不推荐 | 适合临时内网调试，不适合长期公网暴露 |
| 仅开放 `80/443` | 推荐 | 通过 `Nginx` / `Caddy` 反代到本机服务 |
| 正式 `/gm/` 走静态托管、接口走同源 `/gm/api/` | 推荐 | 避免 HMR 重连导致移动端切后台恢复时整页重载 |

详细配置见：`docs/nginx-https-gm-routing.md`、`docs/hdy-server-ops.md` 与 `docs/gmanager-worktree-runtime-layout.md`

### 开发预览入口（固定 `/gm-preview/`）

适合把“当前要验收的 worktree”统一挂到一个固定外网地址，避免路径和端口越来越多。

```bash
# 1) 安装预览脚本与用户服务
mkdir -p ~/.local/bin ~/.config/systemd/user ~/.config/google-manager
install -m 0755 start-preview.sh ~/.local/bin/gm-start-preview.sh
install -m 0644 systemd/gm-preview.service ~/.config/systemd/user/gm-preview.service
systemctl --user daemon-reload

# 2) 配置当前要预览的 worktree
cat > ~/.config/google-manager/gm-preview.env <<'EOF'
GOOGLE_MANAGER_ROOT_DIR=/home/eric/.psm/worktrees/Google_Manager/gmanager-master
GOOGLE_MANAGER_FRONTEND_PORT=4186
GOOGLE_MANAGER_BACKEND_PORT=3916
GOOGLE_MANAGER_BASE_PATH=/gm-preview/
VITE_API_URL=/gm-preview/api
GOOGLE_MANAGER_DATA_DIR=/home/eric/.local/share/google-manager/previews/preview
XDG_DATA_HOME=/home/eric/.local/share/google-manager-xdg/previews/preview
GOOGLE_MANAGER_LOG_DIR=/run/user/1000/google-manager/previews/preview
GOOGLE_MANAGER_FRONTEND_HOST=127.0.0.1
GOOGLE_MANAGER_ADMIN_PASSWORD=admin123
GOOGLE_MANAGER_HMR_HOST=hdy.2oranges.cn
GOOGLE_MANAGER_HMR_PROTOCOL=wss
GOOGLE_MANAGER_HMR_CLIENT_PORT=443
GOOGLE_MANAGER_HMR_PATH=/gm-preview/
EOF

# 3) 启动或切换预览实例
systemctl --user enable --now gm-preview.service
systemctl --user restart gm-preview.service
```

默认约定：
- 外网开发版固定走 `/gm-preview/`
- 只保留一个开发预览入口，减少记忆成本
- 切换 worktree 只需要改 `GOOGLE_MANAGER_ROOT_DIR` 后重启 `gm-preview.service`
- 预览数据库、主密钥、日志目录与正式环境隔离

详细配置见：`docs/nginx-gm-preview-path-routing.md`、`docs/hdy-server-ops.md` 与 `docs/gmanager-worktree-runtime-layout.md`

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

构建产物位置（当前文档仅列已支持发布的平台）：
- **Windows**: `src-tauri/target/release/google-manager.exe`
- **Linux**: `src-tauri/target/release/google-manager`

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
