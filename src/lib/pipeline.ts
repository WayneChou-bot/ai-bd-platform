/**
 * Intelligence pipeline (Spec §5, Phase 2): Discover → Research → Qualify.
 *
 * Each step is an agent run recorded in agent_runs with explicit state, and
 * each lead moves through the lead state machine. Failures are recorded and
 * the pipeline continues with the next lead — it never hides a failure.
 */
import { createDiscoveryAgent } from "@/agents/discovery";
import { researchAgent } from "@/agents/research";
import { qualificationAgent } from "@/agents/qualification";
import { createSourceAdapters, hostOf, keyOf } from "@/adapters/sources";
import { fetchPublicPage, type FetchedPage } from "@/adapters/sources/fetch";
import type { AgentContext } from "@/core/orchestrator/agent";
import { runAgent, newId } from "@/core/orchestrator/run";
import { transition } from "@/core/orchestrator/lead-state";
import { Lead, type AuditEvent, type Evidence, type ICPProfile, type QualificationResult } from "@/core/schemas";
import { getConfig } from "@/lib/config";
import { agentContext } from "@/lib/context";
import type { Repository } from "@/lib/repository";

async function audit(repo: Repository, projectId: string, leadId: string | null, actor: AuditEvent["actor"], action: string, detail = "") {
  await repo.addAuditEvent({ id: newId("aud"), project_id: projectId, lead_id: leadId, actor, action, detail, created_at: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Discover
// ---------------------------------------------------------------------------
export async function discoverLeads(repo: Repository, projectId: string, opts: { limit?: number; ctx?: AgentContext } = {}) {
  const cfg = getConfig();
  const ctx = opts.ctx ?? agentContext();
  const icp = await repo.icp(projectId);
  if (!icp) throw new Error("Define or generate an ICP before running discovery");
  const existing = await repo.leads(projectId);
  const exclude = new Set(existing.map((l) => keyOf(l)));
  // A product must never discover itself (field test: aws.amazon.com showed
  // up as a candidate for an Amazon project). Shared code hosts are skipped —
  // a GitHub-hosted project page must not exclude all GitHub candidates.
  const project = await repo.project(projectId);
  const selfDomains = [project.website]
    .filter((u): u is string => !!u)
    .map((u) => hostOf(u))
    .filter((h): h is string => !!h && h !== "github.com" && h !== "gitlab.com");
  const sources = await createSourceAdapters(cfg, ctx.llm);
  const agent = createDiscoveryAgent(sources.map((s) => ({
    source: s.source,
    discover: (q: { icp: ICPProfile; limit: number }, c: { now: () => Date }) => s.discover({ ...q, exclude, selfDomains }, c),
  })));
  const limit = opts.limit ?? cfg.pipelineBatch;

  const { output } = await runAgent(repo, agent, { icp, limit }, ctx, {
    project_id: projectId,
    input_summary: `ICP ${icp.id} via ${sources.map((s) => s.source).join("+")}`,
    summarize: (o) => `${o.length} new candidates`,
  });

  const created: Lead[] = [];
  for (const d of output) {
    const now = ctx.now().toISOString();
    const lead = Lead.parse({
      id: ctx.newId("lead"),
      project_id: projectId,
      entity_type: d.entity_type,
      company_name: d.company_name,
      display_name: d.entity_type === "individual" ? d.company_name.split(/ — | - /)[0] : undefined,
      headline: d.entity_type === "individual" ? d.company_name.split(/ — | - /)[1] : undefined,
      website: d.website,
      source: d.source,
      discovery_reason: d.discovery_reason,
      status: "DISCOVERED",
      thread_key: null,
      created_at: now,
      updated_at: now,
    });
    await repo.createLead(lead);
    await audit(repo, projectId, lead.id, "agent", "lead.discovered", d.discovery_reason);
    created.push(lead);
  }
  return created;
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------
async function gatherSources(lead: Lead): Promise<FetchedPage[]> {
  const cfg = getConfig();
  if (cfg.mode === "demo") return []; // mock research answers from the seed universe
  const urls = [lead.website, ...lead.public_profile_urls].filter((u): u is string => !!u).slice(0, 3);
  const pages: FetchedPage[] = [];
  for (const u of urls) {
    try { pages.push(await fetchPublicPage(u)); } catch (e) { pages.push({ url: u, type: "company_page", content: `[fetch failed: ${(e as Error).message}]`, status: 0 }); }
  }
  return pages;
}

export async function researchLead(repo: Repository, leadId: string, ctx: AgentContext = agentContext()): Promise<Evidence[]> {
  const lead = await repo.lead(leadId);
  if (!lead) throw new Error("lead not found");
  const researching = { ...lead, status: transition(lead.status === "RESEARCHED" ? "RESEARCHING" : lead.status, "RESEARCHING"), updated_at: ctx.now().toISOString() };
  await repo.updateLead(researching);

  try {
    const sources = await gatherSources(lead);
    const { output } = await runAgent(repo, researchAgent, { lead: researching, sources }, ctx, {
      project_id: lead.project_id,
      lead_id: lead.id,
      input_summary: sources.length ? `${sources.length} page(s)` : "demo sources",
      summarize: (o) => `${o.evidence.length} evidence records`,
    });
    const evidence: Evidence[] = output.evidence.map((e) => ({ ...e, id: ctx.newId("ev"), lead_id: lead.id }));
    // Signal → Evidence bridge (v0.3 §8, §29): converted mention signals become
    // intent evidence, in the original language, alongside researched evidence.
    const { signalsToEvidence } = await import("@/lib/mentions");
    const mentionEvidence = signalsToEvidence(await repo.signals(lead.project_id), lead.id, ctx.newId);
    evidence.push(...mentionEvidence);
    await repo.replaceEvidence(lead.id, evidence);
    await repo.updateLead({
      ...researching,
      industry: output.industry ?? lead.industry,
      size_estimate: output.size_estimate ?? lead.size_estimate,
      location: output.location ?? lead.location,
      status: transition("RESEARCHING", "RESEARCHED"),
      updated_at: ctx.now().toISOString(),
    });
    await audit(repo, lead.project_id, lead.id, "agent", "lead.researched", `${evidence.length} evidence records`);
    return evidence;
  } catch (e) {
    // Roll back to DISCOVERED so the user can retry; the FAILED run stays visible.
    await repo.updateLead({ ...researching, status: transition("RESEARCHING", "DISCOVERED"), updated_at: ctx.now().toISOString() });
    await audit(repo, lead.project_id, lead.id, "system", "lead.research_failed", (e as Error).message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Qualify
// ---------------------------------------------------------------------------
export async function qualifyLead(repo: Repository, leadId: string, ctx: AgentContext = agentContext()): Promise<QualificationResult> {
  const lead = await repo.lead(leadId);
  if (!lead) throw new Error("lead not found");
  const icp = await repo.icp(lead.project_id);
  if (!icp) throw new Error("project has no ICP");
  const evidence = await repo.evidenceFor(lead.id);
  const { output } = await runAgent(repo, qualificationAgent, { lead, icp, evidence }, ctx, {
    project_id: lead.project_id,
    lead_id: lead.id,
    input_summary: `${evidence.length} evidence`,
    summarize: (o) => (o.withheld ? "score withheld" : `${o.total_score} ${o.classification}`),
  });
  await repo.saveQualification(output);
  const rejected = output.classification === "REJECT" || output.classification === "LOW_FIT";
  const from = lead.status === "RESEARCHED" ? "RESEARCHED" : lead.status;
  const next = rejected ? "REJECTED" : "QUALIFIED";
  const status = from === "QUALIFIED" || from === "REJECTED" ? next : transition(from, next);
  await repo.updateLead({ ...lead, status, updated_at: ctx.now().toISOString() });
  await audit(repo, lead.project_id, lead.id, "agent", rejected ? "lead.rejected" : "lead.qualified", output.withheld ? "Insufficient evidence — score withheld" : `${output.total_score} ${output.classification}`);
  return output;
}

export async function ignoreLead(repo: Repository, leadId: string) {
  const lead = await repo.lead(leadId);
  if (!lead) throw new Error("lead not found");
  await repo.updateLead({ ...lead, status: "REJECTED", updated_at: new Date().toISOString() });
  await audit(repo, lead.project_id, lead.id, "user", "lead.ignored");
}

// ---------------------------------------------------------------------------
// Full run: discover new leads, then research + qualify everything pending.
// ---------------------------------------------------------------------------
export interface PipelineSummary { discovered: number; researched: number; qualified: number; rejected: number; failed: number }

export async function runPipeline(repo: Repository, projectId: string, ctx: AgentContext = agentContext()): Promise<PipelineSummary> {
  const cfg = getConfig();
  const s: PipelineSummary = { discovered: 0, researched: 0, qualified: 0, rejected: 0, failed: 0 };
  s.discovered = (await discoverLeads(repo, projectId, { ctx })).length;

  const pending = (await repo.leads(projectId)).filter((l) => l.status === "DISCOVERED" || l.status === "RESEARCHED").slice(0, cfg.pipelineBatch);
  for (const lead of pending) {
    try {
      if (lead.status === "DISCOVERED") { await researchLead(repo, lead.id, ctx); s.researched++; }
      const q = await qualifyLead(repo, lead.id, ctx);
      if (q.classification === "REJECT" || q.classification === "LOW_FIT") s.rejected++; else s.qualified++;
    } catch {
      s.failed++;
    }
  }
  return s;
}
