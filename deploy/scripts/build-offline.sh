#!/usr/bin/env bash
# =============================================================================
# Skill Recorder 离线构建 / 打包脚本
#
# 用法（详见 docs/离线编译与打包.md）：
#   有网机器：  ./deploy/scripts/build-offline.sh fetch           # 收集依赖
#   内网机器：  ./deploy/scripts/build-offline.sh build --offline # 离线构建
#               ./deploy/scripts/build-offline.sh test
#               ./deploy/scripts/build-offline.sh dist --platform win32
#
# 环境变量：
#   npm_config_registry                 私有 npm registry
#   ELECTRON_MIRROR                     Electron 二进制镜像
#   ELECTRON_BUILDER_BINARIES_MIRROR    electron-builder 工具镜像
#   HF_ENDPOINT                         HuggingFace 镜像端点
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

cmd="${1:-help}"
shift || true

OFFLINE=0 PLATFORM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --offline) OFFLINE=1 ;;
    --platform=*) PLATFORM="${1#*=}" ;;
    --platform) PLATFORM="${2:?--platform requires a value}"; shift ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

banner() { printf '\n==== %s ====\n' "$*"; }

case "$cmd" in
  fetch)
    banner "收集依赖（请在可上网的机器执行）"
    npm ci --no-audit --no-fund
    # 缓存目录，供内网 npm ci --offline 使用
    tar czf skill-recorder-npm-cache.tgz -C "${npm_config_cache:-$HOME/.npm}" _cacache
    echo ">>> 已生成 npm 缓存包：$REPO_ROOT/skill-recorder-npm-cache.tgz"
    echo ">>> 连同本仓库代码一起拷贝到内网机器。"
    ;;

  deps)
    banner "安装依赖${OFFLINE:+（离线模式）}"
    if [ -f "$REPO_ROOT/skill-recorder-npm-cache.tgz" ]; then
      tar xzf skill-recorder-npm-cache.tgz -C "${npm_config_cache:-$HOME/.npm}"
    fi
    if [ "$OFFLINE" -eq 1 ]; then
      npm ci --offline --no-audit --no-fund --ignore-scripts
      echo ">>> 已按 --ignore-scripts 安装；请按 docs/离线编译与打包.md 3.1 手工补齐原生依赖。"
    else
      npm ci --no-audit --no-fund
    fi
    ;;

  build)
    "$REPO_ROOT/deploy/scripts/build-offline.sh" deps ${OFFLINE:+--offline}
    banner "构建（tsc + vite）"
    npm run build
    ;;

  test)
    banner "单元测试"
    npm test
    ;;

  dist)
    banner "打包${PLATFORM:+（$PLATFORM）}"
    case "$PLATFORM" in
      ""|"$(node -p 'process.platform' 2>/dev/null || echo '')")
        npm run dist ;;
      win32|windows)
        npm run dist:win:x64 ;;
      win32-arm64)
        npm run dist:win:arm64 ;;
      darwin|mac|macos)
        npm run dist:portable:mac ;;
      win32-portable)
        npm run dist:portable:win ;;
      *)
        echo "unsupported platform: $PLATFORM" >&2; exit 1 ;;
    esac
    echo ">>> 安装包位于 release/"
    ;;

  help|*)
    cat <<EOF
用法：$0 <命令> [选项]

  fetch             有网机器：npm ci + 导出 npm 离线缓存
  deps [--offline]  安装依赖（--offline 时 ignore-scripts）
  build [--offline] deps + 编译
  test              单元测试
  dist [--platform win32|win32-arm64|darwin|win32-portable]
EOF
    ;;
esac
