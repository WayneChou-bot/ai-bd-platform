/**
 * Learning Agent (Spec §21). Pure analytics in V1 — no model training.
 * Every insight is recomputable from rows, which the fixture test asserts.
 */
import { z } from "zod";
import { defineAgent } from "@/core/orchestrator/agent";
import { DeliveryReceipt, Evidence, Lead, LearningInsight, Outcome, POSITIVE_OUTCOMES, QualificationResult } from "@/core/schemas";

export const LearningInput = z.object({
  project_id: z.string(),
  leads: z.array(Lead),
  qualifications: z.array(QualificationResult),
  evidence: z.array(Evidence),
  outcomes: z.array(Outcome),
  receipts: z.array(DeliveryReceipt).default([]),
});

export interface BandStat { band: string; sent: number; assessable: number; awaiting: number; positive: number; rate: number }
export interface CategoryStat { category: string; sent: number; assessable: number; awaiting: number; positive: number; rate: number }
export interface SourceStat { source: string; discovered: number; qualified: number; positive: number }

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

/**
 * Confidence gate (§21 hardening): how much weight an insight's sample can carry.
 * insufficient (n<10) — comparative insights are NOT generated at all;
 * directional (10–29) — shown, labelled as directional / small sample;
 * moderate (30–99); strong (100+).
 */
export type InsightConfidence = "insufficient" | "directional" | "moderate" | "strong";
export const MIN_COMPARATIVE_SAMPLE = 10;
export function insightConfidence(n: number): InsightConfidence {
  return n < MIN_COMPARATIVE_SAMPLE ? "insufficient" : n < 30 ? "directional" : n < 100 ? "moderate" : "strong";
}

/**
 * Effective outcome per lead (review v6 F14) — deterministic under ANY
 * processing order. A human decision always beats agent rows; within the same
 * tier the latest BUSINESS event wins (occurred_at, falling back to
 * recorded_at for legacy rows), with recorded_at as the tiebreaker. Replaying
 * a backlog of old mail can therefore never demote a newer result, and a
 * batch processed newest-first ends in the same state as oldest-first.
 */
/**
 * Send cohort (review v6 F11): the denominator of every response statistic is
 * SENT leads whose observation is complete — an outcome was recorded, or the
 * observation window elapsed with silence (a real non-response). A lead sent
 * yesterday is neither a success nor a failure yet: it sits in `awaiting` and
 * is excluded from every rate, but shown, never silently dropped.
 */
export const OBSERVATION_WINDOW_DAYS = 14;
export interface SendCohort {
  /** lead_id → earliest successful send */
  sentAt: Map<string, string>;
  /** sent AND (outcome recorded OR window elapsed) — rate denominators */
  assessable: Set<string>;
  /** sent, no outcome, window still open */
  awaiting: Set<string>;
  latest: Map<string, Outcome>;
}
export function sendCohort(receipts: DeliveryReceipt[], outcomes: Outcome[], nowIso: string): SendCohort {
  const sentAt = new Map<string, string>();
  for (const r of receipts) {
    if (r.error) continue;
    const cur = sentAt.get(r.lead_id);
    if (!cur || r.sent_at < cur) sentAt.set(r.lead_id, r.sent_at);
  }
  const latest = latestOutcomes(outcomes);
  const cutoff = new Date(new Date(nowIso).getTime() - OBSERVATION_WINDOW_DAYS * 86_400_000).toISOString();
  const assessable = new Set<string>();
  const awaiting = new Set<string>();
  for (const [leadId, at] of sentAt) {
    if (latest.has(leadId) || at <= cutoff) assessable.add(leadId);
    else awaiting.add(leadId);
  }
  return { sentAt, assessable, awaiting, latest };
}

export function latestOutcomes(outcomes: Outcome[]): Map<string, Outcome> {
  const when = (o: Outcome) => o.occurred_at ?? o.recorded_at;
  const tier = (o: Outcome) => (o.recorded_by === "user" ? 1 : 0);
  const m = new Map<string, Outcome>();
  for (const o of outcomes) {
    const cur = m.get(o.lead_id);
    if (!cur) { m.set(o.lead_id, o); continue; }
    if (tier(o) !== tier(cur)) { if (tier(o) > tier(cur)) m.set(o.lead_id, o); continue; }
    if (when(o) > when(cur) || (when(o) === when(cur) && o.recorded_at > cur.recorded_at)) m.set(o.lead_id, o);
  }
  return m;
}

/** Positive rate by score band over the SEND cohort (review v6 F11): the old
 *  denominator was "leads with a recorded outcome", which silently excluded
 *  sent-but-silent leads and could read 1/1 = 100% when 10 were sent. */
export function scoreBandStats(qs: QualificationResult[], outcomes: Outcome[], receipts: DeliveryReceipt[], nowIso: string): BandStat[] {
  const c = sendCohort(receipts, outcomes, nowIso);
  const bands: Array<[string, (s: number) => boolean]> = [
    ["80+", (s) => s >= 80],
    ["60–79", (s) => s >= 60 && s < 80],
    ["40–59", (s) => s >= 40 && s < 60],
  ];
  return bands.map(([band, f]) => {
    const inBand = qs.filter((q) => !q.withheld && f(q.total_score));
    const sent = inBand.filter((q) => c.sentAt.has(q.lead_id));
    const assessable = sent.filter((q) => c.assessable.has(q.lead_id));
    const positive = assessable.filter((q) => c.latest.has(q.lead_id) && POSITIVE_OUTCOMES.has(c.latest.get(q.lead_id)!.outcome));
    return { band, sent: sent.length, assessable: assessable.length, awaiting: sent.length - assessable.length, positive: positive.length, rate: pct(positive.length, assessable.length) };
  });
}

export function evidenceCategoryStats(evidence: Evidence[], outcomes: Outcome[], receipts: DeliveryReceipt[], nowIso: string): CategoryStat[] {
  const c = sendCohort(receipts, outcomes, nowIso);
  const byCat = new Map<string, Set<string>>();
  for (const e of evidence) {
    if (e.polarity !== "positive") continue;
    if (!byCat.has(e.category)) byCat.set(e.category, new Set());
    byCat.get(e.category)!.add(e.lead_id);
  }
  return [...byCat.entries()]
    .map(([category, leadIds]) => {
      const sent = [...leadIds].filter((id) => c.sentAt.has(id));
      const assessable = sent.filter((id) => c.assessable.has(id));
      const positive = assessable.filter((id) => c.latest.has(id) && POSITIVE_OUTCOMES.has(c.latest.get(id)!.outcome));
      return { category, sent: sent.length, assessable: assessable.length, awaiting: sent.length - assessable.length, positive: positive.length, rate: pct(positive.length, assessable.length) };
    })
    .filter((x) => x.sent > 0)
    .sort((a, b) => b.rate - a.rate || b.assessable - a.assessable);
}

export function sourceStats(leads: Lead[], qs: QualificationResult[], outcomes: Outcome[]): SourceStat[] {
  const latest = latestOutcomes(outcomes);
  const qualified = new Set(qs.filter((q) => q.classification === "HIGH_FIT" || q.classification === "MEDIUM_FIT").map((q) => q.lead_id));
  const m = new Map<string, SourceStat>();
  for (const l of leads) {
    const s = m.get(l.source) ?? { source: l.source, discovered: 0, qualified: 0, positive: 0 };
    s.discovered++;
    if (qualified.has(l.id)) s.qualified++;
    const o = latest.get(l.id);
    if (o && POSITIVE_OUTCOMES.has(o.outcome)) s.positive++;
    m.set(l.source, s);
  }
  return [...m.values()];
}

/** Each side of a comparison needs its OWN minimum (review v6 F12): 0-vs-10
 *  used to produce "0× higher". */
export const MIN_GROUP_SAMPLE = 5;

export function buildInsights(input: z.infer<typeof LearningInput>, now: string, newId: (p: string) => string): LearningInsight[] {
  const receipts = input.receipts ?? [];
  const bands = scoreBandStats(input.qualifications, input.outcomes, receipts, now);
  const cats = evidenceCategoryStats(input.evidence, input.outcomes, receipts, now);
  const sources = sourceStats(input.leads, input.qualifications, input.outcomes);
  const cohort = sendCohort(receipts, input.outcomes, now);
  // The overview insights' sample is the assessable send cohort — NOT the
  // count of recorded outcomes, and NOT the whole project (review v6 F11/F12).
  const sample = cohort.assessable.size;
  const fmt = (x: { positive: number; assessable: number; awaiting: number }) => `${x.positive}/${x.assessable}${x.awaiting ? ` (+${x.awaiting} awaiting)` : ""}`;

  const insights: LearningInsight[] = [
    {
      id: newId("ins"), project_id: input.project_id, kind: "score_band_response",
      title: "Positive response by score band",
      detail: bands.map((b) => `${b.band}: ${b.rate}% (${fmt(b)})`).join(" · "),
      data: { bands, window_days: OBSERVATION_WINDOW_DAYS }, sample_size: sample, generated_at: now,
    },
    {
      id: newId("ins"), project_id: input.project_id, kind: "evidence_category_performance",
      title: "Best-performing evidence categories",
      detail: cats.slice(0, 3).map((c, i) => `${i + 1}. ${c.category} (${c.rate}%)`).join(" · "),
      data: { categories: cats, window_days: OBSERVATION_WINDOW_DAYS }, sample_size: sample, generated_at: now,
    },
    {
      id: newId("ins"), project_id: input.project_id, kind: "source_performance",
      title: "Lead source performance",
      detail: sources.map((s) => `${s.source}: ${s.qualified}/${s.discovered} qualified, ${s.positive} positive`).join(" · "),
      data: { sources }, sample_size: sample, generated_at: now,
    },
  ];

  // Comparative headline (review v6 F12): each band must clear its own
  // minimum — an empty or near-empty control group generates NOTHING — the
  // wording follows the direction instead of always claiming "higher", and
  // the stated sample is the comparison's own, so more data in OTHER bands
  // cannot inflate this claim's confidence label.
  const top = bands[0], mid = bands[1];
  if (top && mid && top.assessable >= MIN_GROUP_SAMPLE && mid.assessable >= MIN_GROUP_SAMPLE && (top.rate > 0 || mid.rate > 0)) {
    const comparisonN = top.assessable + mid.assessable;
    let title: string;
    let lift: number | null = null;
    if (mid.rate === 0) {
      title = `Leads scored 80+ showed a ${top.rate}% positive-response rate while 60–79 showed none`;
    } else if (top.rate === mid.rate) {
      title = `Leads scored 80+ and 60–79 showed the same positive-response rate`;
    } else if (top.rate > mid.rate) {
      lift = Math.round((top.rate / mid.rate) * 10) / 10;
      title = `Leads scored 80+ showed ${lift}× higher positive-response rate than 60–79`;
    } else {
      lift = Math.round((mid.rate / top.rate) * 10) / 10;
      title = `Leads scored 80+ showed ${lift}× LOWER positive-response rate than 60–79`;
    }
    insights.push({
      id: newId("ins"), project_id: input.project_id, kind: "headline",
      title,
      detail: `${top.rate}% vs ${mid.rate}% across ${comparisonN} assessable sends (${OBSERVATION_WINDOW_DAYS}-day window). Sample size measures data volume, not statistical certainty.`,
      data: { lift, top, mid, comparison_sample: comparisonN }, sample_size: comparisonN, generated_at: now,
    });
  }

  // Recommendation (review v6: the learning loop closes through a human).
  // Analysis only — the agent NEVER edits the ICP; a person adopts or
  // dismisses this on the Analytics screen, and that decision is recorded.
  const positives = [...cohort.assessable].filter((id) => cohort.latest.has(id) && POSITIVE_OUTCOMES.has(cohort.latest.get(id)!.outcome)).length;
  const overallRate = pct(positives, cohort.assessable.size);
  const bestCat = cats.find((x) => x.assessable >= MIN_COMPARATIVE_SAMPLE && x.rate > overallRate);
  if (bestCat) {
    insights.push({
      id: newId("ins"), project_id: input.project_id, kind: "recommendation",
      title: `Leads with "${bestCat.category}" evidence convert best — consider reflecting it in your ICP's positive signals`,
      detail: `${bestCat.rate}% positive (${fmt(bestCat)}) vs ${overallRate}% overall. A suggestion for a human decision — the agent never edits the ICP itself.`,
      data: { key: `prioritise_category:${bestCat.category}`, category: bestCat.category, rate: bestCat.rate, overall: overallRate },
      sample_size: bestCat.assessable, generated_at: now,
    });
  }
  return insights;
}

export const learningAgent = defineAgent({
  name: "learning",
  input: LearningInput,
  output: z.array(LearningInsight),
  async run(input, ctx) {
    return buildInsights(input, ctx.now().toISOString(), ctx.newId);
  },
});
