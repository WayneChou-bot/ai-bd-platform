/**
 * Learning Agent (Spec §21). Pure analytics in V1 — no model training.
 * Every insight is recomputable from rows, which the fixture test asserts.
 */
import { z } from "zod";
import { defineAgent } from "@/core/orchestrator/agent";
import { Evidence, Lead, LearningInsight, Outcome, POSITIVE_OUTCOMES, QualificationResult } from "@/core/schemas";

export const LearningInput = z.object({
  project_id: z.string(),
  leads: z.array(Lead),
  qualifications: z.array(QualificationResult),
  evidence: z.array(Evidence),
  outcomes: z.array(Outcome),
});

export interface BandStat { band: string; contacted: number; positive: number; rate: number }
export interface CategoryStat { category: string; contacted: number; positive: number; rate: number }
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

export function scoreBandStats(qs: QualificationResult[], outcomes: Outcome[]): BandStat[] {
  const latest = latestOutcomes(outcomes);
  const bands: Array<[string, (s: number) => boolean]> = [
    ["80+", (s) => s >= 80],
    ["60–79", (s) => s >= 60 && s < 80],
    ["40–59", (s) => s >= 40 && s < 60],
  ];
  return bands.map(([band, f]) => {
    const inBand = qs.filter((q) => !q.withheld && f(q.total_score));
    const contacted = inBand.filter((q) => latest.has(q.lead_id));
    const positive = contacted.filter((q) => POSITIVE_OUTCOMES.has(latest.get(q.lead_id)!.outcome));
    return { band, contacted: contacted.length, positive: positive.length, rate: pct(positive.length, contacted.length) };
  });
}

export function evidenceCategoryStats(evidence: Evidence[], outcomes: Outcome[]): CategoryStat[] {
  const latest = latestOutcomes(outcomes);
  const byCat = new Map<string, Set<string>>();
  for (const e of evidence) {
    if (e.polarity !== "positive") continue;
    if (!byCat.has(e.category)) byCat.set(e.category, new Set());
    byCat.get(e.category)!.add(e.lead_id);
  }
  return [...byCat.entries()]
    .map(([category, leadIds]) => {
      const contacted = [...leadIds].filter((id) => latest.has(id));
      const positive = contacted.filter((id) => POSITIVE_OUTCOMES.has(latest.get(id)!.outcome));
      return { category, contacted: contacted.length, positive: positive.length, rate: pct(positive.length, contacted.length) };
    })
    .filter((c) => c.contacted > 0)
    .sort((a, b) => b.rate - a.rate || b.contacted - a.contacted);
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

export function buildInsights(input: z.infer<typeof LearningInput>, now: string, newId: (p: string) => string): LearningInsight[] {
  const bands = scoreBandStats(input.qualifications, input.outcomes);
  const cats = evidenceCategoryStats(input.evidence, input.outcomes);
  const sources = sourceStats(input.leads, input.qualifications, input.outcomes);
  const sample = latestOutcomes(input.outcomes).size;

  const insights: LearningInsight[] = [
    {
      id: newId("ins"), project_id: input.project_id, kind: "score_band_response",
      title: "Positive response by score band",
      detail: bands.map((b) => `${b.band}: ${b.rate}% (${b.positive}/${b.contacted})`).join(" · "),
      data: { bands }, sample_size: sample, generated_at: now,
    },
    {
      id: newId("ins"), project_id: input.project_id, kind: "evidence_category_performance",
      title: "Best-performing evidence categories",
      detail: cats.slice(0, 3).map((c, i) => `${i + 1}. ${c.category} (${c.rate}%)`).join(" · "),
      data: { categories: cats }, sample_size: sample, generated_at: now,
    },
    {
      id: newId("ins"), project_id: input.project_id, kind: "source_performance",
      title: "Lead source performance",
      detail: sources.map((s) => `${s.source}: ${s.qualified}/${s.discovered} qualified, ${s.positive} positive`).join(" · "),
      data: { sources }, sample_size: sample, generated_at: now,
    },
  ];

  const top = bands[0], mid = bands[1];
  // Comparative claims are gated on sample size: below MIN_COMPARATIVE_SAMPLE
  // contacted leads across the two bands, no lift insight is generated at all.
  if (top && mid && mid.rate > 0 && insightConfidence(top.contacted + mid.contacted) !== "insufficient") {
    const lift = Math.round((top.rate / mid.rate) * 10) / 10;
    insights.push({
      id: newId("ins"), project_id: input.project_id, kind: "headline",
      title: `Leads scored 80+ showed ${lift}× higher positive-response rate than 60–79`,
      detail: `${top.rate}% vs ${mid.rate}% across ${top.contacted + mid.contacted} contacted leads.`,
      data: { lift, top, mid }, sample_size: sample, generated_at: now,
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
