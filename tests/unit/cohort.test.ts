/**
 * Statistics semantics round (external review v6, F11 + secondary findings):
 * response rates are computed over the SEND cohort with an observation
 * window — a lead emailed yesterday is neither success nor failure; withheld
 * is never counted as REJECT; strategy adoption is an append-only human record.
 */
import { describe, expect, it } from "vitest";
import { OBSERVATION_WINDOW_DAYS, scoreBandStats, sendCohort } from "@/agents/learning";
import { projectAnalytics } from "@/lib/analytics";
import { InMemoryRepository } from "@/lib/repository";
import type { DeliveryReceipt, Outcome, QualificationResult } from "@/core/schemas";
import dataset from "../../fixtures/demo/dataset.json";

process.env.APP_MODE = "demo";

const rcpt = (i: number, sentAt: string): DeliveryReceipt => ({
  id: `rcpt_c${i}`, draft_id: `dr_c${i}`, lead_id: `lead_c${i}`, provider: "mock", message_id: `m${i}`,
  provider_thread_id: null, thread_key: `thr_c${i}`, simulated: true, sent_at: sentAt, error: null,
});
const qual = (i: number, score: number): QualificationResult => ({
  lead_id: `lead_c${i}`, breakdown: { product_fit: score, problem_evidence: score, intent_signal: score, role_relevance: score, data_confidence: score },
  total_score: score, classification: "HIGH_FIT", why: [], risks: [], rationale: "t", withheld: false, scored_at: "2026-09-01T00:00:00.000Z",
});
const out = (i: number, kind: Outcome["outcome"]): Outcome => ({
  id: `out_c${i}`, lead_id: `lead_c${i}`, outcome: kind, notes: "", recorded_by: "user",
  event_id: null, occurred_at: null, recorded_at: "2026-09-02T00:00:00.000Z",
});

describe("F11 — send cohort with observation window", () => {
  const NOW = "2026-09-05T00:00:00.000Z";

  it("R09: 10 sent + 1 interested is NOT a 100% success story", () => {
    const receipts = Array.from({ length: 10 }, (_, i) => rcpt(i, "2026-09-01T00:00:00.000Z")); // 4 days ago — window open
    const quals = Array.from({ length: 10 }, (_, i) => qual(i, 85));
    const outcomes = [out(0, "interested")];
    const [band] = scoreBandStats(quals, outcomes, receipts, NOW);
    expect(band.sent).toBe(10);
    expect(band.assessable).toBe(1); // only the recorded outcome is assessable yet
    expect(band.awaiting).toBe(9); // the other 9 are VISIBLE, not silently dropped
    expect(band.rate).toBe(100); // honest — with the 9 awaiting shown beside it
    // …and once the window elapses, silence becomes a real non-response:
    const later = new Date(new Date(NOW).getTime() + (OBSERVATION_WINDOW_DAYS + 1) * 86_400_000).toISOString();
    const [mature] = scoreBandStats(quals, outcomes, receipts, later);
    expect(mature.assessable).toBe(10);
    expect(mature.awaiting).toBe(0);
    expect(mature.rate).toBe(10); // 1/10, not 1/1
  });

  it("a freshly sent lead is never counted as no_response, and a failed send never enters the cohort", () => {
    const c = sendCohort([
      rcpt(1, "2026-09-04T20:00:00.000Z"),
      { ...rcpt(2, "2026-09-01T00:00:00.000Z"), error: "bounced" },
    ], [], NOW);
    expect(c.awaiting.has("lead_c1")).toBe(true);
    expect(c.assessable.has("lead_c1")).toBe(false);
    expect(c.sentAt.has("lead_c2")).toBe(false); // error receipt ≠ sent
  });
});

describe("withheld is never a REJECT in the distribution", () => {
  it("adding a withheld qualification changes the withheld count, not the REJECT bucket", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const projectId = (await repo.projects())[0].id;
    const before = await projectAnalytics(repo, projectId);
    const lead = (await repo.leads(projectId)).find((l) => l.status === "RESEARCHED" || l.status === "REPLIED") ?? (await repo.leads(projectId))[0];
    await repo.saveQualification({
      lead_id: lead.id, breakdown: { product_fit: 0, problem_evidence: 0, intent_signal: 0, role_relevance: 0, data_confidence: 0 },
      total_score: 0, classification: "REJECT", why: [], risks: [], rationale: "withheld", withheld: true, scored_at: "2026-09-05T00:00:00.000Z",
    });
    const after = await projectAnalytics(repo, projectId);
    expect(after.withheld).toBe(before.withheld + 1);
    const reject = (a: typeof before) => a.distribution.find((d) => d.label === "REJECT")!.value;
    expect(reject(after)).toBe(reject(before)); // placeholder classification never leaks
  });
});

describe("strategy adoption is an append-only human record", () => {
  it("re-deciding adds a row; the history is never overwritten", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const projectId = (await repo.projects())[0].id;
    const base = { project_id: projectId, recommendation_key: "prioritise_category:hiring", title: "t", note: "" };
    await repo.addStrategyAdoption({ ...base, id: "sad_1", action: "adopted", created_at: "2026-09-05T00:00:00.000Z" });
    await repo.addStrategyAdoption({ ...base, id: "sad_2", action: "dismissed", created_at: "2026-09-06T00:00:00.000Z" });
    const rows = await repo.strategyAdoptions(projectId);
    expect(rows).toHaveLength(2); // both decisions kept — versioned history
    const latest = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    expect(latest.action).toBe("dismissed"); // the standing decision
  });
});
