#!/bin/bash
# 交互式推送脚本 - 会提示输入 Token

set -e

echo "=========================================="
echo "GitHub 推送 - 交互式模式"
echo "=========================================="
echo ""
echo "📊 待推送提交："
git log origin/master..HEAD --oneline
echo ""
echo "🔐 请输入你的 GitHub Personal Access Token："
echo "   (输入不会显示，这是正常的安全行为)"
echo ""
read -s -p "Token: " GITHUB_TOKEN
echo ""
echo ""

if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ 错误：Token 不能为空"
    exit 1
fi

echo "📤 正在推送到 GitHub..."
./push-to-github.sh "$GITHUB_TOKEN"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 推送成功！"
    echo ""
    echo "📋 下一步："
    echo "1. 配置 GitHub Secret: https://github.com/chengguijin-maker/Google_Manager/settings/secrets/actions"
    echo "2. 创建 Release: ./create-release.sh v0.1.0 $GITHUB_TOKEN"
    echo ""
else
    echo ""
    echo "❌ 推送失败，请检查 Token 是否正确"
    exit 1
fi
