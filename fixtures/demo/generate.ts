/**
 * Demo dataset generator (Spec v0.2 S7).
 *
 * Runs the REAL agents (qualification, outreach, reply, learning) with the
 * MockLLMProvider over the hand-authored seeds, so every number in the
 * fixture is produced by the same code the app runs. Deterministic: same
 * seeds → byte-identical dataset.json.
 *
 *   npm run fixtures
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DemoDataset, type AgentRun, type AuditEvent, type DeliveryReceipt, type Evidence, type ICPProfile, type InboundEvent,
  type Lead, type LeadStatus, type Outcome, type OutreachDraft, type Project, type QualificationResult, type ReplyClassification,
} from "@/core/schemas";
import { qualificationAgent } from "@/agents/qualification";
import { outreachAgent } from "@/agents/outreach";
import { replyAgent } from "@/agents/reply";
import { buildInsights } from "@/agents/learning";
import { createDemoMockProvider } from "@/adapters/llm/mock-fixtures";
import { MockDeliveryAdapter } from "@/adapters/delivery";
import { SimulatedInboundSource } from "@/adapters/inbound";
import type { AgentContext } from "@/core/orchestrator/agent";
import { COMPANIES } from "./companies";

// ---------------------------------------------------------------------------
// Deterministic clock + ids
// ---------------------------------------------------------------------------
const BASE = new Date("2026-07-01T09:00:00.000Z");
const day = (n: number, h = 0) => new Date(BASE.getTime() + n * 86_400_000 + h * 3_600_000).toISOString();
const counters = new Map<string, number>();
const newId = (prefix: string) => {
  const n = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, n);
  return `${prefix}_${String(n).padStart(3, "0")}`;
};

/** A tiny seeded PRNG so failure injection / latencies are stable. */
let seed = 20260801;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

async function main() {
  const llm = createDemoMockProvider();
  let clockDay = 0;
  const ctx: AgentContext = { llm, now: () => new Date(day(clockDay)), newId };

  // --- Project / product / ICP ---------------------------------------------
  const project: Project = {
    id: "proj_001",
    name: "LLM Wiki Agent",
    category: "Developer Tool / Knowledge Management",
    description: "Multi-agent system that transforms raw source material into role-specific interconnected knowledge pages.",
    website: "https://github.com/WayneChou-bot/LLM-Wiki-Agent-Workflow-Demo",
    repository: "https://github.com/WayneChou-bot/LLM-Wiki-Agent-Workflow-Demo",
    created_at: day(0),
  };
  const product_understanding = {
    project_id: project.id,
    category: "Developer Tool",
    problem: ["fragmented technical knowledge", "role-specific information overload", "documentation drift"],
    value_propositions: ["automatic knowledge structuring", "multi-perspective documentation", "always-current role-aware pages"],
    target_roles: ["Developer Relations", "Knowledge Manager", "AI Platform Engineer", "Engineering Productivity"],
    target_company_types: ["AI infrastructure company", "developer tools company", "engineering-heavy SaaS"],
    confidence: 0.9,
    generated_at: day(0, 1),
  };
  const icp: ICPProfile = {
    id: "icp_001",
    project_id: project.id,
    source: "ai_suggested",
    target_entity: "both",
    industries: ["AI / Developer Tools / SaaS", "Engineering-heavy product companies"],
    company_size: { min: 20, max: 2000 },
    regions: ["North America", "Europe"],
    technologies: ["Markdown documentation", "RAG", "LLM agents", "GitHub"],
    target_roles: ["Developer Relations", "AI Platform", "Knowledge Management", "Engineering Productivity"],
    business_problems: ["fragmented documentation", "slow onboarding", "documentation drift"],
    positive_signals: ["Hiring knowledge engineers", "Launching RAG systems", "Using Markdown documentation", "Publishing AI-agent projects"],
    negative_signals: ["Recruitment agency", "Consulting-only company", "No technical team"],
    created_at: day(0, 2),
  };

  const leads: Lead[] = [];
  const evidence: Evidence[] = [];
  const qualifications: QualificationResult[] = [];
  const drafts: OutreachDraft[] = [];
  const receipts: DeliveryReceipt[] = [];
  const inbound_events: InboundEvent[] = [];
  const reply_classifications: ReplyClassification[] = [];
  const outcomes: Outcome[] = [];
  const agent_runs: AgentRun[] = [];
  const audit_events: AuditEvent[] = [];

  const audit = (leadId: string | null, actor: AuditEvent["actor"], action: string, detail: string, at: string) =>
    audit_events.push({ id: newId("aud"), project_id: project.id, lead_id: leadId, actor, action, detail, created_at: at });

  const run = (agent: AgentRun["agent"], leadId: string | null, at: string, opts: { fail?: boolean; retry?: boolean; input?: string; output?: string } = {}) => {
    const latency = Math.round(400 + rand() * 2600);
    const started = new Date(at).getTime();
    const failed = !!opts.fail;
    agent_runs.push({
      id: newId("run"),
      project_id: project.id,
      agent,
      lead_id: leadId,
      status: failed ? "FAILED" : "COMPLETED",
      started_at: at,
      completed_at: new Date(started + latency).toISOString(),
      latency_ms: latency,
      model: agent === "learning" || agent === "discovery" ? null : "mock",
      token_usage: agent === "learning" || agent === "discovery" ? null : { input: Math.round(800 + rand() * 1200), output: Math.round(150 + rand() * 400) },
      retry_count: opts.retry ? 1 : 0,
      error: failed ? "Source unavailable (HTTP 503) — retry 1 / 2 scheduled" : null,
      input_summary: opts.input ?? "",
      output_summary: opts.output ?? "",
      created_at: at,
    });
  };

  // Product understanding + discovery runs
  run("product_understanding", null, day(0, 1), { input: "README + website", output: "category=Developer Tool, 3 problems, 3 value props" });
  run("discovery", null, day(0, 3), { input: "ICP icp_001 across search/github/csv", output: `${COMPANIES.length} candidates` });

  const deliver = new MockDeliveryAdapter();
  const inboundSource = new SimulatedInboundSource();
  const mix = { HIGH_FIT: 0, MEDIUM_FIT: 0, LOW_FIT: 0, REJECT: 0 };

  for (const [i, c] of COMPANIES.entries()) {
    clockDay = 1 + Math.floor(i / 5); // discovery spread over a week
    const website = `https://${c.slug}.example.com`;
    const lead: Lead = {
      id: newId("lead"),
      project_id: project.id,
      entity_type: c.entity_type ?? "company",
      company_name: c.name,
      display_name: c.display_name,
      headline: c.headline,
      public_profile_urls: c.entity_type === "individual" ? [`${website}/github`] : [],
      website,
      industry: c.industry,
      size_estimate: c.size,
      location: c.location,
      source: c.source,
      discovery_reason: c.reason,
      status: "DISCOVERED",
      thread_key: null,
      created_at: day(clockDay),
      updated_at: day(clockDay),
    };
    leads.push(lead);
    audit(lead.id, "agent", "lead.discovered", c.reason, lead.created_at);

    // Research — evidence from seeds. One injected failure with retry (§41).
    const researchAt = day(clockDay, 2);
    const injectFailure = i === 7;
    if (injectFailure) {
      run("research", lead.id, researchAt, { fail: true, input: website });
      run("research", lead.id, day(clockDay, 3), { retry: true, input: website, output: `${c.evidence.length} evidence records` });
    } else {
      run("research", lead.id, researchAt, { input: website, output: `${c.evidence.length} evidence records` });
    }
    const leadEvidence: Evidence[] = c.evidence.map((e) => ({
      id: newId("ev"),
      lead_id: lead.id,
      type: e.type,
      category: e.category,
      claim: e.claim,
      source_url: `${website}${e.path}`,
      observed_at: day(clockDay - e.daysAgo),
      confidence: e.conf,
      supports: e.supports,
      polarity: e.negative ? "negative" : "positive",
    }));
    evidence.push(...leadEvidence);
    lead.status = "RESEARCHED";

    // Qualification — the real agent
    clockDay += 0; // same day
    const q = await qualificationAgent.run({ lead, icp, evidence: leadEvidence }, { ...ctx, now: () => new Date(day(clockDay, 4)) });
    qualifications.push(q);
    mix[q.classification]++;
    run("qualification", lead.id, day(clockDay, 4), { input: `${leadEvidence.length} evidence`, output: q.withheld ? "score withheld" : `${q.total_score} ${q.classification}` });
    if (q.classification !== c.expected) {
      console.warn(`⚠ ${c.name}: expected ${c.expected}, got ${q.classification} (${q.total_score})`);
    }
    if (q.classification === "REJECT" || q.classification === "LOW_FIT") {
      lead.status = "REJECTED";
      audit(lead.id, "agent", "lead.rejected", q.withheld ? "Insufficient evidence — score withheld" : q.rationale, day(clockDay, 4));
      lead.updated_at = day(clockDay, 4);
      continue;
    }
    lead.status = "QUALIFIED";
    audit(lead.id, "agent", "lead.qualified", `${q.total_score} ${q.classification}`, day(clockDay, 4));

    // Human review → draft
    const reviewDay = clockDay + 2;
    lead.status = "REVIEW";
    audit(lead.id, "user", "lead.review_started", "", day(reviewDay, 1));
    if (c.stopAt === "REVIEW") { lead.updated_at = day(reviewDay, 1); continue; }

    const draft = await outreachAgent.run(
      { project, icp, lead, evidence: leadEvidence, tone: "professional" },
      { ...ctx, now: () => new Date(day(reviewDay, 2)) },
    );
    run("outreach", lead.id, day(reviewDay, 2), { input: `${draft.evidence_used.length} evidence`, output: draft.subject });
    drafts.push(draft);
    lead.status = "DRAFTED";
    audit(lead.id, "agent", "draft.created", draft.subject, draft.created_at);
    if (c.stopAt === "DRAFTED") { lead.updated_at = draft.created_at; continue; }

    // Approve & Send (simulated)
    const sendAt = day(reviewDay, 6);
    draft.status = "APPROVED";
    draft.approved_at = sendAt;
    lead.status = "APPROVED";
    audit(lead.id, "user", "draft.approved", "", sendAt);
    const receipt = await deliver.send(draft, lead, { address: `hello@${c.slug}.example.com` }, { now: () => new Date(sendAt), newId });
    receipts.push(receipt);
    draft.status = "SENT";
    lead.thread_key = receipt.thread_key;
    lead.status = "CONTACTED";
    lead.updated_at = sendAt;
    audit(lead.id, "system", "delivery.simulated", `thread ${receipt.thread_key}`, sendAt);

    if (!c.reply) continue; // stays CONTACTED, no outcome yet
    const reply = c.reply;

    // Inbound reply → Reply Agent → outcome
    const replyAt = day(reviewDay + reply.daysAfterSend, 9);
    const parsed = inboundSource.parse(
      { rawBody: JSON.stringify({ thread_key: receipt.thread_key, lead_id: lead.id, from_address: `reply@${c.slug}.example.com`, subject: reply.subject, body_text: reply.body }) },
      { now: () => new Date(replyAt), newId },
    );
    if (!parsed.ok) throw new Error(parsed.reason);
    const event = parsed.event;
    inbound_events.push(event);
    lead.status = "REPLIED";
    audit(lead.id, "system", "inbound.received", event.subject, replyAt);

    const cls = await replyAgent.run({ event, lead, draft }, { ...ctx, now: () => new Date(day(reviewDay + reply.daysAfterSend, 9.1)) });
    const runId = newId("run");
    cls.agent_run_id = runId;
    agent_runs.push({
      id: runId, project_id: project.id, agent: "reply", lead_id: lead.id, status: "COMPLETED",
      started_at: replyAt, completed_at: day(reviewDay + reply.daysAfterSend, 9.05), latency_ms: 1800, model: "mock",
      token_usage: { input: 600, output: 90 }, retry_count: 0, error: null, input_summary: event.subject,
      output_summary: `${cls.outcome} (${cls.confidence})`, created_at: replyAt,
    });
    reply_classifications.push(cls);
    event.processed_at = cls.created_at;

    if (cls.outcome !== "auto_reply" && cls.outcome !== "unclassified") {
      outcomes.push({ id: newId("out"), lead_id: lead.id, outcome: cls.outcome, notes: cls.rationale, recorded_by: "reply_agent", event_id: event.id, occurred_at: event.received_at, recorded_at: cls.created_at });
      lead.status = "OUTCOME_RECORDED";
      audit(lead.id, "agent", "outcome.recorded", cls.outcome, cls.created_at);
    } else if (cls.needs_human) {
      audit(lead.id, "agent", "reply.needs_review", cls.rationale, cls.created_at);
    }
    lead.updated_at = cls.created_at;
  }

  // Leads contacted but never replied → user records "no_response" after 14 days
  for (const l of leads) {
    if (l.status === "CONTACTED") {
      const at = day(30);
      outcomes.push({ id: newId("out"), lead_id: l.id, outcome: "no_response", notes: "No reply after 14 days", recorded_by: "user", event_id: null, occurred_at: at, recorded_at: at });
      l.status = "OUTCOME_RECORDED";
      l.updated_at = at;
      audit(l.id, "user", "outcome.recorded", "no_response", at);
    }
  }

  // One user override to demonstrate audit: DataWorks "interested" → keep, but add note
  const learningAt = day(31);
  const insights = buildInsights({ project_id: project.id, leads, qualifications, evidence, outcomes }, learningAt, newId);
  run("learning", null, learningAt, { input: `${outcomes.length} outcomes`, output: `${insights.length} insights` });

  // Fill agent_runs to ~120 with a background research refresh batch
  let extra = 0;
  while (agent_runs.length < 120) {
    const l = leads[extra % leads.length];
    run("research", l.id, day(32 + Math.floor(extra / 25), (extra % 24)), { input: l.website ?? "", output: "refresh: no new evidence" });
    extra++;
  }
  const dataset = DemoDataset.parse({
    version: "0.2.0",
    generated_at: day(33, 12),
    project, product_understanding, icp, leads, evidence, qualifications, drafts, receipts,
    inbound_events, reply_classifications, outcomes, insights, agent_runs, audit_events,
  });

  const out = join(__dirname, "dataset.json");
  writeFileSync(out, JSON.stringify(dataset, null, 2) + "\n");

  const statusCount = leads.reduce((m, l) => m.set(l.status, (m.get(l.status) ?? 0) + 1), new Map<LeadStatus, number>());
  console.log(`✔ wrote ${out}`);
  console.log(`  leads ${leads.length} | evidence ${evidence.length} | qualifications ${qualifications.length} | drafts ${drafts.length} | receipts ${receipts.length}`);
  console.log(`  inbound ${inbound_events.length} | classifications ${reply_classifications.length} | outcomes ${outcomes.length} | insights ${insights.length} | runs ${agent_runs.length} | audit ${audit_events.length}`);
  console.log(`  mix`, mix);
  console.log(`  status`, Object.fromEntries(statusCount));
  for (const ins of insights) console.log(`  · ${ins.title}: ${ins.detail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
