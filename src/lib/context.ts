import type { AgentContext } from "@/core/orchestrator/agent";
import { newId } from "@/core/orchestrator/run";
import { createLLMProvider } from "@/adapters/llm";
import { createDemoMockProvider } from "@/adapters/llm/mock-fixtures";
import { getConfig } from "@/lib/config";

/** Runtime agent context for server actions / routes. */
export function agentContext(): AgentContext {
  const cfg = getConfig();
  const llm = createLLMProvider(cfg, cfg.mode === "demo" ? createDemoMockProvider() : undefined);
  return { llm, now: () => new Date(), newId };
}
