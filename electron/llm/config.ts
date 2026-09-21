import process from "node:process";

export type PrivateLlmProvider = "ollama" | "vllm" | "xinference" | "openai-compatible";

export interface PrivateLlmConfig {
  enabled: boolean;
  provider: PrivateLlmProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** Runtime-only configuration; secrets are never persisted by this module. */
export function privateLlmConfig(): PrivateLlmConfig {
  const provider = (env("SKILL_RECORDER_LLM_PROVIDER") ?? "openai-compatible") as PrivateLlmProvider;
  const baseUrl = env("SKILL_RECORDER_LLM_BASE_URL") ?? "http://127.0.0.1:11434/v1";
  const model = env("SKILL_RECORDER_LLM_MODEL") ?? "qwen2.5vl:7b";
  const timeout = Number(env("SKILL_RECORDER_LLM_TIMEOUT_MS") ?? "180000");
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error("SKILL_RECORDER_LLM_BASE_URL must be an http(s) URL");
  if (!model) throw new Error("SKILL_RECORDER_LLM_MODEL is required");
  if (!Number.isFinite(timeout) || timeout < 1000) throw new Error("SKILL_RECORDER_LLM_TIMEOUT_MS must be >= 1000");
  return {
    enabled: env("SKILL_RECORDER_PRIVATE_MODE") === "1" || env("SKILL_RECORDER_LLM_BASE_URL") !== undefined,
    provider,
    baseUrl: baseUrl.replace(/\/$/, ""),
    model,
    apiKey: env("SKILL_RECORDER_LLM_API_KEY"),
    timeoutMs: timeout,
  };
}
