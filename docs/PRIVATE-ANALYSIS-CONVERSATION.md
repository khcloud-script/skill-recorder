# Skill Recorder 私有化改造分析对话记录

> 记录日期：2026-09-21  
> 仓库：[`khcloud-script/skill-recorder`](https://github.com/khcloud-script/skill-recorder)  
> 上游仓库：[`microsoft/skill-recorder`](https://github.com/microsoft/skill-recorder)  
> 工作分支：`feat/private-llm-deployment`

## 1. 用户目标

用户希望将微软的 Skill Recorder 改造为适合内网私有化部署的版本，主要要求如下：

1. 支持在企业内网环境中私有化部署；
2. 支持多种私有化大模型，并能够方便切换；
3. 提供最简部署方案和完整企业级部署方案；
4. 提供编译、打包、部署相关文档和脚本；
5. 参考项目中的 Copilot 分析文档进行改造。

## 2. 项目分析结论

Skill Recorder 是一个 Electron 桌面应用，主要技术栈为：

- TypeScript：主要业务语言；
- React：渲染层 UI；
- Electron：桌面应用运行时；
- Vite：前端和 Electron 构建；
- Electron Builder：安装包生成；
- Node.js 24：项目要求的运行时；
- `@github/copilot-sdk`：当前 AI Agent 调用入口；
- GitHub Copilot CLI：当前默认的模型和 Agent Runtime；
- `zod`：分析结果、技能和自动化计划的结构校验；
- Tesseract.js、Sharp、Transformers：本地 OCR、图像和敏感信息处理能力。

关键目录和文件：

```text
common/
  analysis.ts             分析结果和步骤的稳定数据结构
  bundle.ts               录制事件和帧关联后的输入 Bundle
  ipc.ts                  主进程与渲染进程之间的 IPC 契约

electron/
  main.ts                 Electron 主进程入口
  ipc.ts                  IPC Handler 注册和业务编排
  pipeline.ts             录制停止后的 Bundle 生成流程
  describer/
    describer.ts          录制内容分析 Agent
    instructions.ts       分析 Agent 系统提示词
    tools.ts              分析 Agent 可调用的本地工具
  builders/
    agent-builder.ts      Skill/Automation Builder 的共享 Copilot 客户端
  skillbuilder/           Skill 生成流程
  automationbuilder/      Automation 生成流程
  sensitive/               敏感信息检测、文本脱敏和画面模糊

scripts/
  构建、合规、Electron 安装和发布辅助脚本

docs/
  项目文档和部署文档
```

## 3. 当前 AI 调用链路

原项目的分析链路不是普通的 HTTP LLM 调用，而是基于 GitHub Copilot SDK 的多轮 Agent：

```text
录制文件
  ↓
processSession()
  ↓
bundle.json + description.md
  ↓
Describer.analyze()
  ↓
CopilotClient
  ↓
GitHub Copilot CLI
  ↓
get_timeline / get_events / get_frames / get_narration
  ↓
submit_analysis()
  ↓
analysis.json
  ↓
SkillBuilder / AutomationBuilder
```

已确认的核心代码模式：

- `electron/describer/describer.ts` 直接创建 `CopilotClient`；
- `electron/builders/agent-builder.ts` 为 Skill Builder 和 Automation Builder 共享 `CopilotClient`；
- `electron/copilot-cli-path.ts` 负责定位随应用打包的 Copilot CLI；
- `electron/copilot-signin*.ts` 负责 GitHub Copilot 登录和认证；
- `SKILL_RECORDER_MODEL` 只能覆盖 Copilot CLI 使用的模型，不能替换 Copilot SDK；
- `electron/describer/tools.ts` 已经把录制事件、终端输出、旁白和屏幕帧封装成受限工具；
- `electron/ipc.ts` 在分析前执行敏感信息扫描，并将文本脱敏和画面模糊策略传入 Describer。

## 4. 已发现的文档问题

用户提到的文件：

```text
docs/skill-recorder_copilot分析.md
```

以及：

```text
dsocs/skill-recorder_copilot分析.md
```

在上游仓库和 Fork 的 `main` 分支中均未找到该文件。因此本次改造依据以下实际代码和文档进行：

- `README.md`；
- `INSTALL.md`；
- `RELEASING.md`；
- `evals/README.md`；
- `electron/describer/describer.ts`；
- `electron/describer/instructions.ts`；
- `electron/describer/tools.ts`；
- `electron/builders/agent-builder.ts`；
- `electron/skillbuilder/builder.ts`；
- `electron/automationbuilder/builder.ts`；
- `electron/ipc.ts`；
- `common/analysis.ts`；
- `common/ipc.ts`；
- `package.json`；
- `vite.config.ts`；
- `tsconfig.json`。

## 5. 已完成的第一阶段修改

已在分支 `feat/private-llm-deployment` 提交以下文件：

```text
docs/PRIVATE-DEPLOYMENT.md
docs/PRIVATE-LLM-ARCHITECTURE.md
electron/llm/config.ts
electron/llm/openai-compatible.ts
scripts/check-private-llm.mjs
scripts/deploy-private.sh
```

对应提交：

```text
7a4e43d3b3b459a063d0589e375c2bb0310da9b5
```

提交地址：

<https://github.com/khcloud-script/skill-recorder/commit/7a4e43d3b3b459a063d0589e375c2bb0310da9b5>

### 5.1 私有模型配置

新增的配置读取逻辑支持以下环境变量：

| 环境变量 | 作用 |
| --- | --- |
| `SKILL_RECORDER_PRIVATE_MODE` | 设置为 `1` 时启用私有模式 |
| `SKILL_RECORDER_LLM_PROVIDER` | `ollama`、`vllm`、`xinference` 或 `openai-compatible` |
| `SKILL_RECORDER_LLM_BASE_URL` | 内部 LLM Gateway 的 HTTP(S) 地址 |
| `SKILL_RECORDER_LLM_MODEL` | 服务端暴露的模型名称 |
| `SKILL_RECORDER_LLM_API_KEY` | 内部网关 Token，不写入仓库 |
| `SKILL_RECORDER_LLM_TIMEOUT_MS` | 请求超时时间 |

示例：

```bash
export SKILL_RECORDER_PRIVATE_MODE=1
export SKILL_RECORDER_LLM_PROVIDER=ollama
export SKILL_RECORDER_LLM_BASE_URL=http://127.0.0.1:11434/v1
export SKILL_RECORDER_LLM_MODEL=qwen2.5vl:7b
export SKILL_RECORDER_LLM_API_KEY=local
```

### 5.2 OpenAI-compatible 客户端

`electron/llm/openai-compatible.ts` 提供了不增加第三方依赖的 HTTP 客户端，当前支持：

- `POST /v1/chat/completions`；
- system/user/assistant 消息；
- Bearer Token；
- 请求超时和 AbortController；
- HTTP 错误检查；
- 基础响应结构检查；
- 私有网关健康检查。

这使 Ollama、vLLM、Xinference、LocalAI 和企业内部兼容网关可以使用同一配置契约。

### 5.3 健康检查和部署脚本

健康检查：

```bash
node scripts/check-private-llm.mjs
```

私有部署检查和构建：

```bash
bash scripts/deploy-private.sh --check-only
bash scripts/deploy-private.sh --build
```

## 6. 已提供的部署方案

### 6.1 最简单机方案

适用于开发验证或少量用户：

```text
同一台机器
  ├── Skill Recorder Electron
  └── Ollama + 视觉语言模型
```

典型流程：

```bash
ollama serve
ollama pull qwen2.5vl:7b
npm ci
npm run compliance:licenses
npm run build
node scripts/check-private-llm.mjs
npm start
```

### 6.2 完整企业内网方案

适用于多用户、GPU 集群、审计和统一模型路由：

```text
办公终端 Electron
        │ HTTPS/mTLS
        ▼
内网 LLM Gateway / Nginx
        │
  ┌─────┴─────┐
  ▼           ▼
vLLM GPU-1  vLLM GPU-2
        │
模型仓库 / 审计 / 限流
```

部署建议：

1. LLM Gateway 只开放内网地址；
2. 使用 mTLS 或短期 Token；
3. 关闭原始请求体日志；
4. 会话数据保存在终端本地；
5. 使用内网 npm 镜像和内网 Electron 缓存；
6. 将模型权重、Node.js、Electron 和 npm 包纳入企业制品库；
7. 在断开公网的环境中执行最终验收；
8. 保留现有本地敏感信息扫描、文本脱敏和 OCR 模糊链路。

## 7. 重要未完成项

第一阶段并未改变现有 AI Agent 的实际调用路径。当前新增客户端是基础设施和配置契约，还没有被以下模块完全接管：

- `electron/describer/describer.ts`；
- `electron/builders/agent-builder.ts`；
- `electron/skillbuilder/builder.ts`；
- `electron/automationbuilder/builder.ts`。

因此，当前版本还不能宣称已经完成“全链路零外联”的私有化部署。若要真正满足该要求，下一阶段必须完成：

1. 实现统一的 `LlmProvider` / `AgentRuntime` 抽象；
2. 将 Describer、SkillBuilder、AutomationBuilder 接入私有 Agent Runtime；
3. 实现工具调用、视觉输入和结构化输出适配；
4. 私有模式下禁止初始化 `@github/copilot-sdk`；
5. 私有模式下禁止静默回退到 GitHub Copilot 云端；
6. 增加 Ollama、vLLM、Xinference 的 tool-call 能力检测；
7. 增加模型切换 IPC 和 UI 配置；
8. 增加断网运行测试；
9. 修正并验证健康检查脚本、TypeScript 类型检查和构建流程；
10. 在真实内网模型上运行描述器、Skill Builder 和 Automation Builder 的端到端测试。

## 8. 推荐后续实施顺序

```text
第一步：定义 LlmProvider 和 AgentRuntime 接口
  ↓
第二步：实现 OpenAI-compatible Chat Provider
  ↓
第三步：实现工具调用和结构化输出协议
  ↓
第四步：迁移 Describer
  ↓
第五步：迁移 SkillBuilder / AutomationBuilder
  ↓
第六步：私有模式阻断 Copilot SDK 和公网回退
  ↓
第七步：补充 IPC/UI 模型配置
  ↓
第八步：断网、脱敏、视觉和构建验收
```

## 9. 当前验证清单

### 已完成

- [x] Fork 仓库已确认；
- [x] `main` 默认分支已确认；
- [x] `feat/private-llm-deployment` 分支已创建；
- [x] 私有 LLM 配置模块已提交；
- [x] OpenAI-compatible 客户端已提交；
- [x] 健康检查脚本已提交；
- [x] 私有部署脚本已提交；
- [x] 最简和完整部署文档已提交；
- [x] 已明确当前实现尚未完成全链路 Agent 替换。

### 待验证

- [ ] `npm run typecheck`；
- [ ] `npm run build`；
- [ ] `npm test`；
- [ ] `node scripts/check-private-llm.mjs`；
- [ ] Ollama 视觉模型调用；
- [ ] vLLM tool-call 调用；
- [ ] Xinference 兼容性；
- [ ] 断开公网后的完整录制和分析；
- [ ] 私有模式下无 Copilot CLI 初始化；
- [ ] 私有模式下无公网回退；
- [ ] 屏幕帧、剪贴板和终端敏感信息不出网；
- [ ] Windows、macOS、Ubuntu 构建和安装包验证。

## 10. 结论

本次分析确认：Skill Recorder 的私有化改造重点不是简单替换一个模型 URL，而是替换当前基于 Copilot CLI 的 Agent Runtime，同时保持本地录制、事件工具、屏幕帧脱敏、结构化分析结果和 Skill/Automation 生成能力不变。

已提交的第一阶段代码为后续完整迁移提供了配置、客户端、健康检查和部署文档基础；在完成 Describer 和两个 Builder 的 Agent Runtime 迁移之前，不应将其作为已经完成全链路私有化的生产版本使用。
