import type { Tool } from "@github/copilot-sdk";

/**
 * The agent runtime abstraction used by the Describer and the Skill/Automation
 * builders. There are two implementations: the GitHub Copilot CLI backend (the
 * upstream default, via @github/copilot-sdk) and the OpenAI-compatible private
 * backend (electron/llm/openai-client.ts) for intranet deployments. Only the
 * surface the app actually uses is declared here, so either backend fits.
 */

export interface AgentAuthStatus {
  isAuthenticated: boolean;
  login?: string;
}

export interface AgentModelInfo {
  id: string;
  capabilities?: { supports?: { vision?: boolean } };
  policy?: { state?: string };
}

export interface AgentSessionConfig {
  systemMessage: { mode: "append" | "replace"; content: string };
  tools: Tool[];
  model?: string;
  /** Copilot-CLI-only options (onPermissionRequest, workingDirectory, …) are
   *  accepted here and ignored by the private backend. */
  [key: string]: unknown;
}

export interface AgentSession {
  /** Append a user turn and run the tool loop until the model stops calling tools. */
  sendAndWait(prompt: string, timeoutMs?: number): Promise<unknown>;
  /** Cancel the in-flight turn; the session stays usable afterwards. */
  abort(): Promise<void>;
  /** Release the conversation. */
  disconnect(): Promise<void>;
}

export interface AgentClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  getAuthStatus(): Promise<AgentAuthStatus>;
  listModels(): Promise<AgentModelInfo[]>;
  createSession(config: AgentSessionConfig): Promise<AgentSession>;
}
