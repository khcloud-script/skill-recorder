#!/usr/bin/env bash
set -Eeuo pipefail

mode="build"
if [[ "${1:-}" == "--check-only" ]]; then mode="check"; fi
if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: $0 [--check-only|--build]"; exit 0
fi

: "${SKILL_RECORDER_PRIVATE_MODE:=1}"
export SKILL_RECORDER_PRIVATE_MODE

if [[ "$mode" == "check" ]]; then
  node scripts/check-private-llm.mjs
  exit 0
fi

npm run check:lockfile
npm ci --ignore-scripts=false --strict-allow-scripts
npm run compliance:licenses
npm run typecheck
npm run build
node scripts/check-private-llm.mjs
printf '%s\n' "Private Skill Recorder build completed."
