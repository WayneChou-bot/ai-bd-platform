/**
 * Deterministic weighted scoring (Spec §14).
 *
 * The LLM never invents the total. It only writes the rationale.
 */
import type { Classification, Evidence, ScoreBreakdown } from "@/core/schemas";

export const WEIGHTS = {
  product_fit: 0.3,
  problem_evidence: 0.25,
  intent_signal: 0.2,
  role_relevance: 0.15,
  data_confidence: 0.1,
} as const satisfies Record<keyof ScoreBreakdown, number>;

/** Minimum evidence records required before a score is issued (§41). */
export const MIN_EVIDENCE_FOR_SCORE = 2;

export function computeTotal(b: ScoreBreakdown): number {
  const raw =
    b.product_fit * WEIGHTS.product_fit +
    b.problem_evidence * WEIGHTS.problem_evidence +
    b.intent_signal * WEIGHTS.intent_signal +
    b.role_relevance * WEIGHTS.role_relevance +
    b.data_confidence * WEIGHTS.data_confidence;
  return Math.round(raw);
}

export function classify(total: number): Classification {
  if (total >= 80) return "HIGH_FIT";
  if (total >= 60) return "MEDIUM_FIT";
  if (total >= 40) return "LOW_FIT";
  return "REJECT";
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Strength one positive evidence item contributes (saturating). */
export const POSITIVE_GAIN = 0.9;
/** Fraction of a dimension one negative evidence item removes. */
export const NEGATIVE_DAMPING = 0.6;

/**
 * Derive a breakdown from structured evidence.
 *
 * Each dimension saturates: dim = 100 × (1 − Π(1 − conf × POSITIVE_GAIN))
 * over its positive evidence, then × Π(1 − conf × NEGATIVE_DAMPING) over its
 * negative evidence. One 0.9-confidence item gives ≈81, two give ≈96.
 * Data confidence is the mean evidence confidence scaled to 0–100 with a
 * penalty when evidence is sparse.
 *
 * Fully reproducible from the evidence rows — the fixture-consistency test
 * asserts exactly this.
 */
export function breakdownFromEvidence(evidence: Evidence[]): ScoreBreakdown {
  const keys = ["product_fit", "problem_evidence", "intent_signal", "role_relevance"] as const;
  const dims = {} as Record<(typeof keys)[number], number>;
  for (const k of keys) {
    let miss = 1;
    let damp = 1;
    for (const e of evidence) {
      if (e.supports !== k) continue;
      if (e.polarity === "negative") damp *= 1 - e.confidence * NEGATIVE_DAMPING;
      else miss *= 1 - e.confidence * POSITIVE_GAIN;
    }
    dims[k] = clamp(100 * (1 - miss) * damp);
  }
  const meanConf = evidence.length
    ? evidence.reduce((s, e) => s + e.confidence, 0) / evidence.length
    : 0;
  const sparsityPenalty = Math.max(0, 4 - evidence.length) * 10;
  return {
    ...dims,
    data_confidence: clamp(meanConf * 100 - sparsityPenalty),
  };
}

export interface ScoreOutcome {
  breakdown: ScoreBreakdown;
  total: number;
  classification: Classification;
  withheld: boolean;
}

export function scoreLead(evidence: Evidence[]): ScoreOutcome {
  const breakdown = breakdownFromEvidence(evidence);
  if (evidence.length < MIN_EVIDENCE_FOR_SCORE) {
    return { breakdown, total: 0, classification: "REJECT", withheld: true };
  }
  const total = computeTotal(breakdown);
  return { breakdown, total, classification: classify(total), withheld: false };
}
