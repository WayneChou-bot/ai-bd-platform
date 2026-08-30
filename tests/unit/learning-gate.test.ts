/**
 * Learning Agent confidence gate (§21 hardening).
 * Comparative ("headline" lift) insights must not be generated from tiny
 * samples, and the confidence label must follow the documented bands.
 */
import { describe, expect, it } from "vitest";
import { buildInsights, insightConfidence, MIN_COMPARATIVE_SAMPLE } from "@/agents/learning";
import type { Outcome, QualificationResult } from "@/core/schemas";

const qual = (i: number, score: number): QualificationResult => ({
  lead_id: `lead_${String(i).padStart(3, "0")}`,
  breakdown: { product_fit: score, problem_evidence: score, intent_signal: score, role_relevance: score, data_confidence: score },
  total_score: score,
  classification: score >= 80 ? "HIGH_FIT" : score >= 60 ? "MEDIUM_FIT" : "LOW_FIT",
  why: [], risks: [], rationale: "test", withheld: false, scored_at: "2026-08-01T00:00:00.000Z",
});

const outcome = (i: number, kind: Outcome["outcome"]): Outcome => ({
  id: `out_${String(i).padStart(3, "0")}`, lead_id: `lead_${String(i).padStart(3, "0")}`,
  outcome: kind, notes: "", recorded_by: "user", event_id: null, recorded_at: "2026-08-02T00:00:00.000Z",
});

/** n leads split across the 80+ and 60–79 bands, each with a recorded outcome. */
function inputWith(n: number) {
  const half = Math.floor(n / 2);
  const qs: QualificationResult[] = []; const os: Outcome[] = [];
  for (let i = 0; i < n; i++) {
    qs.push(qual(i, i < half ? 85 : 65));
    os.push(outcome(i, i % 2 === 0 ? "interested" : "no_response"));
  }
  return { project_id: "proj_001", leads: [], qualifications: qs, evidence: [], outcomes: os };
}

const seq = () => { let n = 0; return () => `ins_${String(++n).padStart(3, "0")}`; };

describe("insightConfidence bands", () => {
  it("maps sample sizes to the documented bands", () => {
    expect(insightConfidence(0)).toBe("insufficient");
    expect(insightConfidence(MIN_COMPARATIVE_SAMPLE - 1)).toBe("insufficient");
    expect(insightConfidence(MIN_COMPARATIVE_SAMPLE)).toBe("directional");
    expect(insightConfidence(29)).toBe("directional");
    expect(insightConfidence(30)).toBe("moderate");
    expect(insightConfidence(99)).toBe("moderate");
    expect(insightConfidence(100)).toBe("strong");
  });
});

describe("comparative insight gate", () => {
  it("does NOT generate a headline lift insight below the minimum sample", () => {
    const insights = buildInsights(inputWith(MIN_COMPARATIVE_SAMPLE - 2), "2026-08-03T00:00:00.000Z", seq());
    expect(insights.some((i) => i.kind === "headline")).toBe(false);
    // the non-comparative insights are still produced
    expect(insights.some((i) => i.kind === "score_band_response")).toBe(true);
  });

  it("generates the headline once the sample reaches the minimum", () => {
    const insights = buildInsights(inputWith(MIN_COMPARATIVE_SAMPLE + 2), "2026-08-03T00:00:00.000Z", seq());
    const headline = insights.find((i) => i.kind === "headline");
    expect(headline).toBeDefined();
    expect(insightConfidence(headline!.sample_size)).toBe("directional");
  });
});
