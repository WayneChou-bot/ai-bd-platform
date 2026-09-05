/**
 * Inbox & queue round (external review v6, findings F13/F14/F15 + batch
 * fairness): Gmail pagination with a watermark, outcomes ordered by when the
 * business event happened (not when it was processed), a needs-human queue
 * that actually closes, and a pipeline batch that new leads can always enter.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GmailPollingSource } from "@/adapters/gmail/inbound";
import type { TokenProvider } from "@/adapters/gmail/auth";
import { latestOutcomes } from "@/agents/learning";
import { assignInbound, dismissReview, handleInbound, recordOutcome } from "@/lib/engagement";
import { pickPipelineBatch } from "@/lib/pipeline";
import { InMemoryRepository } from "@/lib/repository";
import { createDemoMockProvider } from "@/adapters/llm/mock-fixtures";
import type { InboundEvent, Lead, Outcome } from "@/core/schemas";
import dataset from "../../fixtures/demo/dataset.json";

process.env.APP_MODE = "demo";
let n = 0;
const ctx = { llm: createDemoMockProvider(), now: () => new Date(Date.UTC(2026, 8, 5, 12, 0, n++)), newId: (p: string) => `${p}_ib${String(++n).padStart(4, "0")}` };

// ---------------------------------------------------------------------------
// F13 — Gmail pagination + watermark
// ---------------------------------------------------------------------------
describe("F13 — the 26th message is not invisible", () => {
  afterEach(() => vi.unstubAllGlobals());
  const tp: TokenProvider = { mailbox: "me@gmail.com", accessToken: async () => "tok" };

  it("follows nextPageToken across pages (R13)", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      const page2 = url.includes("pageToken=p2");
      return new Response(JSON.stringify(page2
        ? { messages: [{ id: "m26", threadId: "t26" }] }
        : { messages: Array.from({ length: 25 }, (_, i) => ({ id: `m${i + 1}`, threadId: `t${i + 1}` })), nextPageToken: "p2" }), { status: 200 });
    }));
    const got = await new GmailPollingSource(tp).listCandidates();
    expect(urls).toHaveLength(2);
    expect(got).toHaveLength(26);
    expect(got.at(-1)!.id).toBe("m26"); // the reply that used to be lost forever
  });

  it("a watermark queries after: (covers archived mail too); first poll falls back to newer_than", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { urls.push(url); return new Response(JSON.stringify({ messages: [] }), { status: 200 }); }));
    const src = new GmailPollingSource(tp);
    await src.listCandidates(1_772_000_000);
    await src.listCandidates();
    expect(decodeURIComponent(urls[0])).toContain("after:1772000000");
    expect(decodeURIComponent(urls[0])).not.toContain("in:inbox"); // archived replies are still replies
    expect(decodeURIComponent(urls[1])).toContain("newer_than:7d");
  });
});

// ---------------------------------------------------------------------------
// F14 — effective outcome follows the business event, not processing order
// ---------------------------------------------------------------------------
const out = (id: string, over: Partial<Outcome>): Outcome => ({
  id, lead_id: "lead_o", outcome: "interested", notes: "", recorded_by: "reply_agent",
  event_id: null, occurred_at: null, recorded_at: "2026-09-05T10:00:00.000Z", ...over,
});

describe("F14 — outcome ordering", () => {
  it("a backlog processed in ANY order yields the same effective outcome (R16)", () => {
    const newer = out("o_new", { outcome: "interested", occurred_at: "2026-09-03T09:00:00.000Z", recorded_at: "2026-09-05T10:00:00.000Z" });
    const older = out("o_old", { outcome: "negative_reply", occurred_at: "2026-09-01T09:00:00.000Z", recorded_at: "2026-09-05T11:00:00.000Z" }); // processed LATER
    for (const order of [[newer, older], [older, newer]]) {
      expect(latestOutcomes(order).get("lead_o")!.outcome).toBe("interested");
    }
  });

  it("a human decision is never demoted by an old email processed afterwards", () => {
    const human = out("o_h", { outcome: "meeting_requested", recorded_by: "user", occurred_at: "2026-09-02T09:00:00.000Z" });
    const staleMail = out("o_m", { outcome: "negative_reply", occurred_at: "2026-09-04T09:00:00.000Z", recorded_at: "2026-09-05T12:00:00.000Z" });
    expect(latestOutcomes([human, staleMail]).get("lead_o")!.outcome).toBe("meeting_requested");
  });

  it("legacy rows without occurred_at keep the old recorded_at behaviour", () => {
    const a = out("o_a", { outcome: "negative_reply", recorded_at: "2026-09-01T00:00:00.000Z" });
    const b = out("o_b", { outcome: "interested", recorded_at: "2026-09-02T00:00:00.000Z" });
    expect(latestOutcomes([b, a]).get("lead_o")!.outcome).toBe("interested");
  });

  it("handleInbound stamps the outcome with the reply's received time", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const lead = (await repo.leads()).find((l) => l.status === "OUTCOME_RECORDED")!;
    await repo.updateLead({ ...lead, status: "CONTACTED", thread_key: "thr_f14" });
    const event: InboundEvent = {
      id: "inb_f14", source: "simulated", channel: "email", thread_key: "thr_f14", lead_id: lead.id,
      from_address: "x@example.com", subject: "Re:", body_text: "We are interested — currently evaluating options.",
      received_at: "2026-09-01T08:30:00.000Z", raw_ref: "ref_f14", processed_at: null,
    };
    await handleInbound(repo, event, ctx);
    const row = (await repo.outcomes()).find((o) => o.event_id === "inb_f14")!;
    expect(row.occurred_at).toBe("2026-09-01T08:30:00.000Z"); // NOT the processing time
  });
});

// ---------------------------------------------------------------------------
// F15 — the needs-human queue closes when a human does the work
// ---------------------------------------------------------------------------
async function repoWithLowConfidenceReply() {
  const repo = InMemoryRepository.fromDataset(dataset);
  const lead = (await repo.leads()).find((l) => l.status === "OUTCOME_RECORDED")!;
  await repo.updateLead({ ...lead, status: "CONTACTED", thread_key: "thr_f15" });
  const event: InboundEvent = {
    id: "inb_f15", source: "simulated", channel: "email", thread_key: "thr_f15", lead_id: lead.id,
    from_address: "x@example.com", subject: "Re:", body_text: "Thanks for this.", // polite ack → confidence 0.62 → needs human
    received_at: "2026-09-04T08:00:00.000Z", raw_ref: "ref_f15", processed_at: null,
  };
  const cls = (await handleInbound(repo, event, ctx))!;
  return { repo, lead, cls };
}

describe("F15 — human work-tickets", () => {
  it("recording an outcome resolves the ticket; the model's classification stays auditable (R17)", async () => {
    const { repo, lead, cls } = await repoWithLowConfidenceReply();
    expect(cls.needs_human).toBe(true);
    expect(cls.review_status).toBe("pending");
    expect((await repo.outcomes()).some((o) => o.event_id === "inb_f15")).toBe(false); // never auto-recorded
    await recordOutcome(repo, lead.id, "interested", "spoke on the phone", { event_id: "inb_f15", ctx });
    const after = (await repo.replyClassifications()).find((c) => c.id === cls.id)!;
    expect(after.review_status).toBe("resolved");
    expect(after.resolved_at).toBeTruthy();
    expect(after.needs_human).toBe(true); // the model's original judgement is history, not state
    expect(after.confidence).toBe(cls.confidence);
    expect((await repo.auditEvents(lead.id)).some((a) => a.action === "reply.review_resolved")).toBe(true);
  });

  it("a lead-level manual outcome (no event id) also clears that lead's pending tickets", async () => {
    const { repo, lead, cls } = await repoWithLowConfidenceReply();
    await recordOutcome(repo, lead.id, "not_relevant", "", { ctx });
    expect((await repo.replyClassifications()).find((c) => c.id === cls.id)!.review_status).toBe("resolved");
  });

  it("dismiss closes without an outcome; a closed ticket cannot be dismissed again", async () => {
    const { repo, cls } = await repoWithLowConfidenceReply();
    await dismissReview(repo, cls.id);
    const after = (await repo.replyClassifications()).find((c) => c.id === cls.id)!;
    expect(after.review_status).toBe("dismissed");
    await expect(dismissReview(repo, cls.id)).rejects.toThrow(/already dismissed/);
    expect((await repo.outcomes()).some((o) => o.event_id === "inb_f15")).toBe(false);
  });

  it("an unmatched mail can be assigned to a contacted lead — and only to one", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const contacted = (await repo.leads()).find((l) => l.status === "OUTCOME_RECORDED")!;
    const never = (await repo.leads()).find((l) => l.status === "REJECTED" || l.status === "RESEARCHED")!;
    const event: InboundEvent = {
      id: "inb_f15b", source: "simulated", channel: "email", thread_key: null, lead_id: null,
      from_address: "mystery@example.com", subject: "Re: your note", body_text: "We are interested — please share pricing.",
      received_at: "2026-09-04T09:00:00.000Z", raw_ref: "ref_f15b", processed_at: null,
    };
    expect(await handleInbound(repo, event, ctx)).toBeNull(); // stored, unmatched
    await expect(assignInbound(repo, "inb_f15b", never.id, ctx)).rejects.toThrow(/never contacted/);
    const cls = await assignInbound(repo, "inb_f15b", contacted.id, ctx);
    expect(cls).toBeTruthy();
    expect(cls!.lead_id).toBe(contacted.id);
    expect((await repo.inboundEvents()).find((e) => e.id === "inb_f15b")!.lead_id).toBe(contacted.id);
  });
});

// ---------------------------------------------------------------------------
// Batch fairness — withheld leads rotate; new leads always get in
// ---------------------------------------------------------------------------
describe("batch fairness", () => {
  const mk = (id: string, status: Lead["status"], created: string, updated: string): Lead => ({
    id, project_id: "p", entity_type: "company", company_name: id, public_profile_urls: [],
    source: "manual", discovery_reason: "t", status, thread_key: null, created_at: created, updated_at: updated,
  });

  it("a newly discovered lead enters the batch ahead of leads that keep failing to score", () => {
    const stuck = Array.from({ length: 5 }, (_, i) => mk(`stuck_${i}`, "RESEARCHED", "2026-09-01T00:00:00.000Z", `2026-09-04T0${i}:00:00.000Z`));
    const fresh = mk("fresh", "DISCOVERED", "2026-09-05T00:00:00.000Z", "2026-09-05T00:00:00.000Z");
    const batch = pickPipelineBatch([...stuck, fresh], 5);
    expect(batch[0].id).toBe("fresh");
    expect(batch).toHaveLength(5);
  });

  it("RESEARCHED leads rotate least-recently-attempted first, so no lead is starved forever", () => {
    const a = mk("a", "RESEARCHED", "2026-09-01T00:00:00.000Z", "2026-09-04T00:00:00.000Z");
    const b = mk("b", "RESEARCHED", "2026-09-01T00:00:00.000Z", "2026-09-02T00:00:00.000Z"); // touched longest ago
    expect(pickPipelineBatch([a, b], 1)[0].id).toBe("b");
    // after b is attempted (updated_at bumped), a is next
    expect(pickPipelineBatch([{ ...b, updated_at: "2026-09-05T00:00:00.000Z" }, a], 1)[0].id).toBe("a");
  });
});
