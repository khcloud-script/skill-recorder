import { privateLlmConfig, type PrivateLlmConfig } from "./config";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResult {
  id?: string;
  choices?: Array<{ message?: { content?: string } }>;
}

/** Minimal dependency-free OpenAI-compatible client for internal gateways. */
export async function privateChat(
  messages: ChatMessage[],
  options: Partial<Pick<PrivateLlmConfig, "model" | "timeoutMs">> = {},
): Promise<ChatCompletionResult> {
  const config = privateLlmConfig();
  if (!config.enabled) throw new Error("Private LLM mode is not enabled");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: options.model ?? config.model, messages, temperature: 0 }),
    });
    if (!response.ok) throw new Error(`Private LLM returned HTTP ${response.status}: ${await response.text()}`);
    return (await response.json()) as ChatCompletionResult;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkPrivateLlm(): Promise<void> {
  const result = await privateChat([{ role: "user", content: "Reply with OK." }], { timeoutMs: 15_000 });
  if (!result.choices?.[0]?.message?.content) throw new Error("Private LLM returned no assistant content");
}
