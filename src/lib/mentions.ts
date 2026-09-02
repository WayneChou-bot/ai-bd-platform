/**
 * Mention scan pipeline (Spec v0.3 §4B, §5, §28, §33). Source → Signal;
 * conversion to Lead is a separate human action, and Signal → Evidence
 * happens inside Research — a mention is never a lead by itself.
 */
import type { Evidence, EvidenceType, Lead, Signal, SourceDocument, TrackedEntity } from "@/core/schemas";
import { Lead as LeadSchema, Signal as SignalSchema, TrackedEntity as TrackedEntitySchema } from "@/core/schemas";
import { businessRelevance, classifyMentionContext, mentionConfidence, signalTypeFor, snippetAround, isSelfPublished } from "@/core/mention";
import { createMentionAdapters } from "@/adapters/mentions";
import { newId } from "@/core/orchestrator/run";
import { getConfig } from "@/lib/config";
import type { Repository } from "@/lib/repository";

/** Queries are built from tracked entities — never free-form (§33 audit). */
export function buildMentionQueries(entities: TrackedEntity[]): string[] {
  const qs = new Set<string>();
  for (const e of entities) {
    qs.add(`"${e.canonical_name}"`);
    for (const id of e.identifiers.slice(0, 2)) qs.add(`"${id}"`);
    for (const k of e.keywords.slice(0, 2)) qs.add(`"${e.canonical_name}" ${k}`);
  }
  return [...qs].slice(0, 8);
}

/** If a project has no tracked entities yet, derive one from what it already
 *  knows about itself (name / repository / ICP technologies) — v0.3 §3. */
export async function ensureTrackedEntities(repo: Repository, projectId: string): Promise<TrackedEntity[]> {
  const existing = await repo.trackedEntities(projectId);
  if (existing.length > 0) return existing;
  const [project, icp] = await Promise.all([repo.project(projectId), repo.icp(projectId)]);
  const name = project.name.replace(/\s*\(demo[^)]*\)\s*$/i, "").trim();
  const repoPath = project.repository?.match(/github\.com\/([^/]+\/[^/#?]+)/)?.[1];
  const keywords = [
    ...(icp?.technologies ?? []),
    ...(project.category?.split(/[\/,·]/).map((s) => s.trim()) ?? []),
    "documentation",
  ].filter(Boolean).slice(0, 6);
  const entity = TrackedEntitySchema.parse({
    id: newId("ent"), project_id: projectId, canonical_name: name, entity_type: "product",
    aliases: [], canonical_url: project.repository ?? project.website,
    identifiers: repoPath ? [repoPath] : [], keywords,
    created_at: new Date().toISOString(),
  });
  await repo.saveTrackedEntity(entity);
  return [entity];
}

export interface MentionScanResult {
  queries: string[];
  documents: number;
  created: number;
  skippedExisting: number;
  belowThreshold: number;
  /** pages on the entity's own site — a vendor talking about itself is not a mention */
  selfPublished: number;
}

export async function scanMentions(repo: Repository, projectId: string): Promise<MentionScanResult> {
  const cfg = getConfig();
  const adapters = createMentionAdapters(cfg);
  if (adapters.length === 0) throw new Error("Mention scan needs SEARCH_API_KEY (Tavily) in LIVE mode");
  const entities = await ensureTrackedEntities(repo, projectId);
  const queries = buildMentionQueries(entities);
  const ctx = { now: () => new Date() };
  const startedAt = new Date().toISOString();
  const runId = newId("run");
  await repo.addAgentRun({
    id: runId, project_id: projectId, agent: "discovery", lead_id: null, status: "RUNNING",
    started_at: startedAt, completed_at: null, latency_ms: null, model: null, token_usage: null, retry_count: 0,
    error: null, input_summary: `mention scan · ${queries.length} queries via ${adapters.map((a) => a.name).join("+")}`,
    output_summary: "", created_at: startedAt,
  });

  const result: MentionScanResult = { queries, documents: 0, created: 0, skippedExisting: 0, belowThreshold: 0, selfPublished: 0 };
  try {
    const existing = await repo.signals(projectId);
    const seen = new Set(existing.map((s) => `${s.entity_id}|${s.source_url}`));
    const docsByUrl = new Map<string, { doc: SourceDocument; query: string }>();
    for (const adapter of adapters) {
      for (const q of queries) {
        for (const doc of await adapter.search(q, ctx)) {
          if (!docsByUrl.has(doc.url)) docsByUrl.set(doc.url, { doc, query: q });
        }
      }
    }
    result.documents = docsByUrl.size;

    for (const { doc, query } of docsByUrl.values()) {
      if (entities.some((e) => isSelfPublished(doc, e))) { result.selfPublished++; continue; }
      // best-matching entity wins (§22 basic entity resolution)
      let best: { entity: TrackedEntity; score: number } | null = null;
      for (const e of entities) {
        const m = mentionConfidence(doc, e);
        if (!best || m.score > best.score) best = { entity: e, score: m.score };
      }
      if (!best || best.score < 50) { result.belowThreshold++; continue; }
      const key = `${best.entity.id}|${doc.url}`;
      if (seen.has(key)) { result.skippedExisting++; continue; }
      seen.add(key);
      const snippet = snippetAround(doc, best.entity);
      const cls = classifyMentionContext(snippet);
      const band = best.score >= 90 ? "confirmed" as const : best.score >= 70 ? "likely" as const : "review" as const;
      const now = ctx.now().toISOString();
      await repo.addSignal(SignalSchema.parse({
        id: newId("sig"), project_id: projectId, entity_id: best.entity.id, lead_id: null,
        signal_type: signalTypeFor(best.entity.entity_type), source_type: doc.source_type,
        source_url: doc.url, title: doc.title, snippet, language: doc.language, country: doc.country,
        published_at: doc.published_at, observed_at: now, confidence: best.score,
        business_relevance: businessRelevance(band, cls.intent),
        mention_context: cls.context, sentiment: cls.sentiment, intent: cls.intent,
        query, status: "NEW", created_at: now,
      }));
      result.created++;
    }

    const done = new Date();
    await repo.updateAgentRun({
      id: runId, project_id: projectId, agent: "discovery", lead_id: null, status: "COMPLETED",
      started_at: startedAt, completed_at: done.toISOString(), latency_ms: done.getTime() - new Date(startedAt).getTime(),
      model: null, token_usage: null, retry_count: 0, error: null,
      input_summary: `mention scan · ${queries.length} queries via ${adapters.map((a) => a.name).join("+")}`,
      output_summary: `${result.created} signals (${result.skippedExisting} existing, ${result.belowThreshold} below threshold, ${result.selfPublished} self-published skipped)`,
      created_at: startedAt,
    });
    await repo.addAuditEvent({ id: newId("aud"), project_id: projectId, lead_id: null, actor: "agent", action: "mentions.scanned", detail: `${result.created} new signals from ${result.documents} documents`, created_at: new Date().toISOString() });
    return result;
  } catch (e) {
    const done = new Date();
    await repo.updateAgentRun({
      id: runId, project_id: projectId, agent: "discovery", lead_id: null, status: "FAILED",
      started_at: startedAt, completed_at: done.toISOString(), latency_ms: done.getTime() - new Date(startedAt).getTime(),
      model: null, token_usage: null, retry_count: 0, error: (e as Error).message,
      input_summary: `mention scan · ${queries.length} queries`, output_summary: "", created_at: startedAt,
    });
    throw e;
  }
}

/** Mention → Lead (§28): only a human converts, and only relevance ≥ medium
 *  shows the button. The signal keeps its provenance and links to the lead. */
export async function convertSignalToLead(repo: Repository, signalId: string, input: { company_name?: string; website?: string } = {}): Promise<Lead> {
  const signal = (await repo.signals()).find((s) => s.id === signalId);
  if (!signal) throw new Error("signal not found");
  if (signal.status === "CONVERTED" && signal.lead_id) {
    const existing = await repo.lead(signal.lead_id);
    if (existing) return existing;
  }
  let host: string | undefined;
  try { host = new URL(signal.source_url).hostname.replace(/^www\./, ""); } catch { /* keep undefined */ }
  const entities = await repo.trackedEntities(signal.project_id);
  const entityName = entities.find((e) => e.id === signal.entity_id)?.canonical_name ?? "tracked entity";
  const now = new Date().toISOString();
  const lead = LeadSchema.parse({
    id: newId("lead"), project_id: signal.project_id, entity_type: "company",
    company_name: input.company_name?.trim() || host || signal.title.slice(0, 60),
    website: input.website?.trim() || (host ? `https://${host}` : undefined),
    source: "mention",
    discovery_reason: `Mentioned "${entityName}" — ${signal.title}`,
    status: "DISCOVERED", thread_key: null, created_at: now, updated_at: now,
  });
  await repo.createLead(lead);
  await repo.updateSignal({ ...signal, status: "CONVERTED", lead_id: lead.id });
  await repo.addAuditEvent({ id: newId("aud"), project_id: signal.project_id, lead_id: lead.id, actor: "user", action: "lead.converted_from_mention", detail: signal.source_url, created_at: now });
  return lead;
}

const EVIDENCE_TYPE_BY_SOURCE: Partial<Record<Signal["source_type"], EvidenceType>> = {
  blog: "blog_post", news: "press_release", press_release: "press_release", github: "github_repo",
  forum: "social_post", reddit: "social_post", social: "social_post", youtube: "social_post",
  documentation: "documentation", website: "company_page", product_page: "product_page", job_posting: "job_posting", careers: "job_posting",
};

/** Signal → Evidence bridge (§8, §29): converted signals become intent
 *  evidence during Research; the original-language snippet is preserved. */
export function signalsToEvidence(signals: Signal[], leadId: string, mkId: (p: string) => string): Evidence[] {
  return signals
    .filter((s) => s.lead_id === leadId && s.status === "CONVERTED")
    .map((s) => ({
      id: mkId("ev"), lead_id: leadId,
      type: EVIDENCE_TYPE_BY_SOURCE[s.source_type] ?? "blog_post",
      category: s.sentiment === "negative" ? "negative" as const : "content" as const,
      claim: `Public mention (${s.mention_context}): “${s.snippet.slice(0, 200)}”`,
      source_url: s.source_url,
      observed_at: s.observed_at,
      confidence: s.confidence >= 90 ? 0.9 : s.confidence >= 70 ? 0.75 : 0.6,
      supports: "intent_signal" as const,
      polarity: s.sentiment === "negative" ? "negative" as const : "positive" as const,
    }));
}
