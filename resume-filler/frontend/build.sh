#!/bin/bash

echo ""
echo "========================================"
echo "  简历自动填写助手 - 构建脚本"
echo "========================================"
echo ""

cd "$(dirname "$0")"

echo "[1/2] 正在构建前端..."
echo ""

npm run build

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 构建失败！请检查错误信息。"
    exit 1
fi

echo ""
echo "[2/2] 构建完成！"
echo ""
echo "========================================"
echo "  ✅ 构建成功！"
echo "========================================"
echo ""
echo "📂 输出目录: frontend/dist/"
echo ""
echo "⚠️  接下来请执行以下步骤："
echo ""
echo "  1. 打开 chrome://extensions/"
echo "  2. 找到"简历自动填写助手"扩展"
echo "  3. 点击 🔄 刷新按钮"
echo "  4. 刷新所有使用扩展的网页标签页"
echo ""
echo "========================================"
echo ""

# macOS: 尝试打开 Chrome 扩展页面
if [[ "$OSTYPE" == "darwin"* ]]; then
    read -p "是否打开 Chrome 扩展页面？ (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "chrome://extensions/"
    fi
fi
