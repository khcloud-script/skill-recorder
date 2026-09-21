import { CopilotClient, type CopilotSession } from "@github/copilot-sdk";

import { COPILOT_SIGNED_OUT_ERROR } from "../../common/ipc";
import { copilotConnectionOption, withStartupTimeout } from "../copilot-cli-path";
import { createLogger } from "../logger";
import { privateLlmConfig } from "../llm/config";
import { PrivateAgentSession, privateModeEnabled, type AgentSession } from "../llm/private-session";

export interface BaseLive {
  sessionId: string;
  copilot: AgentSession;
}

const MAX_LIVE_SESSIONS = 4;

export abstract class AgentBuilder<TLive extends BaseLive> {
  private client: CopilotClient | null = null;
  private clientStart: Promise<CopilotClient> | null = null;
  protected model: string | undefined;
  protected readonly live = new Map<string, TLive>();
  protected readonly active = new Set<string>();
  protected readonly log;

  constructor(private readonly name: string) { this.log = createLogger(name); }
  isBuilding(sessionId: string): boolean { return this.active.has(sessionId); }
  async cancel(sessionId: string): Promise<void> { const live = this.live.get(sessionId); if (live) await live.copilot.abort().catch(() => undefined); }
  async forget(sessionId: string): Promise<void> { await this.disposeLive(sessionId); }
  async evictIdle(): Promise<void> { for (const [id, live] of this.live) { if (this.active.has(id)) continue; this.live.delete(id); await live.copilot.disconnect().catch(() => undefined); } }
  async dispose(): Promise<void> { for (const [id] of this.live) await this.disposeLive(id); if (this.client) await this.client.stop().catch(() => undefined); this.client = null; this.clientStart = null; }

  protected async ensureSession(systemContent: string, tools: import("@github/copilot-sdk").Tool[]): Promise<AgentSession> {
    if (privateModeEnabled()) return new PrivateAgentSession(systemContent, tools, privateLlmConfig().model);
    const client = await this.ensureClient();
    return client.createSession({
      systemMessage: { mode: "append", content: systemContent }, tools, onPermissionRequest: (await import("@github/copilot-sdk")).approveAll,
      enableHostGitOperations: false, infiniteSessions: { enabled: false }, availableTools: tools.map((t) => t.name),
      ...(this.model ? { model: this.model } : {}),
    });
  }

  protected async ensureClient(): Promise<CopilotClient> {
    if (privateModeEnabled()) throw new Error("Private mode must not initialize the GitHub Copilot SDK");
    if (this.client) return this.client;
    if (this.clientStart) return this.clientStart;
    this.clientStart = (async () => {
      const client = new CopilotClient(copilotConnectionOption());
      await withStartupTimeout(client.start(), `Copilot CLI (${this.name})`);
      const auth = await client.getAuthStatus();
      if (!auth.isAuthenticated) { await client.stop().catch(() => undefined); throw new Error(COPILOT_SIGNED_OUT_ERROR); }
      this.model = process.env.SKILL_RECORDER_MODEL || undefined;
      this.log.info("Copilot ready", auth.login ? `as ${auth.login}` : ""); this.client = client; return client;
    })();
    try { return await this.clientStart; } catch (err) { this.clientStart = null; throw err; }
  }

  protected registerLive(live: TLive): void { this.live.set(live.sessionId, live); for (const [id, item] of this.live) { if (this.live.size <= MAX_LIVE_SESSIONS) break; if (id === live.sessionId || this.active.has(id)) continue; this.live.delete(id); void item.copilot.disconnect().catch(() => undefined); } }
  protected async disposeLive(sessionId: string): Promise<void> { const live = this.live.get(sessionId); if (!live) return; this.live.delete(sessionId); await live.copilot.disconnect().catch(() => undefined); }
}
