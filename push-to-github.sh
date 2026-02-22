#!/bin/bash
# GitHub 推送自动化脚本
# 使用方法：./push-to-github.sh [your-github-token]

set -e

echo "=========================================="
echo "Google Manager - GitHub 推送脚本"
echo "=========================================="
echo ""

# 检查是否在正确的目录
if [ ! -f "src-tauri/Cargo.toml" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 检查是否有未推送的提交
UNPUSHED=$(git log origin/master..HEAD --oneline 2>/dev/null | wc -l)
if [ "$UNPUSHED" -eq 0 ]; then
    echo "✅ 所有提交已推送到远程仓库"
    exit 0
fi

echo "📊 发现 $UNPUSHED 个未推送的提交："
git log origin/master..HEAD --oneline
echo ""

# 方式 1: 使用提供的 Token
if [ -n "$1" ]; then
    echo "🔐 使用提供的 Personal Access Token 推送..."

    # 临时配置凭证
    git config --local credential.helper store

    # 构造带 token 的 URL
    REPO_URL=$(git remote get-url origin)
    if [[ $REPO_URL == https://* ]]; then
        # 移除 https:// 前缀
        REPO_PATH=${REPO_URL#https://}
        # 构造新 URL
        AUTH_URL="https://$1@$REPO_PATH"

        # 推送
        git push "$AUTH_URL" master

        echo "✅ 推送成功！"

        # 清理凭证配置
        git config --local --unset credential.helper

        exit 0
    else
        echo "❌ 错误：远程仓库不是 HTTPS URL"
        exit 1
    fi
fi

# 方式 2: 检查是否配置了 SSH
if git remote get-url origin | grep -q "git@github.com"; then
    echo "🔑 检测到 SSH 配置，尝试推送..."
    git push origin master
    echo "✅ 推送成功！"
    exit 0
fi

# 方式 3: 尝试使用已配置的凭证
echo "🔐 尝试使用已配置的凭证推送..."
if git push origin master 2>/dev/null; then
    echo "✅ 推送成功！"
    exit 0
fi

# 如果所有方式都失败，提供帮助信息
echo ""
echo "❌ 推送失败。请选择以下方式之一："
echo ""
echo "方式 1: 使用 Personal Access Token"
echo "  1. 访问 https://github.com/settings/tokens"
echo "  2. 生成新 token（勾选 repo 权限）"
echo "  3. 运行：./push-to-github.sh YOUR_TOKEN"
echo ""
echo "方式 2: 配置 SSH"
echo "  1. 生成 SSH 密钥：ssh-keygen -t ed25519 -C 'your_email@example.com'"
echo "  2. 添加到 GitHub：https://github.com/settings/keys"
echo "  3. 切换到 SSH：git remote set-url origin git@github.com:chengguijin-maker/Google_Manager.git"
echo "  4. 推送：git push origin master"
echo ""
echo "方式 3: 手动推送"
echo "  运行：git push origin master"
echo "  输入用户名和 token（作为密码）"
echo ""

exit 1
