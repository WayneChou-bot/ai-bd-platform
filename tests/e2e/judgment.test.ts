/**
 * Judgment round (external review v6, findings F01/F02/F03/F04/F16):
 * evidence duplication cannot inflate a score; qualification is relative to
 * the ICP via an explicit mapping step; research claims must cite fetched
 * hosts; mention intent is judged from the text, not the entity match; and
 * a converted mention's buyer is named by the human, never the platform.
 */
import { describe, expect, it } from "vitest";
import { dedupeEvidence, scoreLead } from "@/core/scoring";
import { qualificationAgent } from "@/agents/qualification";
import { assertGrounded } from "@/agents/outreach";
import { filterGroundedEvidence } from "@/lib/pipeline";
import { convertSignalToLead, signalsToEvidence } from "@/lib/mentions";
import { InMemoryRepository } from "@/lib/repository";
import { createDemoMockProvider } from "@/adapters/llm/mock-fixtures";
import { ICPProfile, Signal as SignalSchema, type Evidence, type Lead, type Signal } from "@/core/schemas";
import dataset from "../../fixtures/demo/dataset.json";

process.env.APP_MODE = "demo";

const ev = (id: string, over: Partial<Evidence> = {}): Evidence => ({
  id, lead_id: "lead_j", type: "company_page", category: "company_profile",
  claim: `Claim ${id}`, source_url: "https://acme-j.example.com/about",
  observed_at: "2026-09-01T00:00:00.000Z", confidence: 0.9,
  supports: "product_fit", polarity: "positive", ...over,
});

// ---------------------------------------------------------------------------
// F16 — duplicated evidence must not raise a score or satisfy the minimum
// ---------------------------------------------------------------------------
describe("F16 — evidence dedupe before scoring", () => {
  it("splitting one citation into many rows does not reach the score threshold", () => {
    const a = ev("ev_a");
    const copy = ev("ev_a2", { claim: "  claim   EV_A  ".replace("EV_A", "ev_a"), source_url: "https://ACME-J.example.com/about/" });
    expect(dedupeEvidence([a, copy])).toHaveLength(1);
    expect(scoreLead([a, copy]).withheld).toBe(true); // 1 effective item < minimum 2
  });

  it("duplicates change nothing about an already-scoreable lead", () => {
    const a = ev("ev_a");
    const b = ev("ev_b", { claim: "Different claim", supports: "problem_evidence" });
    const clean = scoreLead([a, b]);
    const padded = scoreLead([a, ev("ev_a_dup", { claim: a.claim }), b, ev("ev_b_dup", { claim: "Different claim", supports: "problem_evidence" })]);
    expect(padded.withheld).toBe(false);
    expect(padded.total).toBe(clean.total);
    expect(padded.breakdown).toEqual(clean.breakdown);
  });
});

// ---------------------------------------------------------------------------
// F01 — qualification is ICP-relative: the mapping changes, the score changes
// ---------------------------------------------------------------------------
const lead: Lead = {
  id: "lead_j", project_id: "proj_j", entity_type: "company", company_name: "Acme J",
  website: "https://acme-j.example.com", public_profile_urls: [], source: "manual",
  discovery_reason: "manual", status: "RESEARCHED", thread_key: null,
  created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z",
};
const icp = ICPProfile.parse({
  id: "icp_j", project_id: "proj_j", source: "manual", industries: ["Robotics"],
  target_roles: ["CTO"], positive_signals: ["hiring for docs"], negative_signals: ["agency"],
  created_at: "2026-09-01T00:00:00.000Z",
});
type Mapping = { evidence_id: string; relevant: boolean; supports: Evidence["supports"]; polarity: Evidence["polarity"] };
function ctxWithMapping(map: (e: { id: string; suggested_supports: string; suggested_polarity: string }) => Mapping) {
  let n = 0;
  const llm = createDemoMockProvider().register("qualification.map_evidence", ({ prompt }) => {
    const p = JSON.parse(prompt) as { evidence: Array<{ id: string; suggested_supports: string; suggested_polarity: string }> };
    return { items: p.evidence.map(map) };
  });
  return { llm, now: () => new Date(Date.UTC(2026, 8, 4)), newId: (p: string) => `${p}_j${++n}` };
}
const identity = (e: { id: string; suggested_supports: string; suggested_polarity: string }): Mapping =>
  ({ evidence_id: e.id, relevant: true, supports: e.suggested_supports as Mapping["supports"], polarity: e.suggested_polarity as Mapping["polarity"] });

describe("F01 — ICP relevance mapping drives the deterministic score", () => {
  const evidence = [ev("ev_1"), ev("ev_2", { claim: "Hiring a documentation engineer", supports: "problem_evidence" })];

  it("same evidence, different ICP mapping → different score (and the ICP is recorded)", async () => {
    const same = await qualificationAgent.run({ lead, icp, evidence, product: { name: "DocPilot" } }, ctxWithMapping(identity));
    const remapped = await qualificationAgent.run({ lead, icp, evidence, product: { name: "DocPilot" } },
      ctxWithMapping((e) => e.id === "ev_2" ? { evidence_id: e.id, relevant: true, supports: "problem_evidence", polarity: "negative" } : identity(e)));
    expect(same.withheld).toBe(false);
    expect(remapped.total_score).not.toBe(same.total_score);
    expect(same.icp_id).toBe("icp_j");
  });

  it("evidence judged irrelevant to THIS ICP is excluded — down to withholding", async () => {
    const r = await qualificationAgent.run({ lead, icp, evidence, product: { name: "DocPilot" } },
      ctxWithMapping((e) => ({ ...identity(e), relevant: e.id === "ev_1" })));
    expect(r.withheld).toBe(true); // 1 relevant item < minimum 2
    expect(r.risks.some((x) => x.includes("judged irrelevant"))).toBe(true);
    expect(r.why.map((w) => w.evidence_id)).not.toContain("ev_2");
  });
});

// ---------------------------------------------------------------------------
// F02 — grounding: cite only fetched hosts; never draft from negative ids
// ---------------------------------------------------------------------------
describe("F02 — research grounding and outreach grounding", () => {
  it("evidence citing an un-fetched host is dropped; fetched hosts survive www/case noise", () => {
    const fetched = ["https://www.acme-j.example.com/about", "https://Acme-J.example.com/careers"];
    const { grounded, dropped } = filterGroundedEvidence([
      ev("ev_ok"),
      ev("ev_invented", { source_url: "https://totally-invented.example.org/proof" }),
    ], fetched);
    expect(grounded.map((e) => e.id)).toEqual(["ev_ok"]);
    expect(dropped).toBe(1);
  });

  it("assertGrounded rejects unknown AND negative evidence ids", () => {
    const pool = [ev("ev_pos"), ev("ev_neg", { polarity: "negative", category: "negative" })];
    expect(() => assertGrounded(["ev_pos"], pool)).not.toThrow();
    expect(() => assertGrounded(["ev_ghost"], pool)).toThrow(/unknown evidence ids/);
    expect(() => assertGrounded(["ev_neg"], pool)).toThrow(/negative evidence/);
  });
});

// ---------------------------------------------------------------------------
// F03 — mention intent semantics: the text's intent, not the entity match
// ---------------------------------------------------------------------------
const sig = (id: string, over: Partial<Signal> = {}): Signal => SignalSchema.parse({
  id, project_id: "proj_j", entity_id: "ent_j", lead_id: "lead_j",
  signal_type: "product_mention", source_type: "reddit",
  source_url: `https://reddit.com/r/example/${id}`, title: "A post", snippet: "…snippet…",
  observed_at: "2026-09-01T00:00:00.000Z", confidence: 95, business_relevance: "high",
  status: "CONVERTED", created_at: "2026-09-01T00:00:00.000Z", ...over,
});
const mk = (() => { let n = 0; return (p: string) => `${p}_m${++n}`; })();

describe("F03 — signal → evidence carries intent, not match confidence", () => {
  it("praise or a neutral reference without intent produces NO intent evidence", () => {
    expect(signalsToEvidence([sig("sig_praise", { sentiment: "positive", intent: "none" })], "lead_j", mk)).toHaveLength(0);
    expect(signalsToEvidence([sig("sig_ref", { sentiment: "neutral", intent: "low" })], "lead_j", mk)).toHaveLength(0);
  });

  it("expressed intent becomes intent evidence with intent-based confidence — 95-point entity match never means 0.9", () => {
    const [high] = signalsToEvidence([sig("sig_high", { intent: "high", mention_context: "evaluation" })], "lead_j", mk);
    expect(high.supports).toBe("intent_signal");
    expect(high.confidence).toBe(0.75);
    expect(high.claim).toContain("intent: high");
    const [med] = signalsToEvidence([sig("sig_med", { intent: "medium" })], "lead_j", mk);
    expect(med.confidence).toBe(0.55);
  });

  it("a negative mention still counts — against", () => {
    const [neg] = signalsToEvidence([sig("sig_neg", { sentiment: "negative", intent: "none", mention_context: "criticism" })], "lead_j", mk);
    expect(neg.polarity).toBe("negative");
    expect(neg.category).toBe("negative");
    expect(neg.confidence).toBe(0.6);
  });
});

// ---------------------------------------------------------------------------
// F04 — the human names the buyer; the platform never becomes the company
// ---------------------------------------------------------------------------
describe("F04 — mention conversion requires an explicit organization", () => {
  async function repoWithSignal(id: string, over: Partial<Signal> = {}) {
    const repo = InMemoryRepository.fromDataset(dataset);
    const projectId = (await repo.projects())[0].id;
    await repo.addSignal(sig(id, { project_id: projectId, lead_id: null, status: "NEW", ...over }));
    return { repo, projectId };
  }

  it("conversion without a name is refused", async () => {
    const { repo } = await repoWithSignal("sig_noname");
    await expect(convertSignalToLead(repo, "sig_noname")).rejects.toThrow(/source platform is not the buyer/);
    await expect(convertSignalToLead(repo, "sig_noname", { company_name: "   " })).rejects.toThrow(/source platform is not the buyer/);
  });

  it("a content platform host never becomes the buyer's website; a company blog host still does", async () => {
    const { repo } = await repoWithSignal("sig_reddit");
    const fromReddit = await convertSignalToLead(repo, "sig_reddit", { company_name: "Example Robotics KK" });
    expect(fromReddit.website).toBeUndefined(); // reddit.com is where the mention lives, not who it is about
    expect(fromReddit.company_name).toBe("Example Robotics KK");
    expect(fromReddit.source).toBe("mention");

    const { repo: repo2 } = await repoWithSignal("sig_blog", { source_url: "https://blog.acme-j.example.com/post/1", source_type: "blog" });
    const fromBlog = await convertSignalToLead(repo2, "sig_blog", { company_name: "Acme J" });
    expect(fromBlog.website).toBe("https://blog.acme-j.example.com");
  });

  it("a second mention of the same organization attaches to the existing lead", async () => {
    const { repo, projectId } = await repoWithSignal("sig_first");
    const first = await convertSignalToLead(repo, "sig_first", { company_name: "Example Robotics KK" });
    const before = (await repo.leads(projectId)).length;
    await repo.addSignal(sig("sig_second", { project_id: projectId, lead_id: null, status: "NEW", source_url: "https://news.ycombinator.com/item?id=42" }));
    const second = await convertSignalToLead(repo, "sig_second", { company_name: "example robotics kk" });
    expect(second.id).toBe(first.id);
    expect((await repo.leads(projectId)).length).toBe(before); // no duplicate lead
    const updated = (await repo.signals(projectId)).find((s) => s.id === "sig_second")!;
    expect(updated.status).toBe("CONVERTED");
    expect(updated.lead_id).toBe(first.id);
    expect((await repo.auditEvents(first.id)).some((a) => a.action === "lead.mention_attached")).toBe(true);
  });
});
