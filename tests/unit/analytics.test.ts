import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "@/lib/repository";
import { projectAnalytics } from "@/lib/analytics";
import dataset from "../../fixtures/demo/dataset.json";

describe("projectAnalytics (§47)", () => {
  it("funnel is monotone non-increasing through the pipeline and matches fixture counts", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const a = await projectAnalytics(repo, dataset.project.id);
    expect(a.funnel[0]).toEqual({ stage: "Discovered", value: 25, pct: 100 });
    for (let i = 1; i < a.funnel.length; i++) expect(a.funnel[i].value).toBeLessThanOrEqual(a.funnel[i - 1].value);
    expect(a.metrics.qualified).toBe(18);
    expect(a.metrics.contacted).toBe(17);
    expect(a.replyBreakdown.reduce((s, x) => s + x.value, 0)).toBe(a.metrics.replies + a.replyBreakdown.filter((x) => x.name === "no response").reduce((s, x) => s + x.value, 0));
    expect(a.agents.find((x) => x.label === "research")!.failed).toBe(1);
  });
  it("is scoped to the project (empty project → zeros, no throw)", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    await repo.createProject({ id: "p2", name: "Empty", description: "", created_at: "2026-08-26T00:00:00.000Z" });
    const a = await projectAnalytics(repo, "p2");
    expect(a.metrics.discovered).toBe(0);
    expect(a.metrics.positiveRate).toBe(0);
    expect(a.replyBreakdown).toEqual([]);
  });
});
