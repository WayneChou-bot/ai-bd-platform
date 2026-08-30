import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "@/lib/repository";
import { runAgent } from "@/core/orchestrator/run";
import { productUnderstandingAgent } from "@/agents/product-understanding";
import { createDemoMockProvider } from "@/adapters/llm/mock-fixtures";
import dataset from "../../fixtures/demo/dataset.json";

const ctx = { llm: createDemoMockProvider(), now: () => new Date("2026-08-20T00:00:00Z"), newId: (p: string) => `${p}_${Math.random().toString(36).slice(2, 6)}` };

describe("InMemoryRepository write paths (Phase 1)", () => {
  it("creates a project and stores understanding + ICP without touching the fixture", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const p = await repo.createProject({ id: "proj_new", name: "Agent Ops", description: "Workflow automation with agents", created_at: "2026-08-20T00:00:00.000Z" });
    expect((await repo.projects()).map((x) => x.id)).toContain("proj_new");
    expect(dataset.leads.length).toBe(25); // fixture module untouched
    await repo.saveProductUnderstanding({ project_id: p.id, category: "X", problem: ["a"], value_propositions: ["b"], target_roles: ["c"], target_company_types: ["d"], confidence: 0.5, generated_at: "2026-08-20T00:00:00.000Z" });
    expect((await repo.productUnderstanding(p.id))?.category).toBe("X");
    expect(await repo.icp(p.id)).toBeUndefined();
  });

  it("runAgent records QUEUED→RUNNING→COMPLETED and FAILED on error", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const before = (await repo.agentRuns()).length;
    const project = await repo.project();
    const { run } = await runAgent(repo, productUnderstandingAgent, { project }, ctx, { project_id: project.id, input_summary: "test" });
    expect(run.status).toBe("COMPLETED");
    expect((await repo.agentRuns()).length).toBe(before + 1);

    const badCtx = { ...ctx, llm: { name: "broken", generateStructured: async () => { throw new Error("boom"); } } };
    await expect(runAgent(repo, productUnderstandingAgent, { project }, badCtx, { project_id: project.id })).rejects.toThrow("boom");
    const last = (await repo.agentRuns()).at(-1)!;
    expect(last.status).toBe("FAILED");
    expect(last.error).toBe("boom");
  });
});
