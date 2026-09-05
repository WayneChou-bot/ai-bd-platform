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
  /** What is being sold — mapping judges relevance to THIS product. */
  product: z.object({ name: z.string(), category: z.string().optional(), description: z.string().optional() }).optional(),
});

const RationaleSchema = z.object({
  rationale: z.string().min(1),
  risks: z.array(z.string()),
});

/** ICP relevance mapping (review v6 F01): before anything is scored, each
 *  evidence item is judged RELATIVE TO this product and ICP — is it relevant
 *  at all, which dimension does it support, and does it match the ICP's
 *  negative signals? The LLM decides the mapping, never the number: the same
 *  deterministic formula then runs on the mapped evidence, so the same facts
 *  score differently against a different ICP. */
const MappingSchema = z.object({
  items: z.array(z.object({
    evidence_id: z.string(),
    relevant: z.boolean(),
    supports: z.enum(["product_fit", "problem_evidence", "intent_signal", "role_relevance"]),
    polarity: z.enum(["positive", "negative"]),
  })),
});

export const qualificationAgent = defineAgent({
  name: "qualification",
  input: QualificationInput,
  output: QualificationResult,
  async run({ lead, icp, evidence, product }, ctx) {
    let mapped = evidence;
    if (evidence.length > 0) {
      const m = await ctx.llm.generateStructured({
        task: "qualification.map_evidence",
        system:
          "You map evidence onto an Ideal Customer Profile for ONE specific product. For each evidence item decide: relevant (does it bear on whether this organization fits THIS ICP for THIS product — the same fact can be irrelevant for a different ICP), which scoring dimension it supports, and polarity (negative when it matches the ICP's negative signals or argues against fit). " +
          "You never produce a score — a deterministic formula runs on your mapping afterwards. When unsure whether an item is relevant to this ICP, mark it irrelevant.",
        prompt: JSON.stringify({
          product: product ?? null,
          icp: { industries: icp.industries, target_roles: icp.target_roles, technologies: icp.technologies, business_problems: icp.business_problems, positive_signals: icp.positive_signals, negative_signals: icp.negative_signals, company_size: icp.company_size ?? null },
          evidence: evidence.map((e) => ({ id: e.id, claim: e.claim, category: e.category, suggested_supports: e.supports, suggested_polarity: e.polarity, confidence: e.confidence })),
        }),
        schema: MappingSchema,
      });
      const byId = new Map(m.data.items.map((i) => [i.evidence_id, i]));
      mapped = evidence.flatMap((e) => {
        const item = byId.get(e.id);
        if (!item) return [e]; // unmapped items keep their research-time judgement
        if (!item.relevant) return [];
        return [{ ...e, supports: item.supports, polarity: item.polarity }];
      });
    }
    const s = scoreLead(mapped);
    const positives = mapped.filter((e) => e.polarity === "positive");
    const negatives = mapped.filter((e) => e.polarity === "negative");

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
          ? { withheld: true, verdict: "WITHHELD — insufficient evidence, no classification was made", evidence_count: mapped.length, minimum_required: 2 }
          : s,
        evidence: evidence.map((e) => ({ id: e.id, claim: e.claim, polarity: e.polarity, confidence: e.confidence })),
      }),
      schema: RationaleSchema,
    });

    const risks = [...explain.data.risks];
    if (negatives.length) risks.push(...negatives.map((e) => `Negative signal: ${e.claim}`));
    const excluded = evidence.length - mapped.length;
    if (excluded > 0) risks.push(`${excluded} evidence item(s) judged irrelevant to this ICP and excluded from scoring`);
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
      icp_id: icp.id,
      scored_at: ctx.now().toISOString(),
    };
  },
});
