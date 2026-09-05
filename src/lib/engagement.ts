/**
 * Engagement (Spec §18–§20, v0.2 S3–S4): Draft → Human approval → Delivery →
 * Inbound → Reply Agent → Outcome. Every external message stays DRAFT until a
 * human approves it; only the DeliveryAdapter decides what "send" means.
 */
import { outreachAgent } from "@/agents/outreach";
import { replyAgent } from "@/agents/reply";
import { learningAgent } from "@/agents/learning";
import { createDeliveryAdapter } from "@/adapters/delivery";
import type { AgentContext } from "@/core/orchestrator/agent";
import { transition } from "@/core/orchestrator/lead-state";
import { runAgent, newId } from "@/core/orchestrator/run";
import type { AuditEvent, InboundEvent, Lead, Outcome, OutcomeKind, OutreachDraft, ReplyClassification } from "@/core/schemas";
import { getConfig } from "@/lib/config";
import { agentContext } from "@/lib/context";
import type { Repository } from "@/lib/repository";

async function audit(repo: Repository, lead: Lead, actor: AuditEvent["actor"], action: string, detail = "") {
  await repo.addAuditEvent({ id: newId("aud"), project_id: lead.project_id, lead_id: lead.id, actor, action, detail, created_at: new Date().toISOString() });
}
async function getLead(repo: Repository, id: string): Promise<Lead> {
  const l = await repo.lead(id);
  if (!l) throw new Error("lead not found");
  return l;
}
export async function latestDraft(repo: Repository, leadId: string): Promise<OutreachDraft | undefined> {
  return (await repo.draftsFor(leadId)).sort((a, b) => b.version - a.version)[0];
}

// ---------------------------------------------------------------------------
// Draft generation
// ---------------------------------------------------------------------------
export type Tone = OutreachDraft["tone"];

export async function generateDraft(repo: Repository, leadId: string, tone: Tone = "professional", ctx: AgentContext = agentContext()): Promise<OutreachDraft> {
  const lead = await getLead(repo, leadId);
  if (!["QUALIFIED", "REVIEW", "DRAFTED"].includes(lead.status)) throw new Error(`Cannot draft from status ${lead.status}`);
  const [project, icp, evidence, previous] = await Promise.all([repo.project(lead.project_id), repo.icp(lead.project_id), repo.evidenceFor(leadId), latestDraft(repo, leadId)]);
  if (!icp) throw new Error("project has no ICP");
  if (!evidence.some((e) => e.polarity === "positive")) throw new Error("No positive evidence — refusing to draft an ungrounded message");

  // QUALIFIED → REVIEW happens the first time a human asks for a draft.
  let status = lead.status;
  if (status === "QUALIFIED") { status = transition(status, "REVIEW"); await repo.updateLead({ ...lead, status, updated_at: ctx.now().toISOString() }); await audit(repo, lead, "user", "lead.review_started"); }

  const { output } = await runAgent(repo, outreachAgent, { project, icp, lead: { ...lead, status }, evidence, tone }, ctx, {
    project_id: lead.project_id, lead_id: lead.id, input_summary: `${evidence.length} evidence · ${tone}`, summarize: (o) => o.subject,
  });
  const version = (previous?.version ?? 0) + 1;
  if (previous && previous.status === "DRAFT") await repo.saveDraft({ ...previous, status: "SUPERSEDED" });
  const draft: OutreachDraft = { ...output, version };
  await repo.saveDraft(draft);
  if (status !== "DRAFTED") await repo.updateLead({ ...lead, status: transition(status, "DRAFTED"), updated_at: ctx.now().toISOString() });
  await audit(repo, lead, "agent", previous ? "draft.regenerated" : "draft.created", `v${version} · ${draft.subject}`);
  return draft;
}

// ---------------------------------------------------------------------------
// Human review actions (§19)
// ---------------------------------------------------------------------------
export async function editDraft(repo: Repository, draftId: string, subject: string, body: string): Promise<OutreachDraft> {
  const prev = await repo.draft(draftId);
  if (!prev) throw new Error("draft not found");
  if (prev.status !== "DRAFT") throw new Error(`Only DRAFT can be edited (is ${prev.status})`);
  const lead = await getLead(repo, prev.lead_id);
  const next: OutreachDraft = { ...prev, id: newId("draft"), subject: subject.trim(), body: body.trim(), version: prev.version + 1, human_edited: true, created_at: new Date().toISOString(), approved_at: null };
  if (!next.subject || !next.body) throw new Error("Subject and body are required");
  await repo.saveDraft({ ...prev, status: "SUPERSEDED" });
  await repo.saveDraft(next);
  await audit(repo, lead, "user", "draft.human_edited", `v${next.version} — evidence grounding not revalidated`);
  return next;
}

export async function rejectDraft(repo: Repository, draftId: string): Promise<void> {
  const d = await repo.draft(draftId);
  if (!d) throw new Error("draft not found");
  if (d.status !== "DRAFT") throw new Error(`Only DRAFT can be rejected (is ${d.status})`);
  const lead = await getLead(repo, d.lead_id);
  await repo.saveDraft({ ...d, status: "REJECTED" });
  // Lead returns to REVIEW so the user can regenerate or reject the lead itself.
  if (lead.status === "DRAFTED") await repo.updateLead({ ...lead, status: transition("DRAFTED", "REVIEW"), updated_at: new Date().toISOString() });
  await audit(repo, lead, "user", "draft.rejected", `v${d.version}`);
}

export interface SendResult { draft: OutreachDraft; receipt: import("@/core/schemas").DeliveryReceipt }

/** Approve & Send (v0.2 S3). Same action in both modes; the adapter decides. */
export async function approveAndSend(repo: Repository, draftId: string, ctx: AgentContext = agentContext()): Promise<SendResult> {
  const cfg = getConfig();
  const d = await repo.draft(draftId);
  if (!d) throw new Error("draft not found");
  if (d.status !== "DRAFT" && d.status !== "FAILED") throw new Error(`Only DRAFT (or FAILED, to retry) can be approved (is ${d.status})`);
  const lead = await getLead(repo, d.lead_id);
  if (lead.status !== "DRAFTED") throw new Error(`Lead must be DRAFTED to send (is ${lead.status})`);

  // Everything that can be validated up front happens BEFORE any state change
  // (review v6 F06): a missing recipient or broken adapter must not strand the
  // lead in APPROVED.
  const to = cfg.mode === "demo"
    ? { address: lead.contact_email ?? `hello@${(lead.website ?? "example.com").replace(/^https?:\/\//, "")}` }
    : { address: cfg.demoRecipientOverride ?? lead.contact_email ?? "" };
  if (!to.address) throw new Error("No recipient: set the lead's contact email or DEMO_RECIPIENT_OVERRIDE");
  const delivery = await createDeliveryAdapter(cfg);

  // Atomic claim (review v6 F05): only one of two concurrent approvals gets
  // the draft; the loser changes nothing and reports it.
  const approvedAt = ctx.now().toISOString();
  const approved = await repo.claimDraft(draftId, approvedAt);
  if (!approved) throw new Error("This draft is already being sent by another request");
  await repo.updateLead({ ...lead, status: transition("DRAFTED", "APPROVED"), updated_at: approvedAt });
  await audit(repo, lead, "user", "draft.approved", `v${d.version}${d.status === "FAILED" ? " (retry)" : ""}`);

  // A failed delivery hands everything back (review v6 F06): draft → FAILED,
  // lead → DRAFTED, so the user can fix the cause and approve again — no DB
  // surgery, no duplicate send.
  const revert = async (reason: string) => {
    await repo.saveDraft({ ...approved, status: "FAILED" });
    await repo.updateLead({ ...lead, status: transition("APPROVED", "DRAFTED"), updated_at: ctx.now().toISOString() });
    await audit(repo, lead, "system", "delivery.failed", reason);
  };

  let receipt;
  try {
    receipt = await delivery.send(approved, lead, to, { now: ctx.now, newId: ctx.newId });
  } catch (e) {
    await revert((e as Error).message.slice(0, 300));
    throw new Error(`Delivery failed: ${(e as Error).message}`);
  }
  await repo.addReceipt(receipt);
  if (receipt.error) {
    await revert(receipt.error);
    throw new Error(`Delivery failed: ${receipt.error}`);
  }
  const sent: OutreachDraft = { ...approved, status: "SENT" };
  await repo.saveDraft(sent);
  await repo.updateLead({ ...lead, status: transition("APPROVED", "CONTACTED"), thread_key: receipt.thread_key, updated_at: receipt.sent_at });
  await audit(repo, lead, "system", receipt.simulated ? "delivery.simulated" : "delivery.sent", `${receipt.provider} · ${to.address} · thread ${receipt.thread_key}`);
  return { draft: sent, receipt };
}

// ---------------------------------------------------------------------------
// Inbound → Reply Agent → Outcome (v0.2 S4)
// ---------------------------------------------------------------------------
export async function handleInbound(repo: Repository, event: InboundEvent, ctx: AgentContext = agentContext()): Promise<ReplyClassification | null> {
  // Idempotent on provider reference — but the SAME event (identical id) must
  // proceed: the webhook route persists it before acking for durability, and
  // bailing here would permanently skip classification (P0 from external
  // review). saveInboundEvent upserts by id, so re-saving below is safe.
  if (event.raw_ref) {
    const existing = await repo.inboundEventByRef(event.source, event.raw_ref);
    if (existing && existing.id !== event.id) return null;
  }
  let lead = event.lead_id ? await repo.lead(event.lead_id) : undefined;
  if (!lead && event.thread_key) lead = await repo.leadByThreadKey(event.thread_key);
  const stored: InboundEvent = { ...event, lead_id: lead?.id ?? null };
  await repo.saveInboundEvent(stored);
  if (!lead) return null; // kept for manual triage; nothing to classify against

  if (lead.status === "CONTACTED") {
    lead = { ...lead, status: transition("CONTACTED", "REPLIED"), updated_at: ctx.now().toISOString() };
    await repo.updateLead(lead);
  }
  await audit(repo, lead, "system", "inbound.received", stored.subject);

  // Retryable processing (review v6 F07): a failed classification leaves the
  // event stored with processed_at=null, and the poller/webhook re-enters here
  // for exactly such events. Each step is idempotent — an existing
  // classification/outcome for this event is reused, never duplicated — and
  // processed_at is written LAST, only after the outcome step completed.
  let cls = (await repo.replyClassifications()).find((c) => c.event_id === stored.id);
  if (!cls) {
    const draft = await latestDraft(repo, lead.id);
    const { output, run } = await runAgent(repo, replyAgent, { event: stored, lead, draft: draft ?? null }, ctx, {
      project_id: lead.project_id, lead_id: lead.id, input_summary: stored.subject, summarize: (o) => `${o.outcome} (${o.confidence})`,
    });
    cls = { ...output, agent_run_id: run.id };
    await repo.addReplyClassification(cls);
  }

  if (cls.outcome !== "auto_reply" && cls.outcome !== "unclassified" && !cls.needs_human) {
    const already = (await repo.outcomes()).some((o) => o.event_id === stored.id);
    if (!already) await recordOutcome(repo, lead.id, cls.outcome, cls.rationale, { recorded_by: "reply_agent", event_id: stored.id, occurred_at: stored.received_at, ctx });
  } else {
    await audit(repo, lead, "agent", "reply.needs_review", `${cls.outcome} · ${cls.rationale}`);
  }
  await repo.saveInboundEvent({ ...stored, processed_at: cls.created_at });
  return cls;
}

/** DEMO helper + local testing: inject a reply without a real mailbox. */
export async function simulateReply(repo: Repository, leadId: string, subject: string, body: string, ctx: AgentContext = agentContext()) {
  const lead = await getLead(repo, leadId);
  if (!["CONTACTED", "REPLIED"].includes(lead.status)) throw new Error(`Lead must be CONTACTED to receive a reply (is ${lead.status})`);
  const event: InboundEvent = {
    id: ctx.newId("inb"), source: "simulated", channel: "email", thread_key: lead.thread_key, lead_id: lead.id,
    from_address: lead.contact_email ?? `reply@${(lead.website ?? "example.com").replace(/^https?:\/\//, "")}`,
    subject, body_text: body, received_at: ctx.now().toISOString(), raw_ref: "", processed_at: null,
  };
  return handleInbound(repo, event, ctx);
}

// ---------------------------------------------------------------------------
// Outcomes (§20) + Learning refresh (§21)
// ---------------------------------------------------------------------------
export async function recordOutcome(
  repo: Repository, leadId: string, outcome: OutcomeKind, notes = "",
  opts: { recorded_by?: Outcome["recorded_by"]; event_id?: string | null; occurred_at?: string | null; ctx?: AgentContext } = {},
): Promise<Outcome> {
  const ctx = opts.ctx ?? agentContext();
  const lead = await getLead(repo, leadId);
  if (!["CONTACTED", "REPLIED", "OUTCOME_RECORDED"].includes(lead.status)) throw new Error(`Cannot record an outcome for status ${lead.status}`);
  const recordedAt = ctx.now().toISOString();
  const row: Outcome = {
    id: ctx.newId("out"), lead_id: leadId, outcome, notes, recorded_by: opts.recorded_by ?? "user",
    event_id: opts.event_id ?? null,
    // The business event's own time (review v6 F14): a reply's received time,
    // or "now" for a manual decision made in the moment.
    occurred_at: opts.occurred_at ?? recordedAt,
    recorded_at: recordedAt,
  };
  await repo.addOutcome(row); // never overwrites: overrides are additional rows (audit)
  if (lead.status !== "OUTCOME_RECORDED") await repo.updateLead({ ...lead, status: transition(lead.status, "OUTCOME_RECORDED"), updated_at: row.recorded_at });
  await audit(repo, lead, row.recorded_by === "user" ? "user" : "agent", "outcome.recorded", outcome);
  // A human outcome closes the human work-ticket(s) it answers (review v6
  // F15): the one for this event, or — recorded from the lead screen without
  // an event — every ticket still pending on this lead. The model's original
  // classification (needs_human, confidence) is never rewritten.
  if (row.recorded_by === "user") {
    const pending = (await repo.replyClassifications()).filter((c) =>
      c.lead_id === leadId && c.needs_human && c.review_status === "pending" && (!opts.event_id || c.event_id === opts.event_id));
    for (const c of pending) {
      await repo.updateReplyClassification({ ...c, review_status: "resolved", resolved_at: recordedAt });
      await audit(repo, lead, "user", "reply.review_resolved", `${c.outcome} → ${outcome}`);
    }
  }
  await refreshInsights(repo, lead.project_id, ctx);
  return row;
}

/** Close a needs-human ticket WITHOUT recording an outcome (review v6 F15):
 *  the human looked and decided nothing needs recording. The model's original
 *  classification stays untouched for audit. */
export async function dismissReview(repo: Repository, classificationId: string): Promise<void> {
  const c = (await repo.replyClassifications()).find((x) => x.id === classificationId);
  if (!c) throw new Error("classification not found");
  if (c.review_status !== "pending") throw new Error(`Ticket already ${c.review_status}`);
  await repo.updateReplyClassification({ ...c, review_status: "dismissed", resolved_at: new Date().toISOString() });
  const lead = await repo.lead(c.lead_id);
  if (lead) await audit(repo, lead, "user", "reply.review_dismissed", c.outcome);
}

/** Assign an unmatched inbound event to a lead (review v6 F15) and run the
 *  normal classification path on it. Only leads we actually contacted can
 *  receive a reply. */
export async function assignInbound(repo: Repository, eventId: string, leadId: string, ctx: AgentContext = agentContext()): Promise<ReplyClassification | null> {
  const event = (await repo.inboundEvents()).find((e) => e.id === eventId);
  if (!event) throw new Error("inbound event not found");
  if (event.lead_id) throw new Error("event is already matched to a lead");
  const lead = await getLead(repo, leadId);
  if (!["CONTACTED", "REPLIED", "OUTCOME_RECORDED"].includes(lead.status)) throw new Error(`Cannot assign a reply to a lead that was never contacted (is ${lead.status})`);
  await audit(repo, lead, "user", "inbound.assigned", `${event.from_address} · ${event.subject}`);
  return handleInbound(repo, { ...event, lead_id: lead.id }, ctx);
}

export async function refreshInsights(repo: Repository, projectId: string, ctx: AgentContext = agentContext()) {
  const [leads, qualifications, evidence, outcomes] = await Promise.all([repo.leads(projectId), repo.qualifications(), repo.allEvidence(), repo.outcomes()]);
  const ids = new Set(leads.map((l) => l.id));
  const { output } = await runAgent(repo, learningAgent, {
    project_id: projectId, leads,
    qualifications: qualifications.filter((q) => ids.has(q.lead_id)),
    evidence: evidence.filter((e) => ids.has(e.lead_id)),
    outcomes: outcomes.filter((o) => ids.has(o.lead_id)),
  }, ctx, { project_id: projectId, input_summary: `${outcomes.length} outcomes`, summarize: (o) => `${o.length} insights` });
  await repo.saveInsights(projectId, output);
  return output;
}
