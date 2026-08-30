/**
 * Fixture consistency (S7, S12.3): every number in dataset.json must be
 * reproducible from its rows by the same code the app runs.
 */
import { describe, expect, it } from "vitest";
import { DemoDataset } from "@/core/schemas";
import { scoreLead } from "@/core/scoring";
import { buildInsights } from "@/agents/learning";
import { assertGrounded } from "@/agents/outreach";
import { canTransition } from "@/core/orchestrator/lead-state";
import raw from "../../fixtures/demo/dataset.json";

const d = DemoDataset.parse(raw);

describe("demo dataset", () => {
  it("validates against DemoDataset schema and has the S7 shape", () => {
    expect(d.leads).toHaveLength(25);
    const mix = d.qualifications.reduce((m, q) => ({ ...m, [q.classification]: (m[q.classification] ?? 0) + 1 }), {} as Record<string, number>);
    expect(mix.HIGH_FIT).toBe(9);
    expect(mix.MEDIUM_FIT).toBe(9);
    expect((mix.REJECT ?? 0) + (mix.LOW_FIT ?? 0)).toBe(7);
    expect(d.leads.filter((l) => l.entity_type === "individual").length).toBeGreaterThanOrEqual(2);
    expect(d.evidence.length).toBeGreaterThanOrEqual(80);
    expect(d.drafts.length).toBe(18);
    expect(d.inbound_events.length).toBe(15);
    expect(d.outcomes.length).toBeGreaterThanOrEqual(15);
    expect(d.agent_runs.length).toBeGreaterThanOrEqual(110);
    expect(d.agent_runs.some((r) => r.status === "FAILED")).toBe(true);
  });

  it("every qualification score is reproducible from its evidence", () => {
    for (const q of d.qualifications) {
      const ev = d.evidence.filter((e) => e.lead_id === q.lead_id);
      const s = scoreLead(ev);
      expect(q.breakdown).toEqual(s.breakdown);
      expect(q.total_score).toBe(s.total);
      expect(q.classification).toBe(s.classification);
      expect(q.withheld).toBe(s.withheld);
    }
  });

  it("every evidence has a source URL, confidence and timestamp", () => {
    for (const e of d.evidence) {
      expect(e.source_url).toMatch(/^https?:\/\//);
      expect(e.confidence).toBeGreaterThan(0);
      expect(e.observed_at).toBeTruthy();
    }
  });

  it("every draft cites only evidence that exists for its lead", () => {
    for (const dr of d.drafts) {
      const ev = d.evidence.filter((e) => e.lead_id === dr.lead_id);
      expect(() => assertGrounded(dr.evidence_used, ev)).not.toThrow();
      const positives = new Set(ev.filter((e) => e.polarity === "positive").map((e) => e.id));
      for (const id of dr.evidence_used) expect(positives.has(id)).toBe(true);
    }
  });

  it("every receipt, inbound event, classification and outcome links to real rows", () => {
    const leadIds = new Set(d.leads.map((l) => l.id));
    const draftIds = new Set(d.drafts.map((x) => x.id));
    const eventIds = new Set(d.inbound_events.map((x) => x.id));
    for (const r of d.receipts) { expect(leadIds.has(r.lead_id)).toBe(true); expect(draftIds.has(r.draft_id)).toBe(true); }
    for (const e of d.inbound_events) { expect(leadIds.has(e.lead_id!)).toBe(true); expect(d.leads.find((l) => l.thread_key === e.thread_key)).toBeTruthy(); }
    for (const c of d.reply_classifications) { expect(eventIds.has(c.event_id)).toBe(true); expect(leadIds.has(c.lead_id)).toBe(true); }
    for (const o of d.outcomes) { expect(leadIds.has(o.lead_id)).toBe(true); if (o.event_id) expect(eventIds.has(o.event_id)).toBe(true); }
  });

  it("lead status is consistent with the rows that exist for it", () => {
    for (const l of d.leads) {
      const q = d.qualifications.find((x) => x.lead_id === l.id);
      const hasDraft = d.drafts.some((x) => x.lead_id === l.id);
      const hasReceipt = d.receipts.some((x) => x.lead_id === l.id);
      const hasOutcome = d.outcomes.some((x) => x.lead_id === l.id);
      if (l.status === "REJECTED") expect(["REJECT", "LOW_FIT"]).toContain(q!.classification);
      if (hasReceipt) expect(["CONTACTED", "REPLIED", "OUTCOME_RECORDED"]).toContain(l.status);
      if (hasOutcome) expect(l.status).toBe("OUTCOME_RECORDED");
      if (l.status === "DRAFTED") expect(hasDraft && !hasReceipt).toBe(true);
      if (hasReceipt) expect(l.thread_key).toBeTruthy();
    }
  });

  it("learning insights are recomputed exactly from the outcome rows", () => {
    const fresh = buildInsights(
      { project_id: d.project.id, leads: d.leads, qualifications: d.qualifications, evidence: d.evidence, outcomes: d.outcomes },
      d.insights[0].generated_at,
      (() => { let n = 0; return () => `ins_${String(++n).padStart(3, "0")}`; })(),
    );
    expect(fresh).toEqual(d.insights);
  });

  it("audit trail transitions are legal", () => {
    // Reconstruct per-lead status path from audit actions and check each hop is allowed.
    const map: Record<string, string> = { "lead.discovered": "DISCOVERED", "lead.qualified": "QUALIFIED", "lead.rejected": "REJECTED", "lead.review_started": "REVIEW", "draft.created": "DRAFTED", "draft.approved": "APPROVED", "delivery.simulated": "CONTACTED", "inbound.received": "REPLIED", "outcome.recorded": "OUTCOME_RECORDED" };
    for (const l of d.leads) {
      const path = d.audit_events.filter((a) => a.lead_id === l.id && map[a.action]).map((a) => map[a.action]);
      let cur = "DISCOVERED";
      for (const next of path.slice(1)) {
        // research states are implicit in fixtures
        const via = cur === "DISCOVERED" && (next === "QUALIFIED" || next === "REJECTED") ? "RESEARCHED" : cur;
        if (via === "CONTACTED" && next === "OUTCOME_RECORDED") { cur = next; continue; }
        expect(canTransition(via as never, next as never), `${l.company_name}: ${via} → ${next}`).toBe(true);
        cur = next;
      }
    }
  });
});
