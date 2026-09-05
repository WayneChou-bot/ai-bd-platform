/**
 * Learning Agent confidence gate (§21 hardening).
 * Comparative ("headline" lift) insights must not be generated from tiny
 * samples, and the confidence label must follow the documented bands.
 */
import { describe, expect, it } from "vitest";
import { buildInsights, insightConfidence, MIN_COMPARATIVE_SAMPLE, MIN_GROUP_SAMPLE } from "@/agents/learning";
import type { DeliveryReceipt, Outcome, QualificationResult } from "@/core/schemas";

const qual = (i: number, score: number): QualificationResult => ({
  lead_id: `lead_${String(i).padStart(3, "0")}`,
  breakdown: { product_fit: score, problem_evidence: score, intent_signal: score, role_relevance: score, data_confidence: score },
  total_score: score,
  classification: score >= 80 ? "HIGH_FIT" : score >= 60 ? "MEDIUM_FIT" : "LOW_FIT",
  why: [], risks: [], rationale: "test", withheld: false, scored_at: "2026-08-01T00:00:00.000Z",
});

const outcome = (i: number, kind: Outcome["outcome"]): Outcome => ({
  id: `out_${String(i).padStart(3, "0")}`, lead_id: `lead_${String(i).padStart(3, "0")}`,
  outcome: kind, notes: "", recorded_by: "user", event_id: null, occurred_at: null, recorded_at: "2026-08-02T00:00:00.000Z",
});

const receipt = (i: number): DeliveryReceipt => ({
  id: `rcpt_${String(i).padStart(3, "0")}`, draft_id: `dr_${i}`, lead_id: `lead_${String(i).padStart(3, "0")}`,
  provider: "mock", message_id: `m${i}`, provider_thread_id: null, thread_key: `thr_${i}`,
  simulated: true, sent_at: "2026-08-01T12:00:00.000Z", error: null,
});

/** n SENT leads split across the 80+ and 60–79 bands, each with a recorded outcome. */
function inputWith(n: number) {
  const half = Math.floor(n / 2);
  const qs: QualificationResult[] = []; const os: Outcome[] = []; const rs: DeliveryReceipt[] = [];
  for (let i = 0; i < n; i++) {
    qs.push(qual(i, i < half ? 85 : 65));
    os.push(outcome(i, i % 2 === 0 ? "interested" : "no_response"));
    rs.push(receipt(i));
  }
  return { project_id: "proj_001", leads: [], qualifications: qs, evidence: [], outcomes: os, receipts: rs };
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

  it("an empty comparison group generates NOTHING — no '0× higher' (review v6 F12 / R10)", () => {
    // 80+ band has nobody; 60–79 has 10 assessable sends with outcomes.
    const input = inputWith(MIN_COMPARATIVE_SAMPLE);
    input.qualifications = input.qualifications.map((q) => ({ ...q, total_score: 65, classification: "MEDIUM_FIT" as const }));
    const insights = buildInsights(input, "2026-08-03T00:00:00.000Z", seq());
    expect(insights.some((i) => i.kind === "headline")).toBe(false);
  });

  it("the headline's stated sample is the comparison's own, not the whole project", () => {
    const input = inputWith(MIN_COMPARATIVE_SAMPLE + 2);
    // pile unrelated 40–59 outcomes on: they must not inflate the headline's confidence
    for (let i = 100; i < 200; i++) {
      input.qualifications.push({ ...qual(0, 45), lead_id: `lead_${i}` });
      input.outcomes.push({ ...outcome(0, "no_response"), id: `out_${i}`, lead_id: `lead_${i}` });
      input.receipts.push({ ...receipt(0), id: `rcpt_${i}`, lead_id: `lead_${i}` });
    }
    const headline = buildInsights(input, "2026-08-03T00:00:00.000Z", seq()).find((i) => i.kind === "headline")!;
    expect(headline.sample_size).toBe(MIN_COMPARATIVE_SAMPLE + 2); // the two bands only
    expect(insightConfidence(headline.sample_size)).toBe("directional"); // unchanged by the 100 extras
  });

  it("each group needs its own minimum, not just the sum", () => {
    expect(MIN_GROUP_SAMPLE).toBeLessThanOrEqual(MIN_COMPARATIVE_SAMPLE);
    const input = inputWith(MIN_COMPARATIVE_SAMPLE + 2);
    // shrink the 60–79 control group below MIN_GROUP_SAMPLE while keeping the total high
    input.qualifications = input.qualifications.map((q, i) => (i < MIN_COMPARATIVE_SAMPLE + 2 - (MIN_GROUP_SAMPLE - 1) ? { ...q, total_score: 85, classification: "HIGH_FIT" as const } : q));
    const insights = buildInsights(input, "2026-08-03T00:00:00.000Z", seq());
    expect(insights.some((i) => i.kind === "headline")).toBe(false);
  });
});
