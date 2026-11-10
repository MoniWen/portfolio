#!/bin/bash
# 双击运行：以本地服务方式打开作品集，才能完整使用「自选封面」的画面导出功能。
cd "$(dirname "$0")" || exit 1

PY="/Users/Moni/.workbuddy/binaries/python/envs/default/bin/python"
if [ ! -x "$PY" ]; then
  PY="$(command -v python3)"
fi
if [ -z "$PY" ]; then
  echo "找不到 Python，请改用已有的预览方式打开页面。"
  read -r -p "按回车键关闭…"
  exit 1
fi

PORT=8765
# --lan：让同一 Wi-Fi 的手机也能打开并播放视频；只想本机访问时可去掉该参数
"$PY" serve.py "$PORT" --lan &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT
sleep 1

URL="http://localhost:$PORT/index.html"
if [ -d "/Applications/Microsoft Edge.app" ]; then
  open -a "Microsoft Edge" "$URL"
else
  open "$URL"
fi

echo ""
echo "已打开 $URL"
echo "手机连同一个 Wi-Fi，用上面终端打印的「手机地址」打开，即可播放完整视频。"
echo "点右上角「自选封面」→ 点击任意作品 → 拖动进度条挑一帧 → 设为封面。"
echo "关闭这个终端窗口会停止服务；服务停止后页面仍可浏览，但无法导出新画面。"
wait "$SERVER_PID"
