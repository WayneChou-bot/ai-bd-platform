import type { AgentContext } from "@/core/orchestrator/agent";
import { newId } from "@/core/orchestrator/run";
import { createLLMProvider } from "@/adapters/llm";
import { createDemoMockProvider } from "@/adapters/llm/mock-fixtures";
import { getConfig } from "@/lib/config";

/** Runtime agent context for server actions / routes. */
export function agentContext(opts: { language?: string } = {}): AgentContext {
  const cfg = getConfig();
  const llm = createLLMProvider(cfg, cfg.mode === "demo" ? createDemoMockProvider() : undefined);
  return { llm, now: () => new Date(), newId, language: opts.language };
}

/** Human-readable language name for a UI locale, for agent prose (field test:
 *  a Chinese UI was showing English rationale and risks). */
export const languageOf = (locale: string) => (locale === "zh-TW" ? "Traditional Chinese (繁體中文)" : "English");
