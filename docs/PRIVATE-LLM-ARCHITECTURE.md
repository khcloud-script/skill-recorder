# 私有化改造说明

- `electron/llm/config.ts`：统一读取私有模型配置。
- `electron/llm/openai-compatible.ts`：无额外依赖的 OpenAI-compatible HTTP 客户端。
- `scripts/check-private-llm.mjs`：模型网关健康检查。
- `scripts/deploy-private.sh`：内网构建和部署前检查。
- `docs/PRIVATE-DEPLOYMENT.md`：最简、完整、离线构建和安全验收方案。

说明：此提交先提供稳定的 Provider 配置契约和网关健康检查，不会改变既有 Copilot SDK 行为。要将描述器和两个 builder 完全切换到私有模型，需要针对内部模型的 vision、tool-call 和 structured-output 能力做兼容性验收；生产模式不应在私有模式下静默回退到 GitHub 云端。
