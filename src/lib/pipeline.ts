/**
 * Intelligence pipeline (Spec §5, Phase 2): Discover → Research → Qualify.
 *
 * Each step is an agent run recorded in agent_runs with explicit state, and
 * each lead moves through the lead state machine. Failures are recorded and
 * the pipeline continues with the next lead — it never hides a failure.
 */
import { createDiscoveryAgent, type SourceFailure } from "@/agents/discovery";
import { researchAgent } from "@/agents/research";
import { qualificationAgent } from "@/agents/qualification";
import { createSourceAdapters, GitHubAdapter, hostOf, keyOf, TavilySearchAdapter } from "@/adapters/sources";
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
  const product = { name: project.name, category: project.category ?? undefined };
  const sources = await createSourceAdapters(cfg, ctx.llm);
  const sourceFailures: SourceFailure[] = [];
  const agent = createDiscoveryAgent(sources.map((s) => ({
    source: s.source,
    discover: (q: { icp: ICPProfile; limit: number }, c: { now: () => Date }) => s.discover({ ...q, exclude, selfDomains, product }, c),
  })), (f) => sourceFailures.push(f));
  const limit = opts.limit ?? cfg.pipelineBatch;

  const { output, run } = await runAgent(repo, agent, { icp, limit }, ctx, {
    project_id: projectId,
    input_summary: `ICP ${icp.id} via ${sources.map((s) => s.source).join("+")}`,
    summarize: (o) => `${o.length} new candidates`,
  });
  // Observability (field test: "1 candidate" with no way to tell whether the
  // search returned nothing or the screen dropped everything).
  const search = sources.find((s): s is TavilySearchAdapter => s instanceof TavilySearchAdapter);
  const gh = sources.find((s): s is GitHubAdapter => s instanceof GitHubAdapter);
  const notes: string[] = [];
  if (search?.lastStats) {
    const st = search.lastStats;
    const note = `search: ${st.rawHits} hits → ${st.screened} organizations${st.failedQueries ? ` (${st.failedQueries} queries failed)` : ""}`;
    notes.push(note);
    await audit(repo, projectId, null, "agent", "discovery.search_stats", note);
  }
  if (gh?.lastStats) {
    const st = gh.lastStats;
    const note = st.queries === 0
      ? "github: no query terms — ICP technologies/business problems are empty"
      : `github: ${st.queries} queries → ${st.rawRepos} repos → ${st.candidates} candidates${st.failedQueries ? ` (${st.failedQueries} queries failed)` : ""}`;
    notes.push(note);
    await audit(repo, projectId, null, "agent", "discovery.github_stats", note);
  }
  // A failed source stays visible in the summary and audit trail, but a
  // COMPLETED run never carries an error — that contradictory state confused
  // the Agents table (external review v5). Warnings are ⚠-prefixed instead.
  for (const f of sourceFailures) {
    notes.push(`⚠ ${f.source} FAILED: ${f.error}`);
    await audit(repo, projectId, null, "system", "discovery.source_failed", `${f.source}: ${f.error}`);
  }
  if (notes.length) await repo.updateAgentRun({ ...run, output_summary: `${run.output_summary} (${notes.join(" · ")})` });

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
  // Re-research goes through the state machine (RESEARCHED/QUALIFIED/REJECTED
  // all have a RESEARCHING edge — review v6 F10 caught the old pre-mapping
  // hack calling transition(RESEARCHING, RESEARCHING) and failing for all
  // three). Already-RESEARCHING re-enters directly: double-click, or a lead
  // left mid-research by a crashed process.
  const original = lead.status;
  const startFrom = lead.status === "RESEARCHING" ? "RESEARCHING" as const : transition(lead.status, "RESEARCHING");
  const researching = { ...lead, status: startFrom, updated_at: ctx.now().toISOString() };
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
    // Restore the pre-research status so a failed RE-research never demotes a
    // qualified/rejected lead (review v6 F10); a first research rolls back to
    // DISCOVERED. Previous evidence is untouched — it is only replaced on
    // success. The FAILED run stays visible either way.
    const restore = original === "RESEARCHING" || original === "DISCOVERED" ? "DISCOVERED" : original;
    await repo.updateLead({ ...researching, status: restore, updated_at: ctx.now().toISOString() });
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
  if (output.withheld) {
    // Withheld ≠ rejected (field test caught "score withheld" leads shown as
    // REJECTED). Insufficient evidence is a verdict about the DATA, not the
    // lead: it stays at RESEARCHED so a human can re-research or ignore it.
    const status = lead.status === "QUALIFIED" || lead.status === "REJECTED" ? "RESEARCHED" : lead.status;
    await repo.updateLead({ ...lead, status, updated_at: ctx.now().toISOString() });
    await audit(repo, lead.project_id, lead.id, "agent", "lead.score_withheld", "Insufficient evidence — score withheld; needs more evidence before a verdict");
    return output;
  }
  const rejected = output.classification === "REJECT" || output.classification === "LOW_FIT";
  const from = lead.status === "RESEARCHED" ? "RESEARCHED" : lead.status;
  const next = rejected ? "REJECTED" : "QUALIFIED";
  const status = from === "QUALIFIED" || from === "REJECTED" ? next : transition(from, next);
  await repo.updateLead({ ...lead, status, updated_at: ctx.now().toISOString() });
  await audit(repo, lead.project_id, lead.id, "agent", rejected ? "lead.rejected" : "lead.qualified", `${output.total_score} ${output.classification}`);
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
export interface PipelineSummary { discovered: number; researched: number; qualified: number; rejected: number; withheld: number; failed: number }

export async function runPipeline(repo: Repository, projectId: string, ctx: AgentContext = agentContext()): Promise<PipelineSummary> {
  const cfg = getConfig();
  const s: PipelineSummary = { discovered: 0, researched: 0, qualified: 0, rejected: 0, withheld: 0, failed: 0 };
  s.discovered = (await discoverLeads(repo, projectId, { ctx })).length;

  const pending = (await repo.leads(projectId)).filter((l) => l.status === "DISCOVERED" || l.status === "RESEARCHED").slice(0, cfg.pipelineBatch);
  for (const lead of pending) {
    try {
      if (lead.status === "DISCOVERED") { await researchLead(repo, lead.id, ctx); s.researched++; }
      const q = await qualifyLead(repo, lead.id, ctx);
      if (q.withheld) s.withheld++;
      else if (q.classification === "REJECT" || q.classification === "LOW_FIT") s.rejected++;
      else s.qualified++;
    } catch {
      s.failed++;
    }
  }
  return s;
}
