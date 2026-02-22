# 快速开始指南

## 一键推送到 GitHub

我已经为你准备好了所有文件和自动化脚本。现在只需要一个命令即可完成推送：

### 方式 1: 使用 Personal Access Token（最简单）

```bash
cd /home/eric/code/Google_Manager

# 1. 生成 GitHub Token
# 访问：https://github.com/settings/tokens
# 点击 "Generate new token (classic)"
# 勾选 "repo" 权限
# 复制生成的 token

# 2. 一键推送（将 YOUR_TOKEN 替换为你的 token）
./push-to-github.sh YOUR_TOKEN
```

### 方式 2: 使用 SSH

```bash
cd /home/eric/code/Google_Manager

# 1. 切换到 SSH
git remote set-url origin git@github.com:chengguijin-maker/Google_Manager.git

# 2. 推送
./push-to-github.sh
```

### 方式 3: 手动推送

```bash
cd /home/eric/code/Google_Manager
git push origin master
# 输入用户名: chengguijin-maker
# 输入密码: <你的 GitHub Personal Access Token>
```

## 推送后的步骤

### 1. 配置 GitHub Secret

访问：https://github.com/chengguijin-maker/Google_Manager/settings/secrets/actions

添加 Secret：
- Name: `ADMIN_PASSWORD`
- Value: `placeholder_password_for_build`

### 2. 创建 Release

```bash
cd /home/eric/code/Google_Manager

# 使用自动化脚本（推荐）
./create-release.sh v0.1.0 YOUR_TOKEN

# 或手动创建
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

### 3. 查看构建进度

访问：https://github.com/chengguijin-maker/Google_Manager/actions

## 已完成的工作

✅ 所有代码已提交到本地 Git 仓库
✅ 创建了 .gitignore（排除敏感文件）
✅ 创建了 .env.example（环境变量模板）
✅ 更新了 README.md（Tauri 架构说明）
✅ 更新了 Cargo.toml（包元数据）
✅ 配置了 GitHub Actions（Windows + 多平台构建）
✅ 创建了自动化脚本（push-to-github.sh, create-release.sh）
✅ 创建了完整指南（PUSH_GUIDE.md）

## 提交记录

```
36e3c5a chore: 添加推送和发布自动化脚本
49b3adf docs: 添加 GitHub 推送和发布完整指南
3169ed0 feat: 迁移到 Tauri 桌面架构并配置 CI/CD
```

共 3 个新提交，等待推送到远程仓库。

## 详细文档

- **PUSH_GUIDE.md** - 完整的推送、配置、发布步骤
- **push-to-github.sh** - 自动化推送脚本
- **create-release.sh** - 自动化 Release 创建脚本

## 需要帮助？

如果遇到问题，请查看 PUSH_GUIDE.md 中的"故障排除"部分。
