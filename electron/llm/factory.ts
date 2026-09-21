import { CopilotClient } from "@github/copilot-sdk";

import { COPILOT_SIGNED_OUT_ERROR } from "../../common/ipc";
import { copilotConnectionOption, withStartupTimeout } from "../copilot-cli-path";
import { createLogger } from "../logger";
import { privateLlmConfig } from "./config";
import { OpenAIAgentClient } from "./openai-client";
import type { AgentClient } from "./types";

/**
 * Backend factory: decides per-launch whether the app drives analysis through
 * the bundled GitHub Copilot CLI (upstream default) or through a private
 * OpenAI-compatible endpoint (intranet deployments). The switch is purely
 * configuration — see electron/llm/config.ts and docs/私有化部署方案.md.
 */

export interface StartedBackend {
  client: AgentClient;
  /** Chat model to use, when the deployment pins one. */
  model?: string;
  /** Vision-capable model preferred for frame-reading turns (private mode). */
  visionModel?: string;
  /** Display name for logs. */
  label: string;
  /** True when the private OpenAI-compatible backend is active. */
  privateMode: boolean;
}

const log = createLogger("LLM");

/**
 * Create + start + authenticate one agent backend per caller. `label` is used
 * in the startup-timeout error so the failing component is identifiable.
 */
export async function startAgentBackend(label: string): Promise<StartedBackend> {
  const priv = privateLlmConfig();
  if (priv) {
    const client = new OpenAIAgentClient(priv);
    await client.start();
    return {
      client,
      model: priv.model,
      visionModel: priv.visionModel,
      label: `private LLM (${priv.label})`,
      privateMode: true,
    };
  }

  const client = new CopilotClient(copilotConnectionOption());
  await withStartupTimeout(client.start(), `Copilot CLI (${label})`);
  const auth = await client.getAuthStatus();
  if (!auth.isAuthenticated) {
    await client.stop().catch(() => undefined);
    throw new Error(COPILOT_SIGNED_OUT_ERROR);
  }
  log.info("Copilot ready", auth.login ? `as ${auth.login}` : "");
  return {
    client: client as unknown as AgentClient,
    model: process.env.SKILL_RECORDER_MODEL || undefined,
    label: "GitHub Copilot",
    privateMode: false,
  };
}
