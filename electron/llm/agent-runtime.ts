import { privateLlmConfig, type PrivateLlmConfig, type PrivateLlmProvider } from "./config";

export type ToolResult = string | { text: string; images?: ImagePart[] };
export interface ImagePart { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: "text"; text: string } | ImagePart>;
  tool_call_id?: string;
  name?: string;
}
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: unknown): Promise<ToolResult> | ToolResult;
}
export interface AgentTurnOptions { model?: string; timeoutMs?: number; maxToolRounds?: number; images?: ImagePart[] }
export interface AgentTurnResult { text: string; toolRounds: number; raw: unknown }

export interface LlmProvider {
  readonly id: PrivateLlmProvider;
  chat(messages: AgentMessage[], tools?: AgentTool[], options?: AgentTurnOptions): Promise<AgentTurnResult>;
  capabilities(): Promise<LlmCapabilities>;
  health(): Promise<void>;
}
export interface LlmCapabilities {
  provider: PrivateLlmProvider;
  models: string[];
  toolCalls: boolean;
  vision: boolean;
  structuredOutput: boolean;
}
export interface AgentRuntime {
  readonly provider: LlmProvider;
  run(messages: AgentMessage[], tools: AgentTool[], options?: AgentTurnOptions): Promise<AgentTurnResult>;
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => typeof v === "object" && v && "text" in v ? String((v as { text?: unknown }).text ?? "") : "").join("");
  return "";
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id: PrivateLlmProvider;
  constructor(private readonly config: PrivateLlmConfig = privateLlmConfig()) { this.id = config.provider; }

  async chat(messages: AgentMessage[], tools: AgentTool[] = [], options: AgentTurnOptions = {}): Promise<AgentTurnResult> {
    const max = options.maxToolRounds ?? 12;
    const history = [...messages];
    let rounds = 0;
    while (rounds <= max) {
      const body: Record<string, unknown> = {
        model: options.model ?? this.config.model,
        messages: history,
        temperature: 0,
        ...(tools.length ? { tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}),
      };
      const response = await this.request(body, options.timeoutMs);
      const choice = (response as { choices?: Array<{ message?: { content?: unknown; tool_calls?: ToolCall[] } }> }).choices?.[0]?.message;
      if (!choice) throw new Error("Private LLM returned no assistant message");
      const calls = choice.tool_calls ?? [];
      if (!calls.length) return { text: contentText(choice.content), toolRounds: rounds, raw: response };
      history.push({ role: "assistant", content: choice.content ?? "", ...(calls.length ? {} : {}) });
      for (const call of calls) {
        const tool = tools.find((candidate) => candidate.name === call.function.name);
        if (!tool) throw new Error(`Private LLM requested unavailable tool: ${call.function.name}`);
        let args: unknown;
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { throw new Error(`Invalid arguments for tool ${tool.name}`); }
        const result = await tool.execute(args);
        const text = typeof result === "string" ? result : result.text;
        history.push({ role: "tool", tool_call_id: call.id, name: tool.name, content: text });
      }
      rounds++;
    }
    throw new Error(`Private LLM exceeded ${max} tool-call rounds`);
  }

  async capabilities(): Promise<LlmCapabilities> {
    const response = await this.request({ model: this.config.model, messages: [{ role: "user", content: "capability probe" }], max_tokens: 1, tools: [{ type: "function", function: { name: "probe", description: "probe", parameters: { type: "object", properties: {} } } }] }, 15_000);
    const models = await this.models();
    const provider = this.config.provider;
    const toolCalls = Array.isArray((response as { choices?: Array<{ message?: { tool_calls?: unknown[] } }> }).choices?.[0]?.message?.tool_calls) || provider === "vllm" || provider === "xinference";
    return { provider, models, toolCalls, vision: /vl|vision|qwen2\.5vl|llava/i.test(this.config.model), structuredOutput: true };
  }

  async health(): Promise<void> { const response = await this.request({ model: this.config.model, messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 8 }, 15_000); if (!(response as { choices?: unknown[] }).choices?.length) throw new Error("Private LLM health response is empty"); }

  private async models(): Promise<string[]> {
    const response = await this.fetch("/models", undefined, 15_000);
    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    return (data.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
  }
  private async request(body: Record<string, unknown>, timeoutMs?: number): Promise<unknown> { const response = await this.fetch("/chat/completions", body, timeoutMs ?? this.config.timeoutMs); if (!response.ok) throw new Error(`Private LLM returned HTTP ${response.status}`); return response.json(); }
  private async fetch(path: string, body?: Record<string, unknown>, timeoutMs = this.config.timeoutMs): Promise<Response> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(`${this.config.baseUrl}${path}`, { method: body ? "POST" : "GET", signal: controller.signal, headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); } finally { clearTimeout(timer); }
  }
}
interface ToolCall { id: string; function: { name: string; arguments: string } }

export function privateAgentRuntime(): AgentRuntime {
  const config = privateLlmConfig();
  if (!config.enabled) throw new Error("Private Agent Runtime requires SKILL_RECORDER_PRIVATE_MODE=1");
  return { provider: new OpenAiCompatibleProvider(config), run(messages, tools, options) { return this.provider.chat(messages, tools, options); } };
}
