import { privateLlmConfig } from "./config";
import { OpenAiCompatibleProvider } from "./agent-runtime";

const config = privateLlmConfig();
if (!config.enabled) throw new Error("Set SKILL_RECORDER_PRIVATE_MODE=1 before probing private providers");
const provider = new OpenAiCompatibleProvider(config);
const capabilities = await provider.capabilities();
console.log(JSON.stringify(capabilities, null, 2));
if (!capabilities.toolCalls) process.exitCode = 2;
