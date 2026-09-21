import type { Tool } from "@github/copilot-sdk";
import type { AgentMessage, AgentRuntime, AgentTool, AgentTurnOptions, ToolResult } from "./agent-runtime";
import { privateAgentRuntime } from "./agent-runtime";

export interface AgentSession {
  sendAndWait(prompt: string, timeoutMs?: number): Promise<void>;
  abort(): Promise<void>;
  disconnect(): Promise<void>;
}

function toResult(value: unknown): ToolResult {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return JSON.stringify(value ?? null);
  const record = value as Record<string, unknown>;
  const text = typeof record.textResultForLlm === "string"
    ? record.textResultForLlm
    : typeof record.text === "string" ? record.text : JSON.stringify(value);
  const binaries = Array.isArray(record.binaryResultsForLlm) ? record.binaryResultsForLlm : [];
  const images = binaries.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const image = item as { data?: unknown; mimeType?: unknown };
    if (typeof image.data !== "string") return [];
    const mime = typeof image.mimeType === "string" ? image.mimeType : "image/jpeg";
    return [{ type: "image_url" as const, image_url: { url: `data:${mime};base64,${image.data}`, detail: "auto" as const } }];
  });
  return images.length ? { text, images } : text;
}

export function privateModeEnabled(): boolean {
  return process.env.SKILL_RECORDER_PRIVATE_MODE === "1";
}

export function adaptTools(tools: Tool[]): AgentTool[] {
  return tools.map((tool) => {
    const candidate = tool as unknown as { name: string; description?: string; parameters?: Record<string, unknown>; handler?: (args: unknown) => unknown };
    return {
      name: candidate.name,
      description: candidate.description ?? candidate.name,
      parameters: candidate.parameters ?? { type: "object", properties: {}, additionalProperties: false },
      execute: async (args: unknown) => toResult(await candidate.handler?.(args)),
    };
  });
}

export class PrivateAgentSession implements AgentSession {
  private readonly runtime: AgentRuntime;
  private readonly messages: AgentMessage[];
  private readonly tools: AgentTool[];
  private aborted = false;

  constructor(systemMessage: string, tools: Tool[], private readonly model?: string) {
    this.runtime = privateAgentRuntime();
    this.messages = [{ role: "system", content: systemMessage }];
    this.tools = adaptTools(tools);
  }

  async sendAndWait(prompt: string, timeoutMs?: number): Promise<void> {
    if (this.aborted) throw new Error("Private agent session aborted");
    this.messages.push({ role: "user", content: prompt });
    const options: AgentTurnOptions = { model: this.model, timeoutMs };
    const result = await this.runtime.run(this.messages, this.tools, options);
    this.messages.push({ role: "assistant", content: result.text });
  }

  async abort(): Promise<void> { this.aborted = true; }
  async disconnect(): Promise<void> { this.aborted = true; }
}
