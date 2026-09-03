/**
 * Mention pipeline e2e (Spec v0.3 §4B, §5, §28): scan the demo pool →
 * deterministic signals; rescan dedups; human converts a signal to a lead;
 * Research merges the signal in as intent evidence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryRepository } from "@/lib/repository";
import { convertSignalToLead, ensureTrackedEntities, scanMentions } from "@/lib/mentions";
import { researchLead } from "@/lib/pipeline";
import dataset from "../../fixtures/demo/dataset.json";

process.env.APP_MODE = "demo";

describe("tracked-entity derivation", () => {
  it("derived keywords are unique even when the ICP and category overlap (React key crash, field test)", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const pid = (await repo.projects())[0].id;
    const icp = await repo.icp(pid);
    await repo.saveICP({ ...icp!, technologies: ["IoT", "Digital Twin"] });
    await repo.updateProject({ ...(await repo.project(pid)), category: "IoT / Digital Twin" });
    const [entity] = await ensureTrackedEntities(repo, pid);
    const lower = entity.keywords.map((k) => k.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });
});

describe("mention scan (demo pool)", () => {
  let repo: InMemoryRepository;
  let projectId: string;
  beforeEach(async () => {
    repo = InMemoryRepository.fromDataset(dataset);
    projectId = (await repo.projects())[0].id;
  });

  it("derives a tracked entity from the project when none exists", async () => {
    const entities = await ensureTrackedEntities(repo, projectId);
    expect(entities).toHaveLength(1);
    expect(entities[0].canonical_name).toBe("LLM Wiki Agent");
    expect(entities[0].identifiers).toContain("WayneChou-bot/LLM-Wiki-Agent-Workflow-Demo");
  });

  it("creates signals only above the confidence threshold, with language + context", async () => {
    const r = await scanMentions(repo, projectId);
    expect(r.created).toBeGreaterThanOrEqual(4);
    expect(r.belowThreshold).toBeGreaterThanOrEqual(1); // the World Atlas doc must NOT become a signal
    const signals = await repo.signals(projectId);
    expect(signals.every((s) => s.confidence >= 50)).toBe(true);
    expect(signals.every((s) => s.query.length > 0)).toBe(true); // §33 provenance
    const langs = new Set(signals.map((s) => s.language));
    expect(langs.has("ja")).toBe(true);
    expect(langs.has("zh")).toBe(true);
    // §31: the Japanese 検討 post is an evaluation with high intent
    const ja = signals.find((s) => s.language === "ja")!;
    expect(ja.mention_context).toBe("evaluation");
    expect(ja.intent).toBe("high");
    // §30: the "did not support" post is criticism with negative sentiment
    const crit = signals.find((s) => s.mention_context === "criticism");
    expect(crit?.sentiment).toBe("negative");
    // the run is recorded under the Discovery Agent (§48: no new UI agent)
    const runs = await repo.agentRuns();
    expect(runs.some((x) => x.agent === "discovery" && x.input_summary.startsWith("mention scan") && x.status === "COMPLETED")).toBe(true);
  });

  it("rescan is idempotent — existing signals are skipped, not duplicated", async () => {
    const first = await scanMentions(repo, projectId);
    const second = await scanMentions(repo, projectId);
    expect(second.created).toBe(0);
    expect(second.skippedExisting).toBe(first.created);
    expect((await repo.signals(projectId)).length).toBe(first.created);
  });

  it("convert → lead(source=mention) and Research merges the signal as intent evidence", async () => {
    await scanMentions(repo, projectId);
    const signal = (await repo.signals(projectId)).find((s) => s.mention_context === "evaluation" && s.language === "ja")!;
    const lead = await convertSignalToLead(repo, signal.id, { company_name: "Example Robotics KK" });
    expect(lead.source).toBe("mention");
    expect(lead.status).toBe("DISCOVERED");
    const updated = (await repo.signals(projectId)).find((s) => s.id === signal.id)!;
    expect(updated.status).toBe("CONVERTED");
    expect(updated.lead_id).toBe(lead.id);

    const evidence = await researchLead(repo, lead.id);
    const mention = evidence.find((e) => e.claim.startsWith("Public mention"));
    expect(mention).toBeDefined();
    expect(mention!.supports).toBe("intent_signal");
    expect(mention!.claim).toContain("検討"); // original language preserved (§39)
    expect(mention!.source_url).toBe(signal.source_url);
  });
});
