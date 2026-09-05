/**
 * Recoverability round (external review v6, findings F05/F06/F07/F10):
 * concurrent approvals send once; a failed delivery hands the draft back;
 * a failed classification is retryable; re-research works from every state
 * the UI offers it.
 */
import { describe, expect, it, vi } from "vitest";
import { InMemoryRepository } from "@/lib/repository";
import { approveAndSend, generateDraft, handleInbound } from "@/lib/engagement";
import { researchLead } from "@/lib/pipeline";
import { productUnderstandingAgent } from "@/agents/product-understanding";
import { icpSuggestAgent } from "@/agents/icp";
import { createDemoMockProvider } from "@/adapters/llm/mock-fixtures";
import type { InboundEvent } from "@/core/schemas";
import dataset from "../../fixtures/demo/dataset.json";

process.env.APP_MODE = "demo";
let n = 0;
const ctx = { llm: createDemoMockProvider(), now: () => new Date(Date.UTC(2026, 8, 4, 0, 0, n++)), newId: (p: string) => `${p}_r${String(++n).padStart(4, "0")}` };

async function repoWithDraftedLead() {
  const repo = InMemoryRepository.fromDataset(dataset);
  const project = { id: "proj_rec", name: "DocPilot", description: "Turns scattered Markdown documentation into role-specific wiki pages.", created_at: "2026-09-04T00:00:00.000Z" };
  await repo.createProject(project);
  const u = await productUnderstandingAgent.run({ project }, ctx);
  await repo.saveProductUnderstanding(u);
  await repo.saveICP(await icpSuggestAgent.run({ project, understanding: u }, ctx));
  const lead = await repo.createLead({
    id: "lead_rec", project_id: project.id, entity_type: "company", company_name: "Acme AI", website: "https://acme-ai.example.com",
    contact_email: "cto@acme-ai.example.com", public_profile_urls: [], source: "manual", discovery_reason: "manual",
    status: "REVIEW", thread_key: null, created_at: "2026-09-04T00:00:00.000Z", updated_at: "2026-09-04T00:00:00.000Z",
  });
  await repo.addEvidence([{ id: "ev_rec1", lead_id: lead.id, type: "company_page", category: "company_profile", claim: "Acme AI builds internal documentation tooling", polarity: "positive", confidence: 0.9, source_url: "https://acme-ai.example.com/about", observed_at: "2026-09-01T00:00:00.000Z", supports: "product_fit" }]);
  const draft = await generateDraft(repo, lead.id, "professional", ctx);
  return { repo, lead, draft };
}

describe("F05 — concurrent approval sends exactly once", () => {
  it("only one of two simultaneous approvals wins; one receipt exists", async () => {
    const { repo, draft } = await repoWithDraftedLead();
    const results = await Promise.allSettled([
      approveAndSend(repo, draft.id, ctx),
      approveAndSend(repo, draft.id, ctx),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    expect((await repo.receipts()).filter((r) => r.draft_id === draft.id)).toHaveLength(1);
    expect((await repo.draft(draft.id))!.status).toBe("SENT");
  });
});

describe("F06 — delivery failure is recoverable from the screen", () => {
  it("failed send → draft FAILED + lead back to DRAFTED; retry succeeds without a duplicate", async () => {
    const { repo, lead, draft } = await repoWithDraftedLead();
    // First attempt: transport throws.
    const send = vi.spyOn(await import("@/adapters/delivery").then((m) => m), "createDeliveryAdapter");
    send.mockResolvedValueOnce({ name: "boom", send: async () => { throw new Error("SMTP unreachable"); } } as never);
    await expect(approveAndSend(repo, draft.id, ctx)).rejects.toThrow("SMTP unreachable");
    expect((await repo.draft(draft.id))!.status).toBe("FAILED");
    expect((await repo.lead(lead.id))!.status).toBe("DRAFTED");
    send.mockRestore();
    // Retry: real (simulated) adapter — succeeds, exactly one receipt.
    const result = await approveAndSend(repo, draft.id, ctx);
    expect(result.draft.status).toBe("SENT");
    expect((await repo.lead(lead.id))!.status).toBe("CONTACTED");
    expect((await repo.receipts()).filter((r) => r.draft_id === draft.id)).toHaveLength(1);
  });

  it("a missing recipient fails BEFORE any state change", async () => {
    const { repo, lead, draft } = await repoWithDraftedLead();
    await repo.updateLead({ ...(await repo.lead(lead.id))!, contact_email: undefined, website: undefined });
    // demo mode falls back to example.com — simulate live strictness by checking state instead:
    // (in demo the send succeeds; the invariant under test is the claim path, so assert on live-style throw)
    const cfg = await import("@/lib/config");
    const orig = cfg.getConfig;
    vi.spyOn(cfg, "getConfig").mockImplementation(() => ({ ...orig(), mode: "live", demoRecipientOverride: undefined, mailProvider: "gmail" } as never));
    await expect(approveAndSend(repo, draft.id, ctx)).rejects.toThrow(/No recipient/);
    vi.restoreAllMocks();
    expect((await repo.draft(draft.id))!.status).toBe("DRAFT"); // untouched
    expect((await repo.lead(lead.id))!.status).toBe("DRAFTED"); // untouched
  });
});

describe("F07 — failed classification is retryable, never permanently skipped", () => {
  it("first LLM failure leaves processed_at null; the retry completes with ONE classification and one outcome", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const lead = (await repo.leads()).find((l) => l.status === "OUTCOME_RECORDED")!;
    await repo.updateLead({ ...lead, status: "CONTACTED", thread_key: "thr_f07" });
    const event: InboundEvent = {
      id: "inb_f07", source: "simulated", channel: "email", thread_key: "thr_f07", lead_id: lead.id,
      from_address: "someone@example.com", subject: "Re: your note", body_text: "We are interested — can you demo next week?",
      received_at: ctx.now().toISOString(), raw_ref: "ref_f07", processed_at: null,
    };
    let failFirst = true;
    const flaky = {
      name: "flaky",
      generateStructured: async (req: never) => {
        if (failFirst) { failFirst = false; throw new Error("LLM 503"); }
        return ctx.llm.generateStructured(req);
      },
    };
    const flakyCtx = { ...ctx, llm: flaky as never };
    await expect(handleInbound(repo, event, flakyCtx)).rejects.toThrow("LLM 503");
    const stored = await repo.inboundEventByRef("simulated", "ref_f07");
    expect(stored).toBeTruthy();
    expect(stored!.processed_at).toBeNull(); // stored but NOT marked done
    // Retry the same event (what the poller/webhook now do for unprocessed events):
    const cls = await handleInbound(repo, stored!, flakyCtx);
    expect(cls).toBeTruthy();
    expect((await repo.inboundEventByRef("simulated", "ref_f07"))!.processed_at).not.toBeNull();
    expect((await repo.replyClassifications()).filter((c) => c.event_id === "inb_f07")).toHaveLength(1);
    // Re-running a processed event does not duplicate anything.
    await handleInbound(repo, (await repo.inboundEventByRef("simulated", "ref_f07"))!, flakyCtx);
    expect((await repo.replyClassifications()).filter((c) => c.event_id === "inb_f07")).toHaveLength(1);
    expect((await repo.outcomes()).filter((o) => o.event_id === "inb_f07").length).toBeLessThanOrEqual(1);
  });
});

describe("F10 — re-research works from every state the UI offers it", () => {
  it.each(["RESEARCHED", "QUALIFIED", "REJECTED"] as const)("re-research from %s succeeds", async (status) => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const project = (await repo.projects())[0];
    const lead = await repo.createLead({
      id: `lead_rr_${status}`, project_id: project.id, entity_type: "company", company_name: "Acme AI", website: "https://acme-ai.example.com",
      public_profile_urls: [], source: "manual", discovery_reason: "manual", status, thread_key: null,
      created_at: "2026-09-04T00:00:00.000Z", updated_at: "2026-09-04T00:00:00.000Z",
    });
    await researchLead(repo, lead.id, ctx);
    expect((await repo.lead(lead.id))!.status).toBe("RESEARCHED");
  });

  it("a failed RE-research restores the original status instead of demoting to DISCOVERED", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const project = (await repo.projects())[0];
    const lead = await repo.createLead({
      id: "lead_rr_fail", project_id: project.id, entity_type: "company", company_name: "Acme AI", website: "https://acme-ai.example.com",
      public_profile_urls: [], source: "manual", discovery_reason: "manual", status: "QUALIFIED", thread_key: null,
      created_at: "2026-09-04T00:00:00.000Z", updated_at: "2026-09-04T00:00:00.000Z",
    });
    const boom = { ...ctx, llm: { name: "boom", generateStructured: async () => { throw new Error("research LLM down"); } } as never };
    await expect(researchLead(repo, lead.id, boom)).rejects.toThrow("research LLM down");
    expect((await repo.lead(lead.id))!.status).toBe("QUALIFIED"); // restored, not DISCOVERED
  });
});
