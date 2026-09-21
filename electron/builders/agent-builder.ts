import { startAgentBackend } from "../llm/factory";
import type { AgentClient, AgentSession } from "../llm/types";
import { createLogger } from "../logger";

/**
 * Shared plumbing for the final-stage, multi-turn builders (Skill Builder and
 * Automation Builder). Owns one lazily-started agent client — the Copilot CLI
 * backend by default, or the configured private OpenAI-compatible endpoint in
 * intranet deployments (see electron/llm/) — and a small pool of live
 * conversations, one per recording, so each build's plan → refine → create flow
 * stays in a single session. Subclasses add the build-specific tools, system
 * prompt, and `build`/`create` turns; everything below is common.
 */

/** The minimum every live build carries so the pool can manage it. */
export interface BaseLive {
  sessionId: string;
  copilot: AgentSession;
}

const MAX_LIVE_SESSIONS = 4;

export abstract class AgentBuilder<TLive extends BaseLive> {
  private client: AgentClient | null = null;
  private clientStart: Promise<AgentClient> | null = null;
  protected model: string | undefined;
  protected readonly live = new Map<string, TLive>();
  protected readonly active = new Set<string>();
  protected readonly log;

  /** @param name Used for logs and the "not signed in" / startup-timeout messages. */
  constructor(private readonly name: string) {
    this.log = createLogger(name);
  }

  isBuilding(sessionId: string): boolean {
    return this.active.has(sessionId);
  }

  async cancel(sessionId: string): Promise<void> {
    const live = this.live.get(sessionId);
    if (live) await live.copilot.abort().catch(() => undefined);
  }

  async forget(sessionId: string): Promise<void> {
    await this.disposeLive(sessionId);
  }

  async evictIdle(): Promise<void> {
    for (const [id, live] of this.live) {
      if (this.active.has(id)) continue;
      this.live.delete(id);
      await live.copilot.disconnect().catch(() => undefined);
    }
  }

  async dispose(): Promise<void> {
    for (const [id] of this.live) await this.disposeLive(id);
    if (this.client) await this.client.stop().catch(() => undefined);
    this.client = null;
    this.clientStart = null;
  }

  /** Start (once) and return the shared agent client, verifying it is usable. */
  protected async ensureClient(): Promise<AgentClient> {
    if (this.client) return this.client;
    if (this.clientStart) return this.clientStart;
    this.clientStart = (async () => {
      const backend = await startAgentBackend(this.name);
      this.model = backend.model;
      this.log.info(`${backend.label} ready for ${this.name}`);
      this.client = backend.client;
      return backend.client;
    })();
    try {
      return await this.clientStart;
    } catch (err) {
      this.clientStart = null;
      throw err;
    }
  }

  /** Add a freshly created live session to the pool, evicting the oldest idle one
   *  when the pool is over budget. */
  protected registerLive(live: TLive): void {
    this.live.set(live.sessionId, live);
    for (const [id, l] of this.live) {
      if (this.live.size <= MAX_LIVE_SESSIONS) break;
      if (id === live.sessionId || this.active.has(id)) continue;
      this.live.delete(id);
      void l.copilot.disconnect().catch(() => undefined);
    }
  }

  protected async disposeLive(sessionId: string): Promise<void> {
    const live = this.live.get(sessionId);
    if (!live) return;
    this.live.delete(sessionId);
    await live.copilot.disconnect().catch(() => undefined);
  }
}
