/**
 * Analytics (Spec §47) computed from rows for one project. No stored metrics —
 * everything here is reproducible from the repository.
 */
import { POSITIVE_OUTCOMES, type AgentName } from "@/core/schemas";
import { evidenceCategoryStats, latestOutcomes, scoreBandStats, sendCohort, sourceStats } from "@/agents/learning";
import type { Repository } from "@/lib/repository";

export async function projectAnalytics(repo: Repository, projectId: string) {
  const [leads, quals, drafts, receipts, events, cls, outcomes, runs] = await Promise.all([
    repo.leads(projectId), repo.qualifications(), repo.drafts(), repo.receipts(), repo.inboundEvents(), repo.replyClassifications(), repo.outcomes(), repo.agentRuns(),
  ]);
  const ids = new Set(leads.map((l) => l.id));
  const q = quals.filter((x) => ids.has(x.lead_id));
  const d = drafts.filter((x) => ids.has(x.lead_id));
  const r = receipts.filter((x) => ids.has(x.lead_id) && !x.error);
  const e = events.filter((x) => x.lead_id && ids.has(x.lead_id));
  const c = cls.filter((x) => ids.has(x.lead_id));
  const o = outcomes.filter((x) => ids.has(x.lead_id));
  const latest = latestOutcomes(o);

  const now = new Date().toISOString();
  const cohort = sendCohort(r, o, now);

  const discovered = leads.length;
  const researched = leads.filter((l) => !["DISCOVERED", "RESEARCHING"].includes(l.status)).length;
  const qualified = q.filter((x) => x.classification === "HIGH_FIT" || x.classification === "MEDIUM_FIT").length;
  const reviewed = leads.filter((l) => !["DISCOVERED", "RESEARCHING", "RESEARCHED", "QUALIFIED", "REJECTED"].includes(l.status)).length;
  const approved = d.filter((x) => x.status === "APPROVED" || x.status === "SENT").length;
  const contacted = new Set(r.map((x) => x.lead_id)).size;
  const replies = new Set(e.map((x) => x.lead_id)).size;
  const positive = [...latest.values()].filter((x) => POSITIVE_OUTCOMES.has(x.outcome)).length;
  const pct = (n: number, dd: number) => (dd ? Math.round((n / dd) * 1000) / 10 : 0);

  const funnel = [
    { stage: "Discovered", value: discovered }, { stage: "Researched", value: researched }, { stage: "Qualified", value: qualified },
    { stage: "Reviewed", value: reviewed }, { stage: "Approved", value: approved }, { stage: "Contacted", value: contacted },
    { stage: "Replies", value: replies }, { stage: "Positive", value: positive },
  ].map((s) => ({ ...s, pct: pct(s.value, discovered) }));

  // Withheld is a statement about DATA, not a verdict (review v6 secondary):
  // its placeholder classification must never be counted as a REJECT.
  const distribution = (["HIGH_FIT", "MEDIUM_FIT", "LOW_FIT", "REJECT"] as const).map((k) => ({ label: k.replace("_", " "), value: q.filter((x) => !x.withheld && x.classification === k).length }));
  const withheld = q.filter((x) => x.withheld).length;

  const fmtN = (x: { positive: number; assessable: number; awaiting: number }) => `${x.positive}/${x.assessable}${x.awaiting ? ` +${x.awaiting}⏳` : ""}`;
  const bands = scoreBandStats(q, o, r, now).map((b) => ({ label: b.band, value: b.rate, n: fmtN(b) }));
  const evidence = await repo.allEvidence();
  const categories = evidenceCategoryStats(evidence.filter((x) => ids.has(x.lead_id)), o, r, now).slice(0, 6).map((x) => ({ label: x.category.replace("_", " "), value: x.rate, n: fmtN(x) }));
  const sources = sourceStats(leads, q, o);

  // Reply breakdown (latest classification per lead)
  const latestCls = new Map<string, string>();
  for (const x of [...c].sort((a, b) => a.created_at.localeCompare(b.created_at))) latestCls.set(x.lead_id, x.outcome);
  const order = ["meeting_requested", "interested", "positive_reply", "negative_reply", "not_relevant", "auto_reply", "unclassified"];
  const replyBreakdown = order.map((k) => ({ name: k.replace(/_/g, " "), value: [...latestCls.values()].filter((v) => v === k).length })).filter((x) => x.value > 0);
  const noResponse = [...latest.values()].filter((x) => x.outcome === "no_response").length;
  if (noResponse) replyBreakdown.push({ name: "no response", value: noResponse });

  // Replies over time (by ISO week)
  const week = (iso: string) => { const dt = new Date(iso); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(5, 10); };
  const byWeek = new Map<string, number>();
  for (const x of e) byWeek.set(week(x.received_at), (byWeek.get(week(x.received_at)) ?? 0) + 1);
  const repliesOverTime = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, value]) => ({ t, value }));

  // Agent operations (§47: latency, failure rate)
  const agentNames: AgentName[] = ["discovery", "research", "qualification", "outreach", "reply", "learning"];
  const projRuns = runs.filter((x) => x.project_id === projectId);
  const agents = agentNames.map((a) => {
    const mine = projRuns.filter((x) => x.agent === a);
    const done = mine.filter((x) => x.latency_ms != null);
    const failed = mine.filter((x) => x.status === "FAILED").length;
    return {
      label: a, runs: mine.length, failed,
      failureRate: pct(failed, mine.length),
      p50: done.length ? [...done].sort((x, y) => x.latency_ms! - y.latency_ms!)[Math.floor(done.length / 2)].latency_ms! : 0,
      tokens: mine.reduce((s, x) => s + (x.token_usage ? x.token_usage.input + x.token_usage.output : 0), 0),
    };
  });

  return {
    // positiveRate now shares the stats' denominator (review v6 F11): positive
    // outcomes over ASSESSABLE sends — recent sends are 'awaiting', not failures.
    metrics: { discovered, qualified, reviewed, approved, contacted, replies, positive, awaiting: cohort.awaiting.size, assessable: cohort.assessable.size, positiveRate: pct(positive, cohort.assessable.size), qualifiedToPositive: pct(positive, qualified), replyRate: pct(replies, contacted) },
    funnel, distribution, withheld, bands, categories, sources, replyBreakdown, repliesOverTime, agents,
    sample: latest.size,
  };
}
export type ProjectAnalytics = Awaited<ReturnType<typeof projectAnalytics>>;
