import { describe, expect, it } from "vitest";
import { Evidence, Lead, OutreachDraft, QualificationResult } from "@/core/schemas";

const ts = "2026-08-01T00:00:00.000Z";

describe("schema validation (§24, §36)", () => {
  it("rejects a missing field", () => {
    expect(() => Lead.parse({ id: "l1", project_id: "p", source: "csv", status: "DISCOVERED", created_at: ts, updated_at: ts })).toThrow();
  });
  it("rejects a malformed URL", () => {
    expect(() => Evidence.parse({ id: "e", lead_id: "l", type: "job_posting", category: "hiring", claim: "c", source_url: "not a url", observed_at: ts, confidence: 0.5, supports: "product_fit" })).toThrow();
  });
  it("rejects an invalid score", () => {
    expect(() => QualificationResult.parse({ lead_id: "l", breakdown: { product_fit: 101, problem_evidence: 0, intent_signal: 0, role_relevance: 0, data_confidence: 0 }, total_score: 50, classification: "LOW_FIT", why: [], risks: [], rationale: "", scored_at: ts })).toThrow();
  });
  it("rejects an unknown status", () => {
    expect(() => Lead.parse({ id: "l1", project_id: "p", company_name: "A", source: "csv", status: "SENT", created_at: ts, updated_at: ts })).toThrow();
  });
  it("rejects an unsupported evidence type", () => {
    expect(() => Evidence.parse({ id: "e", lead_id: "l", type: "rumour", category: "hiring", claim: "c", source_url: "https://a.b", observed_at: ts, confidence: 0.5, supports: "product_fit" })).toThrow();
  });
  it("requires a draft to cite at least one evidence id", () => {
    expect(() => OutreachDraft.parse({ id: "d", lead_id: "l", channel: "email", subject: "s", body: "b", evidence_used: [], tone: "professional", confidence: 0.5, status: "DRAFT", created_at: ts })).toThrow();
  });
});
