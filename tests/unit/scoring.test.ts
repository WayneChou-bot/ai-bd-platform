import { describe, expect, it } from "vitest";
import { classify, computeTotal, scoreLead, WEIGHTS } from "@/core/scoring";
import type { Evidence } from "@/core/schemas";

describe("scoring (§14, §36)", () => {
  it("weights sum to 1", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it("is deterministic for the spec example", () => {
    const b = { product_fit: 100, problem_evidence: 80, intent_signal: 70, role_relevance: 90, data_confidence: 80 };
    // 30 + 20 + 14 + 13.5 + 8 = 85.5 → 86
    expect(computeTotal(b)).toBe(86);
    expect(computeTotal(b)).toBe(computeTotal({ ...b }));
  });
  it("classifies on the spec thresholds", () => {
    expect(classify(80)).toBe("HIGH_FIT");
    expect(classify(79)).toBe("MEDIUM_FIT");
    expect(classify(60)).toBe("MEDIUM_FIT");
    expect(classify(59)).toBe("LOW_FIT");
    expect(classify(39)).toBe("REJECT");
  });
  it("withholds the score with insufficient evidence (§41)", () => {
    const one: Evidence = { id: "e1", lead_id: "l", type: "social_post", category: "content", claim: "x", source_url: "https://a.b/c", observed_at: "2026-08-01T00:00:00.000Z", confidence: 0.9, supports: "intent_signal", polarity: "positive" };
    const r = scoreLead([one]);
    expect(r.withheld).toBe(true);
    expect(r.total).toBe(0);
  });
  it("negative evidence lowers the dimension it targets", () => {
    const base: Evidence = { id: "e", lead_id: "l", type: "company_page", category: "company_profile", claim: "x", source_url: "https://a.b/c", observed_at: "2026-08-01T00:00:00.000Z", confidence: 0.9, supports: "product_fit", polarity: "positive" };
    const pos = scoreLead([base, { ...base, id: "e2", supports: "intent_signal" }]);
    const neg = scoreLead([base, { ...base, id: "e2", supports: "intent_signal" }, { ...base, id: "e3", polarity: "negative", category: "negative" }]);
    expect(neg.breakdown.product_fit).toBeLessThan(pos.breakdown.product_fit);
  });
});
