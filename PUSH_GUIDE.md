# GitHub 推送指南

## 当前状态

✅ 所有代码已提交到本地 Git 仓库
✅ 提交信息：`feat: 迁移到 Tauri 桌面架构并配置 CI/CD`
✅ 包含 137 个文件更改（36793 行新增，5519 行删除）
⏳ 等待推送到 GitHub 远程仓库

## 推送方法

### 方法 1: 使用 Personal Access Token（推荐）

1. **生成 Token**
   - 访问：https://github.com/settings/tokens
   - 点击 "Generate new token (classic)"
   - 勾选权限：`repo`（完整仓库访问）
   - 点击 "Generate token"
   - **立即复制 token**（只显示一次）

2. **配置 Git 凭证**
   ```bash
   cd /home/eric/code/Google_Manager

   # 配置凭证助手（缓存 1 小时）
   git config credential.helper 'cache --timeout=3600'

   # 推送（会提示输入用户名和密码）
   git push origin master
   # Username: chengguijin-maker
   # Password: <粘贴你的 Personal Access Token>
   ```

3. **验证推送成功**
   ```bash
   git status
   # 应该显示：Your branch is up to date with 'origin/master'
   ```

### 方法 2: 使用 SSH（如果已配置）

1. **检查 SSH 密钥**
   ```bash
   ls -la ~/.ssh/id_*
   ```

2. **如果有密钥，切换到 SSH**
   ```bash
   cd /home/eric/code/Google_Manager
   git remote set-url origin git@github.com:chengguijin-maker/Google_Manager.git
   git push origin master
   ```

3. **如果没有密钥，生成新的**
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   cat ~/.ssh/id_ed25519.pub
   # 复制输出，添加到 GitHub: https://github.com/settings/keys
   ```

### 方法 3: 使用 GitHub CLI（如果已安装）

```bash
# 安装 GitHub CLI（如果未安装）
# Ubuntu/Debian:
sudo apt install gh

# 认证
gh auth login

# 推送
cd /home/eric/code/Google_Manager
git push origin master
```

## 推送后的步骤

### 1. 配置 GitHub Secrets

推送成功后，需要在 GitHub 仓库中配置 Secret：

1. 访问：https://github.com/chengguijin-maker/Google_Manager/settings/secrets/actions
2. 点击 "New repository secret"
3. 添加：
   - Name: `ADMIN_PASSWORD`
   - Value: `placeholder_password_for_build`（仅用于编译，不是实际密码）

### 2. 创建第一个 Release

```bash
cd /home/eric/code/Google_Manager

# 创建标签
git tag -a v0.1.0 -m "Release v0.1.0 - Tauri 桌面版首次发布

主要特性：
- 从 Flask/Python 迁移到 Tauri + Rust + React
- 完整的桌面应用功能（加密存储、TOTP、认证）
- 跨平台支持（Windows/Linux/macOS）
- GitHub Actions 自动构建"

# 推送标签
git push origin v0.1.0
```

### 3. 等待 GitHub Actions 构建

1. 访问：https://github.com/chengguijin-maker/Google_Manager/actions
2. 查看构建进度
3. 构建完成后，下载 artifacts 测试

### 4. 创建 GitHub Release

1. 访问：https://github.com/chengguijin-maker/Google_Manager/releases/new
2. 选择标签：`v0.1.0`
3. 填写 Release 信息：

   **标题**: `v0.1.0 - Tauri 桌面版首次发布`

   **描述**:
   ```markdown
   ## 🎉 首次发布

   Google Manager 已从 Flask/Python 架构迁移到 Tauri + Rust + React 桌面应用。

   ## ✨ 主要特性

   - 📊 账号列表管理（筛选、排序、分页）
   - 🔐 AES-256-GCM 加密存储
   - 📥 批量导入账号
   - 📤 导出功能（SQL、文本）
   - 🗑️ 软删除与回收站
   - 📜 完整历史追踪
   - 🔑 TOTP 二步验证码生成
   - 🔒 主密钥保护

   ## 📦 下载

   - **Windows**: `google-manager-windows.zip`
   - **Linux**: `google-manager-linux.zip`
   - **macOS**: `google-manager-macos.zip`

   ## 🚀 使用说明

   1. 下载对应平台的安装包
   2. 解压并运行
   3. 设置环境变量：
      ```bash
      export GOOGLE_MANAGER_ADMIN_PASSWORD=your_password
      ```
   4. 启动应用

   详细文档：https://github.com/chengguijin-maker/Google_Manager#readme

   ## 🔧 技术栈

   - 前端：React 18 + Vite + TailwindCSS
   - 后端：Rust + Tauri 2.x
   - 数据库：SQLite 3（加密）
   - 认证：Session-based
   ```

4. 从 Actions artifacts 下载构建产物并上传
5. 点击 "Publish release"

## 验证清单

推送和发布完成后，验证以下内容：

- [ ] GitHub 仓库显示最新代码
- [ ] README.md 正确显示 Tauri 架构说明
- [ ] GitHub Actions 工作流文件存在
- [ ] `.gitignore` 正确排除敏感文件
- [ ] `.env.example` 文件存在
- [ ] Cargo.toml 元数据正确
- [ ] GitHub Actions 构建成功
- [ ] Release 创建成功
- [ ] 构建产物可以下载

## 故障排除

### 推送失败：认证错误

```bash
# 清除缓存的凭证
git credential-cache exit

# 重新推送
git push origin master
```

### 推送失败：rejected

```bash
# 拉取远程更改
git pull origin master --rebase

# 重新推送
git push origin master
```

### GitHub Actions 构建失败

1. 检查 Actions 日志
2. 确认 `ADMIN_PASSWORD` secret 已配置
3. 检查 Cargo.toml 和 package.json 依赖

### 构建产物缺失

- Windows: 检查 `src-tauri/target/release/bundle/msi/` 和 `nsis/`
- Linux: 检查 `src-tauri/target/release/bundle/deb/` 和 `appimage/`
- macOS: 检查 `src-tauri/target/release/bundle/dmg/` 和 `macos/`

## 后续优化

推送成功后，可以考虑以下优化：

1. **代码签名**：为 Windows 可执行文件添加数字签名
2. **自动更新**：集成 Tauri 的自动更新功能
3. **多语言支持**：添加国际化
4. **性能监控**：集成错误追踪服务
5. **文档完善**：添加开发者文档和 API 文档
6. **测试覆盖**：增加 E2E 测试
7. **安全审计**：定期运行安全扫描

## 联系方式

如有问题，请在 GitHub Issues 中反馈：
https://github.com/chengguijin-maker/Google_Manager/issues
