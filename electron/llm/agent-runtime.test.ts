import { strict as assert } from "node:assert";
import test from "node:test";
import { OpenAiCompatibleProvider } from "../electron/llm/agent-runtime";

test("private runtime never falls back when endpoint is offline", async () => {
  const provider = new OpenAiCompatibleProvider({ enabled: true, provider: "openai-compatible", baseUrl: "http://127.0.0.1:1/v1", model: "offline", timeoutMs: 100 });
  await assert.rejects(() => provider.health());
});

test("provider exposes tool-call capable contract", () => {
  assert.equal(typeof OpenAiCompatibleProvider.prototype.chat, "function");
  assert.equal(typeof OpenAiCompatibleProvider.prototype.capabilities, "function");
});
