#!/bin/bash
# GitHub 发布完整流程脚本
# 自动完成推送、标签创建和验证

set -e

echo "=========================================="
echo "Google Manager - GitHub 发布完整流程"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否在正确的目录
if [ ! -f "src-tauri/Cargo.toml" ]; then
    echo -e "${RED}❌ 错误：请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 步骤 1: 检查待推送的提交
echo "📊 步骤 1/4: 检查待推送的提交"
echo "----------------------------------------"
UNPUSHED=$(git log origin/master..HEAD --oneline 2>/dev/null | wc -l)
if [ "$UNPUSHED" -eq 0 ]; then
    echo -e "${GREEN}✅ 所有提交已推送${NC}"
else
    echo -e "${YELLOW}发现 $UNPUSHED 个待推送的提交:${NC}"
    git log origin/master..HEAD --oneline
    echo ""
fi

# 步骤 2: 推送代码
echo ""
echo "🚀 步骤 2/4: 推送代码到 GitHub"
echo "----------------------------------------"

# 检查是否有 SSH 密钥
if [ -f ~/.ssh/id_rsa ] || [ -f ~/.ssh/id_ed25519 ]; then
    echo "检测到 SSH 密钥，尝试使用 SSH 推送..."

    # 获取当前 remote URL
    CURRENT_URL=$(git remote get-url origin)

    # 如果是 HTTPS，询问是否切换到 SSH
    if [[ $CURRENT_URL == https://* ]]; then
        echo -e "${YELLOW}当前使用 HTTPS URL: $CURRENT_URL${NC}"
        echo "是否切换到 SSH? (y/n)"
        read -r SWITCH_SSH

        if [ "$SWITCH_SSH" = "y" ]; then
            git remote set-url origin git@github.com:chengguijin-maker/Google_Manager.git
            echo -e "${GREEN}✅ 已切换到 SSH URL${NC}"
        fi
    fi

    # 尝试推送
    if git push origin master 2>&1; then
        echo -e "${GREEN}✅ 推送成功！${NC}"
    else
        echo -e "${RED}❌ SSH 推送失败${NC}"
        echo "请检查 SSH 密钥是否已添加到 GitHub"
        echo "访问: https://github.com/settings/keys"
        exit 1
    fi
else
    # 没有 SSH 密钥，使用 Token
    echo "未检测到 SSH 密钥，需要使用 Personal Access Token"
    echo ""
    echo "请输入你的 GitHub Personal Access Token:"
    echo "(访问 https://github.com/settings/tokens 生成)"
    read -s GITHUB_TOKEN
    echo ""

    if [ -z "$GITHUB_TOKEN" ]; then
        echo -e "${RED}❌ Token 不能为空${NC}"
        exit 1
    fi

    # 使用 Token 推送
    REPO_URL=$(git remote get-url origin)
    REPO_PATH=${REPO_URL#https://}
    AUTH_URL="https://${GITHUB_TOKEN}@${REPO_PATH}"

    if git push "$AUTH_URL" master 2>&1; then
        echo -e "${GREEN}✅ 推送成功！${NC}"
    else
        echo -e "${RED}❌ 推送失败，请检查 Token 是否有效${NC}"
        exit 1
    fi
fi

# 步骤 3: 重新创建标签
echo ""
echo "🏷️  步骤 3/4: 重新创建 v0.1.0 标签"
echo "----------------------------------------"

# 检查本地标签是否存在
if git tag -l | grep -q "^v0.1.0$"; then
    echo "删除本地标签 v0.1.0..."
    git tag -d v0.1.0
fi

# 检查远程标签是否存在
if git ls-remote --tags origin | grep -q "refs/tags/v0.1.0"; then
    echo "删除远程标签 v0.1.0..."

    if [ -n "$GITHUB_TOKEN" ]; then
        # 使用 Token
        git push "$AUTH_URL" :refs/tags/v0.1.0 2>&1 || true
    else
        # 使用 SSH
        git push origin :refs/tags/v0.1.0 2>&1 || true
    fi
fi

# 创建新标签
echo "创建新标签 v0.1.0..."
git tag -a v0.1.0 -m "Release v0.1.0 - 修复 CI/CD 工作流

- 移除 macOS 平台支持
- 添加 create-release job 自动创建 GitHub Release
- 在 README 添加「下载与运行」章节
- 修复用户无法从 Releases 页面下载的问题"

# 推送标签
echo "推送标签到远程..."
if [ -n "$GITHUB_TOKEN" ]; then
    git push "$AUTH_URL" v0.1.0
else
    git push origin v0.1.0
fi

echo -e "${GREEN}✅ 标签创建并推送成功！${NC}"

# 步骤 4: 验证和后续步骤
echo ""
echo "✅ 步骤 4/4: 验证和后续步骤"
echo "----------------------------------------"
echo ""
echo -e "${GREEN}🎉 所有步骤完成！${NC}"
echo ""
echo "📋 后续操作："
echo "1. 访问 GitHub Actions 查看构建进度:"
echo "   https://github.com/chengguijin-maker/Google_Manager/actions"
echo ""
echo "2. 构建完成后（约 15-20 分钟），访问 Releases 页面:"
echo "   https://github.com/chengguijin-maker/Google_Manager/releases"
echo ""
echo "3. 验证以下内容:"
echo "   - Release v0.1.0 已自动创建"
echo "   - 包含 Windows MSI 和 NSIS 安装包"
echo "   - 包含 Linux DEB 和 AppImage"
echo ""
echo "=========================================="
