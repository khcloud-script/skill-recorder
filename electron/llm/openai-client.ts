import type { Tool } from "@github/copilot-sdk";

import { createLogger } from "../logger";
import type { PrivateLlmConfig } from "./config";
import type {
  AgentAuthStatus,
  AgentClient,
  AgentModelInfo,
  AgentSession,
  AgentSessionConfig,
} from "./types";

/**
 * OpenAI-compatible agent backend for intranet / air-gapped deployments.
 * Implements the same AgentClient surface as the Copilot CLI backend, driving a
 * plain chat-completions tool loop against any OpenAI-compatible endpoint
 * (vLLM, Ollama, Xinference, One-API gateways, …). Only the sandboxed custom
 * tools this app passes in are callable — there is no shell/file tool surface.
 */

/** Hard cap on tool iterations within one turn; prevents runaway loops. */
const MAX_TOOL_STEPS = 60;

const log = createLogger("OpenAIAgent");

/* ---- wire-format types ---- */

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ToolCallWire {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  tool_calls?: ToolCallWire[];
  tool_call_id?: string;
}

interface AssistantMessage {
  content?: string | null;
  tool_calls?: ToolCallWire[];
}

interface ChatCompletion {
  choices?: {
    message?: AssistantMessage;
    finish_reason?: string;
  }[];
}

/** The two shapes this app's tool handlers may return. */
interface StructuredToolResult {
  textResultForLlm: string;
  binaryResultsForLlm?: { data: string; mimeType: string; type: string; description?: string }[];
  resultType?: string;
}

const isStructured = (r: unknown): r is StructuredToolResult =>
  typeof r === "object" && r !== null && typeof (r as StructuredToolResult).textResultForLlm === "string";

export class OpenAIAgentClient implements AgentClient {
  constructor(private readonly cfg: PrivateLlmConfig) {}

  /** Verify connectivity + credentials early, so failures are clear at setup. */
  async start(): Promise<void> {
    if (!this.cfg.baseUrl) {
      throw new Error(
        "Private LLM endpoint is not configured. Set SKILL_RECORDER_LLM_BASE_URL " +
          "(e.g. http://llm.intra.company:8000/v1) or fill in " +
          "~/.skill-recorder/llm.config.json. See docs/私有化部署方案.md.",
      );
    }
    const models = await this.listModels();
    log.info(
      `connected to ${this.cfg.label} at ${this.cfg.baseUrl} — ${models.length} model(s) reachable` +
        (this.cfg.model ? `, using "${this.cfg.model}"` : ""),
    );
  }

  async stop(): Promise<void> {
    // Stateless HTTP backend — nothing to tear down.
  }

  /** The API key is the credential; there is no interactive sign-in step. */
  async getAuthStatus(): Promise<AgentAuthStatus> {
    return { isAuthenticated: true, login: this.cfg.label };
  }

  async listModels(): Promise<AgentModelInfo[]> {
    const res = await this.get<unknown>("/models");
    const data = (res as { data?: unknown })?.data;
    if (!Array.isArray(data)) return [];
    return data
      .map((m) => ({ id: String((m as { id?: unknown })?.id ?? "") }))
      .filter((m) => m.id)
      .map((m) => ({
        id: m.id,
        // OpenAI's /models carries no capability flags; trust the deployment
        // config (SKILL_RECORDER_LLM_VISION) for that decision.
        capabilities: { supports: { vision: this.cfg.vision } },
      }));
  }

  async createSession(config: AgentSessionConfig): Promise<AgentSession> {
    return new OpenAIAgentSession(this.cfg, config);
  }

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${this.cfg.baseUrl.replace(/\/+$/, "")}${path}`, {
        headers: { ...this.authHeader() },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Cannot reach the private LLM at ${this.cfg.baseUrl} (${res.status}): ${body.slice(0, 300)}. ` +
            "Check SKILL_RECORDER_LLM_BASE_URL / SKILL_RECORDER_LLM_API_KEY.",
        );
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`The private LLM at ${this.cfg.baseUrl} did not answer within 10s. Is it running?`);
      }
      throw err instanceof Error && err.message.includes("private LLM")
        ? err
        : new Error(
            `Cannot connect to the private LLM at ${this.cfg.baseUrl}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
    } finally {
      clearTimeout(timer);
    }
  }

  private authHeader(): Record<string, string> {
    return this.cfg.apiKey ? { Authorization: `Bearer ${this.cfg.apiKey}` } : {};
  }
}

class OpenAIAgentSession implements AgentSession {
  private readonly messages: ChatMessage[] = [];
  private readonly tools = new Map<string, Tool>();
  private readonly openaiTools: unknown[] = [];
  private readonly model?: string;
  private aborted = false;
  private inflight: AbortController | null = null;

  constructor(
    private readonly cfg: PrivateLlmConfig,
    session: AgentSessionConfig,
  ) {
    this.messages.push({ role: "system", content: session.systemMessage.content });
    for (const t of session.tools ?? []) {
      this.tools.set(t.name, t);
      this.openaiTools.push({
        type: "function",
        function: {
          name: t.name,
          description: t.description ?? "",
          parameters:
            t.parameters && typeof t.parameters === "object"
              ? t.parameters
              : { type: "object", properties: {} },
        },
      });
    }
    this.model =
      (typeof session.model === "string" && session.model) || this.cfg.model || undefined;
    if (!this.model) {
      throw new Error(
        "No chat model configured. Set SKILL_RECORDER_LLM_MODEL to a model served by " +
          `${this.cfg.label} (e.g. qwen3, glm-4v, deepseek-chat…).`,
      );
    }
  }

  async sendAndWait(prompt: string, timeoutMs = 180_000): Promise<void> {
    this.aborted = false;
    this.messages.push({ role: "user", content: prompt });
    const deadline = Date.now() + timeoutMs;

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      if (this.aborted) throw new Error("aborted");
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`Turn timed out after ${timeoutMs / 1000}s`);

      const message = await this.complete(remaining);
      if (this.aborted) throw new Error("aborted");

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        if (message.content) {
          this.messages.push({ role: "assistant", content: message.content });
        }
        return;
      }

      // Record the assistant turn exactly as received, then run each tool call
      // (sequentially keeps ordering/dedup semantics identical to the CLI).
      this.messages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        await this.runToolCall(call);
        if (this.aborted) throw new Error("aborted");
      }
    }
    throw new Error(`The model kept calling tools after ${MAX_TOOL_STEPS} steps; aborting the turn.`);
  }

  async abort(): Promise<void> {
    this.aborted = true;
    this.inflight?.abort();
  }

  async disconnect(): Promise<void> {
    await this.abort();
    this.messages.length = 0;
  }

  /** One chat-completion request against the configured endpoint. */
  private async complete(remainingMs: number): Promise<AssistantMessage> {
    const controller = new AbortController();
    this.inflight = controller;
    const timer = setTimeout(() => controller.abort(), remainingMs);
    try {
      const res = await fetch(`${this.cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.cfg.apiKey ? { Authorization: `Bearer ${this.cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages: this.messages,
          tools: this.openaiTools.length ? this.openaiTools : undefined,
          tool_choice: this.openaiTools.length ? "auto" : undefined,
          temperature: 0.2,
          max_tokens: this.cfg.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `LLM request failed (${res.status} ${res.statusText}) at ${this.cfg.baseUrl}: ${body.slice(0, 500)}`,
        );
      }
      const json = (await res.json()) as ChatCompletion;
      const message = json.choices?.[0]?.message;
      if (!message) throw new Error("The LLM returned an empty completion.");
      return message;
    } finally {
      clearTimeout(timer);
      this.inflight = null;
    }
  }

  /** Execute one local sandboxed tool and append its result message(s). */
  private async runToolCall(call: ToolCallWire): Promise<void> {
    const tool = this.tools.get(call.function.name);
    let args: unknown = {};
    try {
      args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      args = {};
    }

    let result: unknown;
    if (!tool || typeof tool.handler !== "function") {
      result = `Unknown tool "${call.function.name}". Available: ${[...this.tools.keys()].join(", ")}.`;
    } else {
      try {
        result = await (tool.handler as (a: unknown) => unknown | Promise<unknown>)(args);
      } catch (err) {
        result = `Tool "${call.function.name}" failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    if (isStructured(result)) {
      let text = result.textResultForLlm;
      if (result.resultType === "failure") text = `Tool failed. ${text}`;
      const images = result.binaryResultsForLlm ?? [];
      const usable = images.filter((i) => i.data && i.mimeType);
      if (usable.length > 0 && !this.cfg.vision) {
        text +=
          `\n\n(This tool also attached ${usable.length} image(s), but the configured model is used in ` +
          "text-only mode, so they were omitted. Enable a vision-capable deployment with " +
          "SKILL_RECORDER_LLM_VISION_MODEL / SKILL_RECORDER_LLM_VISION=1 to view screen frames.)";
        this.messages.push({ role: "tool", tool_call_id: call.id, content: text });
        return;
      }
      this.messages.push({ role: "tool", tool_call_id: call.id, content: text });
      // Tool-role messages cannot carry images in the OpenAI chat API, so the
      // frames go out as a follow-up user turn with inline data-URL parts.
      if (usable.length > 0) {
        this.messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `Tool "${call.function.name}" attached ${usable.length} image(s) from the recording:`,
            },
            ...usable.map<ContentPart>((img) => ({
              type: "image_url",
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
          ],
        });
      }
      return;
    }
    this.messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: typeof result === "string" ? result : JSON.stringify(result),
    });
  }
}
