/**
 * End-to-end in DEMO mode (§40): new project → ICP → discover → research → qualify.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { InMemoryRepository } from "@/lib/repository";
import { discoverLeads, ignoreLead, qualifyLead, researchLead, runPipeline } from "@/lib/pipeline";
import { productUnderstandingAgent } from "@/agents/product-understanding";
import { icpSuggestAgent } from "@/agents/icp";
import { createDemoMockProvider } from "@/adapters/llm/mock-fixtures";
import { scoreLead } from "@/core/scoring";
import dataset from "../../fixtures/demo/dataset.json";

process.env.APP_MODE = "demo";
let n = 0;
const ctx = { llm: createDemoMockProvider(), now: () => new Date(Date.UTC(2026, 7, 25, 0, 0, n++)), newId: (p: string) => `${p}_${String(++n).padStart(4, "0")}` };

describe("pipeline (demo)", () => {
  const repo = InMemoryRepository.fromDataset(dataset);
  const project = { id: "proj_e2e", name: "DocPilot", description: "Turns scattered Markdown documentation and RAG knowledge into role-specific wiki pages for engineering teams.", created_at: "2026-08-25T00:00:00.000Z" };

  beforeAll(async () => {
    await repo.createProject(project);
    const u = await productUnderstandingAgent.run({ project }, ctx);
    await repo.saveProductUnderstanding(u);
    await repo.saveICP(await icpSuggestAgent.run({ project, understanding: u }, ctx));
  });

  it("refuses discovery without an ICP", async () => {
    await repo.createProject({ id: "proj_noicp", name: "X", description: "", created_at: "2026-08-25T00:00:00.000Z" });
    await expect(discoverLeads(repo, "proj_noicp", { ctx })).rejects.toThrow(/ICP/);
  });

  it("discovers, researches and qualifies with evidence-reproducible scores", async () => {
    const found = await discoverLeads(repo, project.id, { limit: 6, ctx });
    expect(found).toHaveLength(6);
    expect(found.every((l) => l.status === "DISCOVERED" && l.project_id === project.id)).toBe(true);
    // relevant seeds come first for a docs product
    expect(found.map((l) => l.company_name)).toContain("Acme AI");

    const ev = await researchLead(repo, found[0].id, ctx);
    expect(ev.length).toBeGreaterThan(0);
    expect((await repo.lead(found[0].id))!.status).toBe("RESEARCHED");
    for (const e of ev) expect(e.source_url).toMatch(/^https:\/\//);

    const q = await qualifyLead(repo, found[0].id, ctx);
    const recomputed = scoreLead(await repo.evidenceFor(found[0].id));
    expect(q.total_score).toBe(recomputed.total);
    expect(["QUALIFIED", "REJECTED"]).toContain((await repo.lead(found[0].id))!.status);

    await ignoreLead(repo, found[1].id);
    expect((await repo.lead(found[1].id))!.status).toBe("REJECTED");
  });

  it("runPipeline processes remaining leads and does not re-discover existing ones", async () => {
    const before = (await repo.leads(project.id)).length;
    const s = await runPipeline(repo, project.id, ctx);
    const after = await repo.leads(project.id);
    expect(after.length).toBe(before + s.discovered);
    expect(new Set(after.map((l) => l.company_name)).size).toBe(after.length); // no duplicates
    expect(s.failed).toBe(0);
    expect(after.filter((l) => l.status === "DISCOVERED").length).toBe(0);
    // Only withheld leads may remain at RESEARCHED — and each is counted as withheld, not rejected.
    expect(after.filter((l) => l.status === "RESEARCHED").length).toBe(s.withheld);
    const runs = await repo.agentRuns();
    expect(runs.filter((r) => r.project_id === project.id && r.agent === "research").every((r) => r.status === "COMPLETED")).toBe(true);
  });

  it("a lead unknown to demo sources gets its score withheld (§41)", async () => {
    const lead = await repo.createLead({ id: "lead_unknown", project_id: project.id, entity_type: "company", company_name: "Nobody Inc", website: "https://nobody.example.com", public_profile_urls: [], source: "manual", discovery_reason: "manual", status: "DISCOVERED", thread_key: null, created_at: "2026-08-25T00:00:00.000Z", updated_at: "2026-08-25T00:00:00.000Z" });
    await researchLead(repo, lead.id, ctx);
    const q = await qualifyLead(repo, lead.id, ctx);
    expect(q.withheld).toBe(true);
    // Withheld ≠ rejected (field test): insufficient evidence is a verdict about
    // the data, so the lead stays RESEARCHED for a human to re-research or ignore.
    expect((await repo.lead(lead.id))!.status).toBe("RESEARCHED");
    const audit = (await repo.auditEvents(lead.id)).map((a) => a.action);
    expect(audit).toContain("lead.score_withheld");
    expect(audit).not.toContain("lead.rejected");
  });

  it("re-qualifying a previously rejected lead with too little evidence moves it back to RESEARCHED, never leaves it REJECTED", async () => {
    const lead = (await repo.lead("lead_unknown"))!;
    await repo.updateLead({ ...lead, status: "REJECTED" });
    const q = await qualifyLead(repo, lead.id, ctx);
    expect(q.withheld).toBe(true);
    expect((await repo.lead(lead.id))!.status).toBe("RESEARCHED");
  });
});
