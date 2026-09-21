# 内网私有化部署

本目录提供 Skill Recorder 的内网部署方案。原项目默认通过 GitHub Copilot CLI 分析录制内容；私有化模式新增了独立的 OpenAI-compatible LLM 配置与客户端，支持 Ollama、vLLM、Xinference、LocalAI 以及任何兼容 `/v1/chat/completions` 的内部网关。

> 当前 Electron 的 Skill/Automation builder 仍依赖 Copilot SDK。若要求全链路零外联，请使用 `SKILL_RECORDER_PRIVATE_MODE=1` 并按本文档完成 builder 适配验收；默认安全策略会拒绝在私有模式下静默回退到 GitHub 云端。

## 方案选择

| 方案 | 适用场景 | 组件 |
| --- | --- | --- |
| 最简 | 单机验证、少量用户 | Electron + Ollama/vLLM |
| 完整 | 企业内网、多用户、审计、GPU 集群 | Electron 客户端 + LLM Gateway + vLLM/Ollama 集群 + 内网制品库 |

## 支持的模型后端

统一使用 OpenAI-compatible API：

- Ollama：`http://127.0.0.1:11434/v1`
- vLLM：`http://llm-gateway:8000/v1`
- Xinference：`http://xinference:9997/v1`
- LocalAI 或企业内部 LLM Gateway：填写其 `/v1` 地址

通过 `SKILL_RECORDER_LLM_PROVIDER`、`SKILL_RECORDER_LLM_BASE_URL`、`SKILL_RECORDER_LLM_MODEL` 切换，无需重新编译。

## 最简部署

### 1. 启动 Ollama

```bash
ollama serve
ollama pull qwen2.5vl:7b
```

### 2. 配置客户端

Linux/macOS：

```bash
export SKILL_RECORDER_PRIVATE_MODE=1
export SKILL_RECORDER_LLM_PROVIDER=ollama
export SKILL_RECORDER_LLM_BASE_URL=http://127.0.0.1:11434/v1
export SKILL_RECORDER_LLM_MODEL=qwen2.5vl:7b
export SKILL_RECORDER_LLM_API_KEY=local
npm start
```

Windows PowerShell：

```powershell
$env:SKILL_RECORDER_PRIVATE_MODE="1"
$env:SKILL_RECORDER_LLM_PROVIDER="ollama"
$env:SKILL_RECORDER_LLM_BASE_URL="http://127.0.0.1:11434/v1"
$env:SKILL_RECORDER_LLM_MODEL="qwen2.5vl:7b"
$env:SKILL_RECORDER_LLM_API_KEY="local"
npm start
```

### 3. 健康检查

```bash
node scripts/check-private-llm.mjs
```

## 完整部署

推荐拓扑：

```text
[办公终端 Electron]
        │ HTTPS/mTLS
        ▼
[内网 LLM Gateway / Nginx]
        │
 ┌──────┴────────┐
 ▼               ▼
[vLLM GPU-1]   [vLLM GPU-2]
        │
 [模型仓库/审计/限流]
```

建议：

1. LLM Gateway 只开放内网地址，禁止公网出口；
2. 使用 mTLS 或短期 API Token；
3. 为录制分析和 builder 分配独立模型路由；
4. 关闭请求体日志，或对日志做字段级脱敏；
5. 会话文件保存在终端本地，按组织策略配置 `SKILL_RECORDER_SESSIONS_DIR`；
6. 通过企业 npm 镜像缓存依赖，不在生产终端访问 npmjs.org；
7. 将 Node、Electron、模型权重和 npm 包放入经审核的内网制品库；
8. 首次上线前执行敏感信息 eval，确认文本和屏幕帧均不会出网。

## vLLM 示例

```bash
python -m vllm.entrypoints.openai.api_server \
  --model /models/Qwen2.5-VL-7B-Instruct \
  --served-model-name qwen2.5-vl \
  --host 0.0.0.0 --port 8000 \
  --enable-auto-tool-choice \
  --tool-call-parser hermes
```

客户端设置：

```bash
export SKILL_RECORDER_PRIVATE_MODE=1
export SKILL_RECORDER_LLM_PROVIDER=vllm
export SKILL_RECORDER_LLM_BASE_URL=https://llm-gateway.corp/v1
export SKILL_RECORDER_LLM_MODEL=qwen2.5-vl
export SKILL_RECORDER_LLM_API_KEY="$CORP_LLM_TOKEN"
```

## 构建与发布

开发构建：

```bash
npm ci
npm run check:lockfile
npm run compliance:licenses
npm run typecheck
npm run build
```

生产安装包：

```bash
npm run compliance:prepare
npm run dist
```

离线构建机应先把源码、`package-lock.json`、npm 缓存、Electron 缓存及合规材料导入内网，再执行：

```bash
npm ci --offline --ignore-scripts=false --strict-allow-scripts
npm run build
```

私有化部署辅助脚本：

```bash
bash scripts/deploy-private.sh --check-only
bash scripts/deploy-private.sh --build
```

## 切换模型

只改变环境变量即可：

```bash
# Ollama
export SKILL_RECORDER_LLM_PROVIDER=ollama
export SKILL_RECORDER_LLM_BASE_URL=http://ollama:11434/v1
export SKILL_RECORDER_LLM_MODEL=qwen2.5vl:7b

# vLLM
export SKILL_RECORDER_LLM_PROVIDER=vllm
export SKILL_RECORDER_LLM_BASE_URL=http://vllm:8000/v1
export SKILL_RECORDER_LLM_MODEL=qwen2.5-vl
```

## 安全边界

- 不要把 API Key 写入仓库或 `.env` 后提交；
- 私有模式下不要配置公网模型地址；
- 建议开启现有 Advanced protection，确保文本脱敏和 OCR 模糊链路生效；
- 生产环境将 `SKILL_RECORDER_PRIVATE_MODE=1` 固化到企业启动器；
- 任何组件若不能保证内网运行，应从生产镜像中移除，而不是依赖网络策略“碰巧阻断”。

## 验收清单

- [ ] DNS、证书和 LLM Gateway 仅内网可达；
- [ ] `check-private-llm.mjs` 返回 200；
- [ ] Ollama/vLLM 模型名与服务端一致；
- [ ] 录制、脱敏、分析、导出流程通过；
- [ ] 断开公网后仍可完成分析；
- [ ] `npm run typecheck`、`npm run build`、`npm test` 通过；
- [ ] 审计日志不包含录制帧、剪贴板原文和 Token。
