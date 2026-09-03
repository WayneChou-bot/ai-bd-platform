/**
 * Qualification Agent (Spec §14). Deterministic score + LLM rationale.
 */
import { z } from "zod";
import { defineAgent, proseLanguage } from "@/core/orchestrator/agent";
import { Evidence, ICPProfile, Lead, QualificationResult } from "@/core/schemas";
import { scoreLead } from "@/core/scoring";

export const QualificationInput = z.object({
  lead: Lead,
  icp: ICPProfile,
  evidence: z.array(Evidence),
});

const RationaleSchema = z.object({
  rationale: z.string().min(1),
  risks: z.array(z.string()),
});

export const qualificationAgent = defineAgent({
  name: "qualification",
  input: QualificationInput,
  output: QualificationResult,
  async run({ lead, icp, evidence }, ctx) {
    const s = scoreLead(evidence);
    const positives = evidence.filter((e) => e.polarity === "positive");
    const negatives = evidence.filter((e) => e.polarity === "negative");

    // The LLM only explains. It receives the computed numbers and cannot change
    // them. A withheld score is NOT a REJECT: the internal placeholder must
    // never reach the prompt, or the rationale claims a verdict that was never
    // made (field test: "整體評分為 REJECT" on a withheld lead).
    const explain = await ctx.llm.generateStructured({
      task: "qualification.rationale",
      system:
        "You explain a lead qualification result to a business developer. The result is already computed and must not be changed. " +
        "If the score was WITHHELD, explain only that the evidence volume is insufficient for a verdict — do not judge fit either way. " +
        "Write 1–2 sentences referencing only the evidence provided. Then list risks: missing signals, negative evidence, or low confidence." + proseLanguage(ctx),
      prompt: JSON.stringify({
        lead: { name: lead.company_name, entity_type: lead.entity_type, industry: lead.industry },
        icp: { target_roles: icp.target_roles, positive_signals: icp.positive_signals, negative_signals: icp.negative_signals },
        score: s.withheld
          ? { withheld: true, verdict: "WITHHELD — insufficient evidence, no classification was made", evidence_count: evidence.length, minimum_required: 2 }
          : s,
        evidence: evidence.map((e) => ({ id: e.id, claim: e.claim, polarity: e.polarity, confidence: e.confidence })),
      }),
      schema: RationaleSchema,
    });

    const risks = [...explain.data.risks];
    if (negatives.length) risks.push(...negatives.map((e) => `Negative signal: ${e.claim}`));
    if (s.withheld) risks.unshift("Insufficient evidence — score withheld");

    return {
      lead_id: lead.id,
      breakdown: s.breakdown,
      total_score: s.total,
      classification: s.classification,
      why: positives.map((e) => ({ evidence_id: e.id, text: e.claim })),
      risks: Array.from(new Set(risks)),
      rationale: explain.data.rationale,
      withheld: s.withheld,
      scored_at: ctx.now().toISOString(),
    };
  },
});
