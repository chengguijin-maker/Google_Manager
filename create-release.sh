#!/bin/bash
# 创建 Release 自动化脚本
# 使用方法：./create-release.sh [version] [github-token]

set -e

VERSION=${1:-"v0.1.0"}
TOKEN=$2

echo "=========================================="
echo "Google Manager - Release 创建脚本"
echo "=========================================="
echo ""qing

# 检查是否在正确的目录
if [ ! -f "src-tauri/Cargo.toml" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 检查是否已推送
if ! git diff --quiet origin/master 2>/dev/null; then
    echo "❌ 错误：请先推送所有更改到远程仓库"
    echo "运行：./push-to-github.sh"
    exit 1
fi

echo "📦 准备创建 Release: $VERSION"
echo ""

# 检查标签是否已存在
if git rev-parse "$VERSION" >/dev/null 2>&1; then
    echo "⚠️  标签 $VERSION 已存在"
    read -p "是否删除并重新创建？(y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git tag -d "$VERSION"
        git push origin ":refs/tags/$VERSION" 2>/dev/null || true
    else
        exit 1
    fi
fi

# 创建标签
echo "🏷️  创建标签 $VERSION..."
git tag -a "$VERSION" -m "Release $VERSION - Tauri 桌面版首次发布

主要特性：
- 从 Flask/Python 迁移到 Tauri + Rust + React
- 完整的桌面应用功能（加密存储、TOTP、认证）
- 跨平台支持（Windows/Linux/macOS）
- GitHub Actions 自动构建"

# 推送标签
echo "📤 推送标签到远程仓库..."
if [ -n "$TOKEN" ]; then
    REPO_URL=$(git remote get-url origin)
    REPO_PATH=${REPO_URL#https://}
    AUTH_URL="https://$TOKEN@$REPO_PATH"
    git push "$AUTH_URL" "$VERSION"
else
    git push origin "$VERSION"
fi

echo ""
echo "✅ 标签创建成功！"
echo ""
echo "📋 后续步骤："
echo "1. 访问 GitHub Actions 查看构建进度："
echo "   https://github.com/chengguijin-maker/Google_Manager/actions"
echo ""
echo "2. 构建完成后，创建 Release："
echo "   https://github.com/chengguijin-maker/Google_Manager/releases/new"
echo ""
echo "3. 选择标签: $VERSION"
echo "4. 填写 Release 信息（参考 PUSH_GUIDE.md）"
echo "5. 上传构建产物"
echo "6. 发布 Release"
echo ""
