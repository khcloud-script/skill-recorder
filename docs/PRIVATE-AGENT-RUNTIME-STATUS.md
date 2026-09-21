# 私有 Agent Runtime 接入说明

新分支 `feat/private-agent-runtime` 新增 `electron/llm/agent-runtime.ts`，提供：

- `LlmProvider`：模型供应商抽象；
- `AgentRuntime`：多轮 Agent 执行抽象；
- OpenAI-compatible tool-call 循环；
- 文本消息和图片消息类型；
- 能力探测：models、tool calls、vision、structured output；
- 明确的私有模式前置检查，不进行云端回退。

当前仓库原有的 Describer/Builder 仍使用 Copilot SDK。将它们完整迁移到该 Runtime 需要把 SDK 的 Tool 类型、图片返回格式和各 Builder 的会话生命周期逐一转换；本提交不伪装成已经完成迁移。生产环境应先运行：

```bash
SKILL_RECORDER_PRIVATE_MODE=1 \
SKILL_RECORDER_LLM_PROVIDER=vllm \
SKILL_RECORDER_LLM_BASE_URL=http://gateway.internal/v1 \
SKILL_RECORDER_LLM_MODEL=qwen2.5-vl \
node --experimental-strip-types scripts/check-private-capabilities.mts
```

若能力探测失败，必须阻止上线；不得回退到 GitHub Copilot。

## 真实模型验收

在具备 Ollama/vLLM/Xinference 的内网环境执行：

```bash
npm run typecheck
npm run build
node --test --experimental-strip-types electron/llm/agent-runtime.test.ts
node --experimental-strip-types scripts/check-private-capabilities.mts
```

本执行环境无法访问真实内网模型，故真实模型端到端验收需要在目标内网 GPU/模型网关主机执行。
