/**
 * Repository boundary.
 *
 * DEMO mode: an in-memory store seeded from fixtures/demo/dataset.json.
 * Writes persist for the lifetime of the server process (kept on globalThis
 * so Next.js dev reloads do not wipe them). Restart = clean demo.
 *
 * LIVE mode: Supabase (see repository.supabase.ts).
 */
import type {
  AgentRun, AuditEvent, DeliveryReceipt, DemoDataset, Evidence, ICPProfile, InboundEvent, Lead,
  LearningInsight, Outcome, OutreachDraft, ProductUnderstanding, Project, QualificationResult, ReplyClassification,
  Signal, TrackedEntity,
} from "@/core/schemas";
import { DemoDataset as DemoDatasetSchema } from "@/core/schemas";
import type { AppConfig } from "@/lib/config";

export interface Repository {
  // projects / product / ICP
  projects(): Promise<Project[]>;
  project(id?: string): Promise<Project>;
  createProject(p: Project): Promise<Project>;
  updateProject(p: Project): Promise<Project>;
  /** Removes the project and everything under it (leads, evidence, runs, signals…). */
  deleteProject(id: string): Promise<void>;
  productUnderstanding(projectId: string): Promise<ProductUnderstanding | undefined>;
  saveProductUnderstanding(pu: ProductUnderstanding): Promise<void>;
  icp(projectId?: string): Promise<ICPProfile | undefined>;
  saveICP(icp: ICPProfile): Promise<void>;

  // leads & intelligence (read + write)
  leads(projectId?: string): Promise<Lead[]>;
  lead(id: string): Promise<Lead | undefined>;
  createLead(lead: Lead): Promise<Lead>;
  updateLead(lead: Lead): Promise<Lead>;
  addEvidence(items: Evidence[]): Promise<void>;
  replaceEvidence(leadId: string, items: Evidence[]): Promise<void>;
  saveQualification(q: QualificationResult): Promise<void>;
  evidenceFor(leadId: string): Promise<Evidence[]>;
  allEvidence(): Promise<Evidence[]>;
  qualifications(): Promise<QualificationResult[]>;
  qualification(leadId: string): Promise<QualificationResult | undefined>;
  drafts(): Promise<OutreachDraft[]>;
  draftsFor(leadId: string): Promise<OutreachDraft[]>;
  draft(id: string): Promise<OutreachDraft | undefined>;
  saveDraft(d: OutreachDraft): Promise<void>;
  receipts(): Promise<DeliveryReceipt[]>;
  addReceipt(r: DeliveryReceipt): Promise<void>;
  inboundEvents(): Promise<InboundEvent[]>;
  inboundEventByRef(source: InboundEvent["source"], rawRef: string): Promise<InboundEvent | undefined>;
  saveInboundEvent(e: InboundEvent): Promise<void>;
  replyClassifications(): Promise<ReplyClassification[]>;
  addReplyClassification(c: ReplyClassification): Promise<void>;
  outcomes(): Promise<Outcome[]>;
  addOutcome(o: Outcome): Promise<void>;
  insights(): Promise<LearningInsight[]>;
  saveInsights(projectId: string, items: LearningInsight[]): Promise<void>;
  leadByThreadKey(threadKey: string): Promise<Lead | undefined>;

  // observability (read + write)
  agentRuns(): Promise<AgentRun[]>;
  addAgentRun(run: AgentRun): Promise<void>;
  updateAgentRun(run: AgentRun): Promise<void>;
  auditEvents(leadId?: string): Promise<AuditEvent[]>;
  addAuditEvent(e: AuditEvent): Promise<void>;

  // source / signal intelligence (Spec v0.3)
  trackedEntities(projectId?: string): Promise<TrackedEntity[]>;
  saveTrackedEntity(e: TrackedEntity): Promise<void>;
  deleteTrackedEntity(id: string): Promise<void>;
  signals(projectId?: string): Promise<Signal[]>;
  addSignal(s: Signal): Promise<void>;
  updateSignal(s: Signal): Promise<void>;
}

interface Store {
  projects: Project[];
  product_understandings: ProductUnderstanding[];
  icps: ICPProfile[];
  leads: Lead[];
  evidence: Evidence[];
  qualifications: QualificationResult[];
  drafts: OutreachDraft[];
  receipts: DeliveryReceipt[];
  inbound_events: InboundEvent[];
  reply_classifications: ReplyClassification[];
  outcomes: Outcome[];
  insights: LearningInsight[];
  agent_runs: AgentRun[];
  audit_events: AuditEvent[];
  tracked_entities: TrackedEntity[];
  signals: Signal[];
}

export class InMemoryRepository implements Repository {
  constructor(private readonly s: Store) {}

  static fromDataset(json: unknown): InMemoryRepository {
    const d: DemoDataset = DemoDatasetSchema.parse(json);
    // structuredClone so the parsed fixture module stays pristine
    return new InMemoryRepository(structuredClone({
      projects: [d.project],
      product_understandings: [d.product_understanding],
      icps: [d.icp],
      leads: d.leads, evidence: d.evidence, qualifications: d.qualifications, drafts: d.drafts, receipts: d.receipts,
      inbound_events: d.inbound_events, reply_classifications: d.reply_classifications, outcomes: d.outcomes,
      insights: d.insights, agent_runs: d.agent_runs, audit_events: d.audit_events,
      tracked_entities: [], signals: [],
    }));
  }

  async projects() { return [...this.s.projects].sort((a, b) => a.created_at.localeCompare(b.created_at)); }
  async project(id?: string) {
    const p = id ? this.s.projects.find((x) => x.id === id) : this.s.projects[0];
    if (!p) throw new Error(`project ${id ?? "(default)"} not found`);
    return p;
  }
  async createProject(p: Project) { this.s.projects.push(p); return p; }
  async updateProject(p: Project) {
    const i = this.s.projects.findIndex((x) => x.id === p.id);
    if (i < 0) throw new Error("project not found");
    this.s.projects[i] = p;
    return p;
  }
  async deleteProject(id: string) {
    const leadIds = new Set(this.s.leads.filter((l) => l.project_id === id).map((l) => l.id));
    const byLead = <T extends { lead_id: string }>(rows: T[]) => rows.filter((r) => !leadIds.has(r.lead_id));
    this.s.projects = this.s.projects.filter((p) => p.id !== id);
    this.s.product_understandings = this.s.product_understandings.filter((x) => x.project_id !== id);
    this.s.icps = this.s.icps.filter((x) => x.project_id !== id);
    this.s.leads = this.s.leads.filter((l) => l.project_id !== id);
    this.s.evidence = byLead(this.s.evidence);
    this.s.qualifications = byLead(this.s.qualifications);
    this.s.drafts = byLead(this.s.drafts);
    this.s.receipts = byLead(this.s.receipts);
    this.s.inbound_events = this.s.inbound_events.filter((e) => !(e.lead_id && leadIds.has(e.lead_id)));
    this.s.reply_classifications = byLead(this.s.reply_classifications);
    this.s.outcomes = byLead(this.s.outcomes);
    this.s.insights = this.s.insights.filter((x) => x.project_id !== id);
    this.s.agent_runs = this.s.agent_runs.filter((x) => x.project_id !== id);
    this.s.audit_events = this.s.audit_events.filter((x) => x.project_id !== id);
    this.s.tracked_entities = this.s.tracked_entities.filter((x) => x.project_id !== id);
    this.s.signals = this.s.signals.filter((x) => x.project_id !== id);
  }
  async productUnderstanding(projectId: string) { return this.s.product_understandings.find((x) => x.project_id === projectId); }
  async saveProductUnderstanding(pu: ProductUnderstanding) {
    const i = this.s.product_understandings.findIndex((x) => x.project_id === pu.project_id);
    if (i >= 0) this.s.product_understandings[i] = pu; else this.s.product_understandings.push(pu);
  }
  async icp(projectId?: string) {
    const pid = projectId ?? this.s.projects[0]?.id;
    return [...this.s.icps].reverse().find((x) => x.project_id === pid);
  }
  async saveICP(icp: ICPProfile) {
    const i = this.s.icps.findIndex((x) => x.id === icp.id);
    if (i >= 0) this.s.icps[i] = icp; else this.s.icps.push(icp);
  }

  async leads(projectId?: string) { return projectId ? this.s.leads.filter((l) => l.project_id === projectId) : this.s.leads; }
  async lead(id: string) { return this.s.leads.find((l) => l.id === id); }
  async createLead(lead: Lead) { this.s.leads.push(lead); return lead; }
  async updateLead(lead: Lead) {
    const i = this.s.leads.findIndex((l) => l.id === lead.id);
    if (i < 0) throw new Error("lead not found");
    this.s.leads[i] = lead;
    return lead;
  }
  async addEvidence(items: Evidence[]) { this.s.evidence.push(...items); }
  async replaceEvidence(leadId: string, items: Evidence[]) {
    this.s.evidence = this.s.evidence.filter((e) => e.lead_id !== leadId);
    this.s.evidence.push(...items);
  }
  async saveQualification(q: QualificationResult) {
    const i = this.s.qualifications.findIndex((x) => x.lead_id === q.lead_id);
    if (i >= 0) this.s.qualifications[i] = q; else this.s.qualifications.push(q);
  }
  async evidenceFor(leadId: string) { return this.s.evidence.filter((e) => e.lead_id === leadId); }
  async allEvidence() { return this.s.evidence; }
  async qualifications() { return this.s.qualifications; }
  async qualification(leadId: string) { return this.s.qualifications.find((q) => q.lead_id === leadId); }
  async drafts() { return this.s.drafts; }
  async draftsFor(leadId: string) { return this.s.drafts.filter((x) => x.lead_id === leadId); }
  async draft(id: string) { return this.s.drafts.find((x) => x.id === id); }
  async saveDraft(d: OutreachDraft) {
    const i = this.s.drafts.findIndex((x) => x.id === d.id);
    if (i >= 0) this.s.drafts[i] = d; else this.s.drafts.push(d);
  }
  async receipts() { return this.s.receipts; }
  async addReceipt(r: DeliveryReceipt) { this.s.receipts.push(r); }
  async inboundEvents() { return this.s.inbound_events; }
  async inboundEventByRef(source: InboundEvent["source"], rawRef: string) { return rawRef ? this.s.inbound_events.find((e) => e.source === source && e.raw_ref === rawRef) : undefined; }
  async saveInboundEvent(e: InboundEvent) {
    const i = this.s.inbound_events.findIndex((x) => x.id === e.id);
    if (i >= 0) this.s.inbound_events[i] = e; else this.s.inbound_events.push(e);
  }
  async replyClassifications() { return this.s.reply_classifications; }
  async addReplyClassification(c: ReplyClassification) { this.s.reply_classifications.push(c); }
  async outcomes() { return this.s.outcomes; }
  async addOutcome(o: Outcome) { this.s.outcomes.push(o); }
  async insights() { return this.s.insights; }
  async saveInsights(projectId: string, items: LearningInsight[]) {
    this.s.insights = this.s.insights.filter((x) => x.project_id !== projectId).concat(items);
  }
  async leadByThreadKey(threadKey: string) { return this.s.leads.find((l) => l.thread_key === threadKey); }

  async agentRuns() { return this.s.agent_runs; }
  async addAgentRun(run: AgentRun) { this.s.agent_runs.push(run); }
  async updateAgentRun(run: AgentRun) {
    const i = this.s.agent_runs.findIndex((x) => x.id === run.id);
    if (i >= 0) this.s.agent_runs[i] = run; else this.s.agent_runs.push(run);
  }
  async auditEvents(leadId?: string) {
    return leadId ? this.s.audit_events.filter((a) => a.lead_id === leadId) : this.s.audit_events;
  }
  async addAuditEvent(e: AuditEvent) { this.s.audit_events.push(e); }

  // -- source / signal intelligence (Spec v0.3) --
  async trackedEntities(projectId?: string) {
    const all = [...this.s.tracked_entities].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return projectId ? all.filter((x) => x.project_id === projectId) : all;
  }
  async saveTrackedEntity(e: TrackedEntity) {
    const i = this.s.tracked_entities.findIndex((x) => x.id === e.id);
    if (i >= 0) this.s.tracked_entities[i] = e; else this.s.tracked_entities.push(e);
  }
  async deleteTrackedEntity(id: string) {
    this.s.tracked_entities = this.s.tracked_entities.filter((x) => x.id !== id);
  }
  async signals(projectId?: string) {
    const all = [...this.s.signals].sort((a, b) => b.observed_at.localeCompare(a.observed_at));
    return projectId ? all.filter((x) => x.project_id === projectId) : all;
  }
  async addSignal(sig: Signal) { this.s.signals.push(sig); }
  async updateSignal(sig: Signal) {
    const i = this.s.signals.findIndex((x) => x.id === sig.id);
    if (i >= 0) this.s.signals[i] = sig; else this.s.signals.push(sig);
  }
}

/** Kept on globalThis so Next.js dev-mode module reloads keep demo writes. */
const g = globalThis as unknown as { __bdRepo?: Repository };

export async function getRepository(cfg: AppConfig): Promise<Repository> {
  if (g.__bdRepo) return g.__bdRepo;
  if (cfg.mode === "live" && cfg.supabaseUrl) {
    const { SupabaseRepository } = await import("./repository.supabase");
    g.__bdRepo = new SupabaseRepository(cfg);
    return g.__bdRepo;
  }
  const json = (await import("../../fixtures/demo/dataset.json")).default;
  g.__bdRepo = InMemoryRepository.fromDataset(json);
  return g.__bdRepo;
}

/** Test helper. */
export function resetRepositoryCache() { g.__bdRepo = undefined; }
