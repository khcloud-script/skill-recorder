#!/usr/bin/env bash
# =============================================================================
# Skill Recorder 私有模式启动包装（Linux / macOS）
#
# 用法：
#   1) 复制配置模板：cp "$(dirname "$0")/skill-recorder.env.example" \
#                        ~/.config/skill-recorder/llm.env
#      并编辑其中的端点与模型。
#   2) 直接运行本脚本即可：
#        ./deploy/minimal/run-private.sh                 # 启动已安装的应用
#        ./deploy/minimal/run-private.sh --dev           # 仓库根目录下 npm run dev
#      也可以通过环境变量覆盖具体的应用可执行文件：
#        SKILL_RECORDER_BIN=/opt/skill-recorder/skill-recorder ./run-private.sh
# =============================================================================
set -euo pipefail

ENV_FILE="${SKILL_RECORDER_ENV:-$HOME/.config/skill-recorder/llm.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
  echo "[skill-recorder] loaded config from $ENV_FILE"
fi

if [ -z "${SKILL_RECORDER_LLM_PROVIDER:-}" ] && [ -z "${SKILL_RECORDER_LLM_BASE_URL:-}" ] \
   && [ ! -f "$HOME/.skill-recorder/llm.config.json" ]; then
  cat >&2 <<'EOF'
[skill-recorder] No private LLM configuration found.
  - copy deploy/minimal/skill-recorder.env.example to ~/.config/skill-recorder/llm.env, or
  - write ~/.skill-recorder/llm.config.json.
Without one of these the app falls back to GitHub Copilot (needs internet).
See docs/私有化部署方案.md for details.
EOF
  exit 1
fi

echo "[skill-recorder] backend : ${SKILL_RECORDER_LLM_PROVIDER:-custom}"
echo "[skill-recorder] endpoint: ${SKILL_RECORDER_LLM_BASE_URL:-(preset default)}"
echo "[skill-recorder] model   : ${SKILL_RECORDER_LLM_MODEL:-(preset default)}"

if [ "${1:-}" = "--dev" ]; then
  repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
  exec bash -lc "cd \"$repo_root\" && exec npm run dev"
fi

# Locate the installed application
bin="${SKILL_RECORDER_BIN:-}"
if [ -z "$bin" ]; then
  for candidate in \
    /usr/local/bin/skill-recorder /opt/skill-recorder/skill-recorder \
    "$HOME/Applications/skill-recorder/skill-recorder" \
    /Applications/Skill\ Recorder.app/Contents/MacOS/skill-recorder \
    "$HOME/.local/bin/skill-recorder"; do
    if [ -x "$candidate" ]; then bin="$candidate"; break; fi
  done
fi

if [ -z "$bin" ]; then
  echo "[skill-recorder] Application binary not found." >&2
  echo "  Set SKILL_RECORDER_BIN=/path/to/skill-recorder, or run '$0 --dev' from the repo." >&2
  exit 1
fi

exec "$bin" "$@"
