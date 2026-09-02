/**
 * Agent contract (Spec §3.4, §24).
 *
 * Every agent: structured input → structured output, validated with Zod,
 * no hidden state shared between agents.
 */
import type { z } from "zod";
import type { AgentName } from "@/core/schemas";
import type { LLMProvider } from "@/adapters/llm/types";

export interface AgentContext {
  llm: LLMProvider;
  /** Injected clock so runs are reproducible in tests and demo playback. */
  now: () => Date;
  /** Deterministic id generator (fixtures) or crypto ids (live). */
  newId: (prefix: string) => string;
  /** Language for user-facing free text (rationale, risks, evidence claims);
   *  structured fields and search queries stay English. Default: English. */
  language?: string;
}

/** Prompt fragment for agents that write prose a human will read. */
export const proseLanguage = (ctx: AgentContext) =>
  ctx.language && ctx.language !== "English" ? ` Write all free-text fields in ${ctx.language}; keep identifiers, URLs and enum values unchanged.` : "";

export interface Agent<I extends z.ZodTypeAny, O extends z.ZodTypeAny> {
  name: AgentName;
  input: I;
  output: O;
  run(input: z.infer<I>, ctx: AgentContext): Promise<z.infer<O>>;
}

/** Wrap an agent so its input and output are always schema-validated. */
export function defineAgent<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  def: Agent<I, O>,
): Agent<I, O> {
  return {
    ...def,
    async run(input, ctx) {
      const parsedIn = def.input.parse(input);
      const out = await def.run(parsedIn, ctx);
      return def.output.parse(out);
    },
  };
}
