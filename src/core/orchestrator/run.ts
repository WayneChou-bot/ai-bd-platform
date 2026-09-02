/**
 * Run an agent with explicit state transitions recorded in agent_runs (§23, §42).
 * QUEUED → RUNNING → COMPLETED | FAILED. Failures are never hidden.
 */
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { Agent, AgentContext } from "./agent";
import type { AgentRun } from "@/core/schemas";
import type { LLMProvider } from "@/adapters/llm/types";
import type { Repository } from "@/lib/repository";

export const newId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

export async function runAgent<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  repo: Repository,
  agent: Agent<I, O>,
  input: z.infer<I>,
  ctx: AgentContext,
  meta: { project_id: string; lead_id?: string | null; input_summary?: string; summarize?: (out: z.infer<O>) => string },
): Promise<{ output: z.infer<O>; run: AgentRun }> {
  const now = ctx.now().toISOString();
  const run: AgentRun = {
    id: ctx.newId("run"),
    project_id: meta.project_id,
    agent: agent.name,
    lead_id: meta.lead_id ?? null,
    status: "QUEUED",
    started_at: null, completed_at: null, latency_ms: null,
    model: ctx.llm.name, token_usage: null, retry_count: 0, error: null,
    input_summary: meta.input_summary ?? "",
    output_summary: "",
    created_at: now,
  };
  await repo.addAgentRun(run);

  const startedAt = ctx.now();
  run.status = "RUNNING";
  run.started_at = startedAt.toISOString();
  await repo.updateAgentRun({ ...run });

  // Cost visibility (field test: every LIVE run showed "—" for tokens). Every
  // LLM call the agent makes is metered here and summed onto the run row.
  const usage = { input: 0, output: 0 };
  let calls = 0;
  const metered: LLMProvider = {
    name: ctx.llm.name,
    async generateStructured(req) {
      const r = await ctx.llm.generateStructured(req);
      usage.input += r.usage.input; usage.output += r.usage.output; calls++;
      return r;
    },
  };
  const tokenUsage = () => (calls && usage.input + usage.output > 0 ? { ...usage } : null);

  try {
    const output = await agent.run(input, { ...ctx, llm: metered });
    const done = ctx.now();
    run.status = "COMPLETED";
    run.completed_at = done.toISOString();
    run.latency_ms = Math.max(0, done.getTime() - startedAt.getTime());
    run.output_summary = meta.summarize ? meta.summarize(output) : "";
    run.token_usage = tokenUsage();
    await repo.updateAgentRun({ ...run });
    return { output, run };
  } catch (e) {
    const done = ctx.now();
    run.status = "FAILED";
    run.completed_at = done.toISOString();
    run.latency_ms = Math.max(0, done.getTime() - startedAt.getTime());
    run.error = (e as Error).message.slice(0, 500);
    run.token_usage = tokenUsage();
    await repo.updateAgentRun({ ...run });
    throw e;
  }
}
