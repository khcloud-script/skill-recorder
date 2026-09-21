#!/usr/bin/env node
import { checkPrivateLlm } from "../electron/llm/openai-compatible.ts";

try {
  await checkPrivateLlm();
  console.log("Private LLM health check: OK");
} catch (error) {
  console.error(`Private LLM health check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
