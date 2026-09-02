/**
 * runAgent meters every LLM call the agent makes onto the run row (field
 * test: LIVE runs showed "—" for tokens while fixtures had numbers).
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineAgent } from "@/core/orchestrator/agent";
import { runAgent } from "@/core/orchestrator/run";
import type { LLMProvider } from "@/adapters/llm/types";
import { InMemoryRepository } from "@/lib/repository";
import dataset from "../../fixtures/demo/dataset.json";

const freshRepo = () => InMemoryRepository.fromDataset(dataset);

const counting: LLMProvider = {
  name: "fake",
  async generateStructured(req) {
    return { data: req.schema.parse({ ok: true }), model: "fake", usage: { input: 100, output: 20 } };
  },
};
const ctx = { llm: counting, now: () => new Date("2026-09-02T00:00:00Z"), newId: (p: string) => `${p}_x` };

const twoCalls = defineAgent({
  name: "research",
  input: z.object({}),
  output: z.object({ ok: z.boolean() }),
  async run(_i, c) {
    await c.llm.generateStructured({ task: "a", system: "", prompt: "", schema: z.object({ ok: z.boolean() }) });
    const r = await c.llm.generateStructured({ task: "b", system: "", prompt: "", schema: z.object({ ok: z.boolean() }) });
    return r.data;
  },
});

describe("runAgent token metering", () => {
  it("sums usage across every LLM call onto the run", async () => {
    const repo = freshRepo();
    const { run } = await runAgent(repo, twoCalls, {}, ctx, { project_id: "proj_x" });
    expect(run.token_usage).toEqual({ input: 200, output: 40 });
    expect((await repo.agentRuns()).find((r) => r.id === run.id)?.token_usage).toEqual({ input: 200, output: 40 });
  });

  it("keeps usage on a FAILED run too, and leaves null when no tokens were spent", async () => {
    const repo = freshRepo();
    const failing = defineAgent({
      name: "research", input: z.object({}), output: z.object({ ok: z.boolean() }),
      async run(_i, c) { await c.llm.generateStructured({ task: "a", system: "", prompt: "", schema: z.object({ ok: z.boolean() }) }); throw new Error("boom"); },
    });
    await expect(runAgent(repo, failing, {}, ctx, { project_id: "proj_x" })).rejects.toThrow("boom");
    expect((await repo.agentRuns()).find((r) => r.project_id === "proj_x" && r.status === "FAILED")?.token_usage).toEqual({ input: 100, output: 20 });

    const noLLM = defineAgent({ name: "research", input: z.object({}), output: z.object({ ok: z.boolean() }), async run() { return { ok: true }; } });
    const { run } = await runAgent(repo, noLLM, {}, ctx, { project_id: "proj_x" });
    expect(run.token_usage).toBeNull();
  });
});
