#!/usr/bin/env bash
# =============================================================================
# 私有 LLM 服务端冒烟自检：/models 列表 + 工具调用握手
#
# 用法：
#   deploy/scripts/check-llm.sh <baseUrl> <model> [apiKey]
#   deploy/scripts/check-llm.sh http://gpu01:8000/v1 qwen-vl
#   deploy/scripts/check-llm.sh https://api.deepseek.com/v1 deepseek-chat sk-xxx
# =============================================================================
set -euo pipefail

BASE_URL="${1:?usage: check-llm.sh <baseUrl> <model> [apiKey]}"
MODEL="${2:?usage: check-llm.sh <baseUrl> <model> [apiKey]}"
API_KEY="${3:-}"

BASE_URL="${BASE_URL%/}"
AUTH=()
if [ -n "$API_KEY" ]; then AUTH=(-H "Authorization: Bearer $API_KEY"); fi

echo "==> 1) GET $BASE_URL/models"
if ! curl -fsS --max-time 10 "${AUTH[@]}" "$BASE_URL/models" | head -c 400; then
  echo; echo "ERROR: /models 不可达 —— 检查地址、端口与服务是否启动。" >&2
  exit 1
fi
echo; echo

echo "==> 2) POST /chat/completions with tools (tool-calling handshake)"
BODY=$(cat <<JSON
{
  "model": "$MODEL",
  "max_tokens": 256,
  "temperature": 0,
  "messages": [
    {"role":"system","content":"You must use the provided tools when asked."},
    {"role":"user","content":"Call the tool echo_back with text=ok, then stop."}
  ],
  "tools": [{
    "type": "function",
    "function": {
      "name": "echo_back",
      "description": "Echo text back.",
      "parameters": {
        "type": "object",
        "properties": {"text": {"type": "string"}},
        "required": ["text"]
      }
    }
  }],
  "tool_choice": "auto"
}
JSON
)
RESP=$(curl -fsS --max-time 60 "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "$BODY" "$BASE_URL/chat/completions")
echo "$RESP" | head -c 1200; echo

if echo "$RESP" | grep -q '"tool_calls"'; then
  echo
  echo "OK: 该模型支持工具调用，可作为 Skill Recorder 的后端。"
  echo "    （是否需要视觉能力请确认模型本身支持 image 输入）"
else
  echo
  echo "WARN: 响应中没有 tool_calls —— 若终态如此，该模型/服务配置无法驱动工具循环。" >&2
  echo "      vLLM 需加 --enable-auto-tool-choice --tool-call-parser hermes；" >&2
  echo "      请换用支持 function calling 的模型后再试。" >&2
  exit 2
fi
