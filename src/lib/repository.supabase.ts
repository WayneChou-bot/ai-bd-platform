/**
 * Supabase-backed repository (LIVE). Reads and the Phase 1 write paths.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  AgentRun, AuditEvent, DeliveryReceipt, Evidence, ICPProfile, InboundEvent, Lead, LearningInsight,
  Outcome, OutreachDraft, ProductUnderstanding, Project, QualificationResult, ReplyClassification,
  Signal, TrackedEntity,
} from "@/core/schemas";
import type { AppConfig } from "@/lib/config";
import type { Repository } from "./repository";

type Filter = Record<string, string>;

export class SupabaseRepository implements Repository {
  private readonly sb: SupabaseClient;
  constructor(cfg: AppConfig) {
    if (!cfg.supabaseUrl || !cfg.supabaseServiceKey) throw new Error("Supabase credentials missing");
    this.sb = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, { auth: { persistSession: false } });
  }

  private async rows<T extends z.ZodTypeAny>(table: string, schema: T, eq: Filter = {}, order?: string): Promise<z.infer<T>[]> {
    let q = this.sb.from(table).select("*");
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
    if (order) q = q.order(order);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    return z.array(schema).parse((data ?? []).map((r) => normalizeRow(schema, r as Record<string, unknown>)));
  }
  private async upsert(table: string, row: Record<string, unknown>, onConflict = "id") {
    const { error } = await this.sb.from(table).upsert(row, { onConflict });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }

  // ---- projects / product / ICP -------------------------------------------
  async projects() { return this.rows("projects", Project, {}, "created_at"); }
  async project(id?: string) {
    const list = id ? await this.rows("projects", Project, { id }) : await this.projects();
    if (!list[0]) throw new Error(`project ${id ?? "(default)"} not found`);
    return list[0];
  }
  async createProject(p: Project) { await this.upsert("projects", p); return p; }
  async updateProject(p: Project) { await this.upsert("projects", p); return p; }
  async deleteProject(id: string) {
    // FK cascades from 0001/0004 remove all child rows.
    const { error } = await this.sb.from("projects").delete().eq("id", id);
    if (error) throw new Error(`projects delete: ${error.message}`);
  }
  async productUnderstanding(projectId: string) { return (await this.rows("product_understandings", ProductUnderstanding, { project_id: projectId }))[0]; }
  async saveProductUnderstanding(pu: ProductUnderstanding) { await this.upsert("product_understandings", pu, "project_id"); }
  async icp(projectId?: string) {
    const pid = projectId ?? (await this.project()).id;
    const rows = await this.rows("icp_profiles", IcpRow, { project_id: pid }, "created_at");
    const r = rows.at(-1);
    return r ? fromIcpRow(r) : undefined;
  }
  async saveICP(icp: ICPProfile) { await this.upsert("icp_profiles", toIcpRow(icp)); }

  // ---- reads ----------------------------------------------------------------
  async leads(projectId?: string) { return this.rows("leads", Lead, projectId ? { project_id: projectId } : {}); }
  async lead(id: string) { return (await this.rows("leads", Lead, { id }))[0]; }
  async createLead(lead: Lead) { await this.upsert("leads", lead); return lead; }
  async updateLead(lead: Lead) { await this.upsert("leads", lead); return lead; }
  async addEvidence(items: Evidence[]) { for (const e of items) await this.upsert("evidence", e); }
  async replaceEvidence(leadId: string, items: Evidence[]) {
    const { error } = await this.sb.from("evidence").delete().eq("lead_id", leadId);
    if (error) throw new Error(`evidence delete: ${error.message}`);
    await this.addEvidence(items);
  }
  async saveQualification(q: QualificationResult) {
    const { breakdown, ...rest } = q;
    await this.upsert("qualification_scores", { ...rest, ...breakdown }, "lead_id");
  }
  async evidenceFor(leadId: string) { return this.rows("evidence", Evidence, { lead_id: leadId }); }
  async allEvidence() { return this.rows("evidence", Evidence); }
  async qualifications() { return (await this.rows("qualification_scores", QualRow)).map(fromQualRow); }
  async qualification(leadId: string) { return (await this.rows("qualification_scores", QualRow, { lead_id: leadId })).map(fromQualRow)[0]; }
  async drafts() { return this.rows("outreach_drafts", OutreachDraft); }
  async draftsFor(leadId: string) { return this.rows("outreach_drafts", OutreachDraft, { lead_id: leadId }); }
  async draft(id: string) { return (await this.rows("outreach_drafts", OutreachDraft, { id }))[0]; }
  async saveDraft(d: OutreachDraft) { await this.upsert("outreach_drafts", d); }
  async claimDraft(id: string, approvedAt: string) {
    // Conditional update — the WHERE clause makes the claim atomic in the DB,
    // so only one of two concurrent approvals gets rows back (review v6 F05).
    const { data, error } = await this.sb.from("outreach_drafts")
      .update({ status: "APPROVED", approved_at: approvedAt })
      .eq("id", id).in("status", ["DRAFT", "FAILED"]).select();
    if (error) throw new Error(`outreach_drafts claim: ${error.message}`);
    const row = (data ?? [])[0];
    return row ? OutreachDraft.parse(normalizeRow(OutreachDraft, row as Record<string, unknown>)) : null;
  }
  async receipts() { return this.rows("delivery_receipts", DeliveryReceipt); }
  async addReceipt(r: DeliveryReceipt) { await this.upsert("delivery_receipts", r); }
  async inboundEvents() { return this.rows("inbound_events", InboundEvent); }
  async inboundEventByRef(source: InboundEvent["source"], rawRef: string) { return rawRef ? (await this.rows("inbound_events", InboundEvent, { source, raw_ref: rawRef }))[0] : undefined; }
  async saveInboundEvent(e: InboundEvent) { await this.upsert("inbound_events", e); }
  async replyClassifications() { return this.rows("reply_classifications", ReplyClassification); }
  async addReplyClassification(c: ReplyClassification) { await this.upsert("reply_classifications", c); }
  async outcomes() { return this.rows("outcomes", Outcome, {}, "recorded_at"); }
  async addOutcome(o: Outcome) { await this.upsert("outcomes", o); }
  async insights() { return this.rows("learning_insights", LearningInsight); }
  async saveInsights(projectId: string, items: LearningInsight[]) {
    const { error } = await this.sb.from("learning_insights").delete().eq("project_id", projectId);
    if (error) throw new Error(`insights delete: ${error.message}`);
    for (const i of items) await this.upsert("learning_insights", i);
  }
  async leadByThreadKey(threadKey: string) { return (await this.rows("leads", Lead, { thread_key: threadKey }))[0]; }

  // ---- observability --------------------------------------------------------
  async agentRuns() { return this.rows("agent_runs", AgentRun, {}, "created_at"); }
  async addAgentRun(run: AgentRun) { await this.upsert("agent_runs", run); }
  async updateAgentRun(run: AgentRun) { await this.upsert("agent_runs", run); }
  async auditEvents(leadId?: string) { return this.rows("audit_events", AuditEvent, leadId ? { lead_id: leadId } : {}, "created_at"); }
  async addAuditEvent(e: AuditEvent) { await this.upsert("audit_events", e); }

  // -- source / signal intelligence (Spec v0.3) --
  async trackedEntities(projectId?: string) { return this.rows("tracked_entities", TrackedEntity, projectId ? { project_id: projectId } : {}, "created_at"); }
  async saveTrackedEntity(e: TrackedEntity) { await this.upsert("tracked_entities", e); }
  async deleteTrackedEntity(id: string) {
    const { error } = await this.sb.from("tracked_entities").delete().eq("id", id);
    if (error) throw new Error(`tracked_entities delete: ${error.message}`);
  }
  async signals(projectId?: string) { return this.rows("signals", Signal, projectId ? { project_id: projectId } : {}, "observed_at"); }
  async addSignal(sig: Signal) { await this.upsert("signals", sig); }
  async updateSignal(sig: Signal) { await this.upsert("signals", sig); }
}

// ---- row shapes that differ from the domain schema --------------------------
const IcpRow = ICPProfile.omit({ company_size: true }).extend({
  company_size_min: z.number().nullable(),
  company_size_max: z.number().nullable(),
});
function fromIcpRow(r: z.infer<typeof IcpRow>): ICPProfile {
  const { company_size_min, company_size_max, ...rest } = r;
  return { ...rest, company_size: company_size_min != null && company_size_max != null ? { min: company_size_min, max: company_size_max } : undefined };
}
function toIcpRow(i: ICPProfile): z.infer<typeof IcpRow> {
  const { company_size, ...rest } = i;
  return { ...rest, company_size_min: company_size?.min ?? null, company_size_max: company_size?.max ?? null };
}

const QualRow = z.object({
  lead_id: z.string(),
  product_fit: z.number(), problem_evidence: z.number(), intent_signal: z.number(),
  role_relevance: z.number(), data_confidence: z.number(),
  total_score: z.number(), classification: QualificationResult.shape.classification,
  why: QualificationResult.shape.why, risks: z.array(z.string()), rationale: z.string(),
  withheld: z.boolean(), scored_at: z.string(),
});
function fromQualRow(r: z.infer<typeof QualRow>): QualificationResult {
  const { product_fit, problem_evidence, intent_signal, role_relevance, data_confidence, ...rest } = r;
  return { ...rest, breakdown: { product_fit, problem_evidence, intent_signal, role_relevance, data_confidence } };
}

/**
 * SQL NULL → domain optional (review v6 F08). Postgres returns null for empty
 * optional columns; z.string().optional() accepts undefined but not null, so a
 * legally-sparse row failed to read back. Nulls are dropped ONLY where the
 * field schema rejects null — deliberately nullable fields (thread_key,
 * approved_at, token_usage, …) keep their null.
 */
export function normalizeRow<T extends z.ZodTypeAny>(schema: T, row: Record<string, unknown>): Record<string, unknown> {
  const shape = (schema as unknown as { shape?: Record<string, z.ZodTypeAny> }).shape;
  if (!shape) return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null && shape[k] && !shape[k].safeParse(null).success) continue;
    out[k] = v;
  }
  return out;
}
