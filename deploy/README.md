# deploy/ —— 私有化部署资源索引

完整说明见：

- **部署方案**：`docs/私有化部署方案.md`（架构、最简/完整方案、模型选型、安全、FAQ）
- **离线编译**：`docs/离线编译与打包.md`

本目录内容：

| 路径 | 用途 |
| --- | --- |
| `minimal/skill-recorder.env.example` | 客户端环境变量模板（9 个厂商预设全量注释） |
| `minimal/llm.config.json.example` | 客户端配置文件模板（`~/.skill-recorder/llm.config.json`） |
| `minimal/run-private.sh` | Linux/macOS 启动包装：加载 env 后启动应用（或 `--dev` 开发模式） |
| `scripts/check-llm.sh` | 服务端冒烟自检：`/models` 可达性 + 工具调用握手 |
| `scripts/build-offline.sh` | 有网/内网两阶段的依赖收集、离线构建与打包 |
| `full/docker-compose.yml` | 完整方案：vLLM 视觉/文本双模型 + LiteLLM 统一网关 |
| `full/litellm-config.yaml` | 网关路由示例（模型别名、fallback、master key） |

## 三分钟跑通（核验单）

1. **服务端**（一台有 GPU 的机器）：
   ```bash
   ollama pull qwen2.5vl:32b
   OLLAMA_HOST=0.0.0.0:11434 ollama serve &
   deploy/scripts/check-llm.sh http://127.0.0.1:11434/v1 qwen2.5vl:32b
   ```
2. **客户端**（构建或直接使用本仓库源码）：
   ```bash
   export SKILL_RECORDER_LLM_PROVIDER=ollama
   export SKILL_RECORDER_LLM_BASE_URL=http://<服务器IP>:11434/v1
   export SKILL_RECORDER_LLM_MODEL=qwen2.5vl:32b
   npm run dev        # 开发态
   ```
3. 录制 10 秒 → Analyze；应用主界面出现分析结果、doc/doctor 里显示
   `Ollama 本地推理 · http://… · model qwen2.5vl:32b` 即成功。
