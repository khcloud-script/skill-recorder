import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Private (intranet) LLM backend configuration.
 *
 * Skill Recorder analyzes recordings through an agent backend. Upstream defaults
 * to the GitHub Copilot CLI (cloud). For air-gapped / intranet deployments you
 * can point the app at any OpenAI-compatible endpoint instead (vLLM, Ollama,
 * Xinference, One-API routes, commercial gateways, …) — see
 * docs/私有化部署方案.md.
 *
 * Resolution order (first hit wins):
 *   1. Environment variables (deploy-friendly; see env table in the docs):
 *        SKILL_RECORDER_LLM_PROVIDER   — one of LLM_PRESETS ids or omitted
 *        SKILL_RECORDER_LLM_BASE_URL   — e.g. http://llm.intra.company/v1
 *        SKILL_RECORDER_LLM_API_KEY    — bearer token (any non-empty string for keyless servers)
 *        SKILL_RECORDER_LLM_MODEL      — chat model id (required unless the preset sets one)
 *        SKILL_RECORDER_LLM_VISION_MODEL — optional vision override for frame analysis
 *        SKILL_RECORDER_LLM_VISION     — "1"/"0" force-enable/disable image input
 *        SKILL_RECORDER_LLM_MAX_TOKENS — per-request output cap (default 8192)
 *   2. JSON config file at <LLM_CONFIG_FILE> (handy for non-technical users).
 *
 * Setting SKILL_RECORDER_LLM_PROVIDER=copilot explicitly (or nothing at all)
 * keeps the upstream Copilot CLI behavior.
 */

export interface LlmPreset {
  /** Stable id used in SKILL_RECORDER_LLM_PROVIDER. */
  id: string;
  /** Human label for logs / doctor output. */
  label: string;
  /** Default endpoint when SKILL_RECORDER_LLM_BASE_URL is not set. */
  baseUrl?: string;
  /** Suggested default model when SKILL_RECORDER_LLM_MODEL is not set. */
  defaultModel?: string;
  /** Whether a default deployment of this preset accepts image input. */
  visionDefault: boolean;
}

/**
 * Built-in provider presets. All of them speak the OpenAI chat-completions API,
 * so switching is a one-line environment change. `custom` covers any other
 * OpenAI-compatible gateway (One-API, LiteLLM, FastChat, Azure-style proxies…).
 */
export const LLM_PRESETS: LlmPreset[] = [
  {
    id: "vllm",
    label: "vLLM 自建推理集群",
    baseUrl: "http://127.0.0.1:8000/v1",
    visionDefault: true,
  },
  {
    id: "ollama",
    label: "Ollama 本地推理",
    baseUrl: "http://127.0.0.1:11434/v1",
    visionDefault: true,
  },
  {
    id: "xinference",
    label: "Xinference 推理平台",
    baseUrl: "http://127.0.0.1:9997/v1",
    visionDefault: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek (深度求索)",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    visionDefault: false,
  },
  {
    id: "qwen",
    label: "通义千问 DashScope",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-max",
    visionDefault: true,
  },
  {
    id: "zhipu",
    label: "智谱 GLM 开放平台",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-plus",
    visionDefault: true,
  },
  {
    id: "moonshot",
    label: "Kimi (Moonshot AI)",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-32k",
    visionDefault: false,
  },
  {
    id: "azure",
    label: "Azure OpenAI (企业自建/国际站)",
    visionDefault: true,
  },
  {
    id: "custom",
    label: "自定义 OpenAI 兼容网关",
    visionDefault: true,
  },
];

export interface PrivateLlmConfig {
  /** Preset id exactly as supplied (e.g. "vllm", "custom"). */
  provider: string;
  /** Display label of the resolved preset, or the provider id when unknown. */
  label: string;
  /** OpenAI-compatible base URL, ending in "/v1". Empty when unresolved. */
  baseUrl: string;
  /** Bearer token; may be empty for key-less intranet servers. */
  apiKey: string;
  /** Default chat model (undefined → backend default / fallback selection). */
  model?: string;
  /** Vision-capable model used for frame analysis (defaults to model). */
  visionModel?: string;
  /** Whether image input may be sent at all. */
  vision: boolean;
  /** Per-request output token cap. */
  maxTokens: number;
  /** Source the config came from ("env", "file", "env+file") — for logs only. */
  source: string;
}

/** Optional JSON config file for users who prefer files over env vars. */
export const LLM_CONFIG_FILE = path.join(os.homedir(), ".skill-recorder", "llm.config.json");

interface LlmConfigFile {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  visionModel?: string;
  vision?: boolean;
  maxTokens?: number;
}

function readConfigFile(): LlmConfigFile | null {
  try {
    if (!existsSync(LLM_CONFIG_FILE)) return null;
    const raw = JSON.parse(readFileSync(LLM_CONFIG_FILE, "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return null;
    return raw as LlmConfigFile;
  } catch {
    return null;
  }
}

const pick = (...vals: (string | undefined)[]): string | undefined => {
  for (const v of vals) if (v && v.trim()) return v.trim();
  return undefined;
};

/**
 * Resolve the private-LLM configuration. Returns null when private mode is not
 * enabled (i.e. the app should use the Copilot CLI backend). A non-null config
 * may still carry an empty baseUrl; the client reports a clear error at start.
 */
export function privateLlmConfig(): PrivateLlmConfig | null {
  const env = process.env;
  const file = readConfigFile() ?? {};

  let provider = pick(env.SKILL_RECORDER_LLM_PROVIDER, file.provider)?.toLowerCase();
  const baseUrl = pick(env.SKILL_RECORDER_LLM_BASE_URL, file.baseUrl);
  if (provider === "copilot") return null;
  if (!provider && !baseUrl && !file.apiKey && !env.SKILL_RECORDER_LLM_API_KEY) return null;
  provider ??= "custom";

  const preset = LLM_PRESETS.find((p) => p.id === provider);
  // SKILL_RECORDER_MODEL predates the private backend; honor it as an override.
  const model = pick(env.SKILL_RECORDER_LLM_MODEL, env.SKILL_RECORDER_MODEL, file.model, preset?.defaultModel);
  const visionModel = pick(env.SKILL_RECORDER_LLM_VISION_MODEL, file.visionModel, model);

  let vision = preset?.visionDefault ?? true;
  if (file.vision === false) vision = false;
  const visionEnv = env.SKILL_RECORDER_LLM_VISION?.trim().toLowerCase();
  if (visionEnv === "1" || visionEnv === "true") vision = true;
  if (visionEnv === "0" || visionEnv === "false") vision = false;

  const maxTokensRaw = Number(env.SKILL_RECORDER_LLM_MAX_TOKENS ?? file.maxTokens ?? 8192);
  const maxTokens = Number.isFinite(maxTokensRaw) && maxTokensRaw > 0 ? Math.floor(maxTokensRaw) : 8192;

  const sources = [env.SKILL_RECORDER_LLM_PROVIDER || env.SKILL_RECORDER_LLM_BASE_URL ? "env" : null, file.provider || file.baseUrl ? "file" : null].filter(Boolean);
  return {
    provider: provider,
    label: preset?.label ?? provider,
    baseUrl: baseUrl ?? preset?.baseUrl ?? "",
    apiKey: pick(env.SKILL_RECORDER_LLM_API_KEY, file.apiKey) ?? "",
    model,
    visionModel,
    vision,
    maxTokens,
    source: sources.length ? sources.join("+") : "env",
  };
}

/** Short, credential-free summary for doctor/logs; null when in Copilot mode. */
export function privateLlmSummary(): { label: string; baseUrl: string; model?: string } | null {
  const cfg = privateLlmConfig();
  if (!cfg) return null;
  return { label: cfg.label, baseUrl: cfg.baseUrl, model: cfg.model };
}
