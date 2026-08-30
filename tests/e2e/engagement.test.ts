/**
 * Engagement loop in DEMO mode (§40, S12.4):
 * qualified lead → draft → edit → reject → regenerate → Approve & Send (simulated)
 * → simulated reply → Reply Agent → outcome → learning insights refreshed.
 */
import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "@/lib/repository";
import { approveAndSend, editDraft, generateDraft, handleInbound, latestDraft, recordOutcome, rejectDraft, simulateReply } from "@/lib/engagement";
import { createDemoMockProvider } from "@/adapters/llm/mock-fixtures";
import dataset from "../../fixtures/demo/dataset.json";

process.env.APP_MODE = "demo";
let n = 0;
const ctx = { llm: createDemoMockProvider(), now: () => new Date(Date.UTC(2026, 7, 26, 0, 0, n++)), newId: (p: string) => `${p}_t${String(++n).padStart(4, "0")}` };

describe("engagement (demo)", () => {
  const repo = InMemoryRepository.fromDataset(dataset);
  // Sable Security is CONTACTED with no reply in fixtures; Pinewood Games is DRAFTED. Use a QUALIFIED-able lead: pick a MEDIUM/HIGH lead and reset it.
  const leadId = dataset.leads.find((l) => l.company_name === "Verdant Climate")!.id;

  it("refuses to draft a lead that is not qualified", async () => {
    const rejected = dataset.leads.find((l) => l.status === "REJECTED")!.id;
    await expect(generateDraft(repo, rejected, "professional", ctx)).rejects.toThrow(/Cannot draft/);
  });

  it("draft → edit → reject → regenerate → approve & send → reply → outcome", async () => {
    const lead0 = (await repo.lead(leadId))!;
    await repo.updateLead({ ...lead0, status: "QUALIFIED", thread_key: null });

    const d1 = await generateDraft(repo, leadId, "friendly", ctx);
    expect(d1.status).toBe("DRAFT");
    expect(d1.version).toBeGreaterThanOrEqual(1);
    expect((await repo.lead(leadId))!.status).toBe("DRAFTED");
    const evidenceIds = new Set((await repo.evidenceFor(leadId)).map((e) => e.id));
    for (const id of d1.evidence_used) expect(evidenceIds.has(id)).toBe(true);

    const d2 = await editDraft(repo, d1.id, d1.subject, d1.body + "\n\nP.S. Happy to share a sandbox.");
    expect(d2.version).toBe(d1.version + 1);
    expect((await repo.draft(d1.id))!.status).toBe("SUPERSEDED");
    await expect(editDraft(repo, d1.id, "x", "y")).rejects.toThrow(/Only DRAFT/);

    await rejectDraft(repo, d2.id);
    expect((await repo.draft(d2.id))!.status).toBe("REJECTED");
    expect((await repo.lead(leadId))!.status).toBe("REVIEW");

    const d3 = await generateDraft(repo, leadId, "concise", ctx);
    expect(d3.version).toBe(d2.version + 1);
    expect((await repo.lead(leadId))!.status).toBe("DRAFTED");

    const { draft, receipt } = await approveAndSend(repo, d3.id, ctx);
    expect(draft.status).toBe("SENT");
    expect(receipt.simulated).toBe(true);
    const contacted = (await repo.lead(leadId))!;
    expect(contacted.status).toBe("CONTACTED");
    expect(contacted.thread_key).toBe(receipt.thread_key);
    await expect(approveAndSend(repo, d3.id, ctx)).rejects.toThrow(/Only DRAFT/); // no double send

    const cls = await simulateReply(repo, leadId, "Re: docs", "Interesting — we're evaluating options. Could you share pricing?", ctx);
    expect(cls?.outcome).toBe("interested");
    const done = (await repo.lead(leadId))!;
    expect(done.status).toBe("OUTCOME_RECORDED");
    const outs = (await repo.outcomes()).filter((o) => o.lead_id === leadId);
    expect(outs.at(-1)!.recorded_by).toBe("reply_agent");
    expect((await repo.insights()).length).toBeGreaterThan(0);

    // user override is an additional row, never an overwrite
    await recordOutcome(repo, leadId, "meeting_requested", "they booked", { ctx });
    expect((await repo.outcomes()).filter((o) => o.lead_id === leadId).length).toBe(outs.length + 1);
  });

  it("inbound with unknown thread is stored for triage and not classified", async () => {
    const before = (await repo.replyClassifications()).length;
    const r = await handleInbound(repo, { id: "inb_x", source: "resend", channel: "email", thread_key: "thr_nope", lead_id: null, from_address: "a@b.c", subject: "hi", body_text: "hello", received_at: "2026-08-26T00:00:00.000Z", raw_ref: "em_x", processed_at: null }, ctx);
    expect(r).toBeNull();
    expect((await repo.replyClassifications()).length).toBe(before);
    // duplicate delivery is ignored
    const r2 = await handleInbound(repo, { id: "inb_y", source: "resend", channel: "email", thread_key: "thr_nope", lead_id: null, from_address: "a@b.c", subject: "hi", body_text: "hello", received_at: "2026-08-26T00:00:00.000Z", raw_ref: "em_x", processed_at: null }, ctx);
    expect(r2).toBeNull();
    expect((await repo.inboundEvents()).filter((e) => e.raw_ref === "em_x").length).toBe(1);
  });

  it("an event the webhook route pre-stored (same id) is STILL classified — regression for the P0 double-dedupe bug", async () => {
    // The route persists before acking, then hands the same event to handleInbound.
    const lead = (await repo.leads()).find((l) => ["CONTACTED", "REPLIED", "OUTCOME_RECORDED"].includes(l.status) && l.thread_key)!;
    if ((await repo.lead(lead.id))!.status !== "CONTACTED") await repo.updateLead({ ...(await repo.lead(lead.id))!, status: "CONTACTED" });
    const event = { id: "inb_pre1", source: "resend" as const, channel: "email" as const, thread_key: lead.thread_key!, lead_id: null, from_address: "buyer@corp.com", subject: "Re: your note", body_text: "Interesting — can we set up a call next week?", received_at: "2026-08-26T01:00:00.000Z", raw_ref: "em_pre1", processed_at: null };
    await repo.saveInboundEvent(event); // what the route does before the ack
    const cls = await handleInbound(repo, event, ctx);
    expect(cls).not.toBeNull(); // must not be swallowed by its own pre-store
    expect((await repo.inboundEvents()).filter((e) => e.raw_ref === "em_pre1").length).toBe(1); // upserted, not duplicated
    // a genuinely different delivery with the same raw_ref stays deduped
    expect(await handleInbound(repo, { ...event, id: "inb_pre2" }, ctx)).toBeNull();
  });

  it("low-confidence replies are flagged, not auto-recorded", async () => {
    const lead = dataset.leads.find((l) => l.company_name === "Sable Security")!; // CONTACTED, no reply
    const live = (await repo.lead(lead.id))!;
    if (live.status !== "CONTACTED") await repo.updateLead({ ...live, status: "CONTACTED" });
    const cls = await simulateReply(repo, lead.id, "Re:", "ok", ctx);
    expect(cls?.needs_human).toBe(true);
    expect((await repo.lead(lead.id))!.status).toBe("REPLIED");
  });

  it("latestDraft returns the newest version", async () => {
    const d = await latestDraft(repo, leadId);
    expect(d?.status).toBe("SENT");
  });
});
