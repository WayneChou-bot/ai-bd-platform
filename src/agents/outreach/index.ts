/**
 * Outreach Agent (Spec §18). Phase 3 — contract + grounding guard in Phase 0.
 */
import { z } from "zod";
import { defineAgent } from "@/core/orchestrator/agent";
import { Evidence, ICPProfile, Lead, OutreachDraft, Project } from "@/core/schemas";

export const OutreachInput = z.object({
  project: Project,
  icp: ICPProfile,
  lead: Lead,
  evidence: z.array(Evidence).min(1),
  tone: z.enum(["professional", "friendly", "concise"]).default("professional"),
});

const DraftSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  evidence_used: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
});

/** A draft is grounded only if every evidence id it cites exists AND is
 *  positive — citing negative evidence in outreach copy misrepresents it
 *  (review v6 F02: the guard used to accept negative ids). */
export function assertGrounded(evidence_used: string[], available: Evidence[]): void {
  const byId = new Map(available.map((e) => [e.id, e]));
  const missing = evidence_used.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`Ungrounded draft: unknown evidence ids ${missing.join(", ")}`);
  const negative = evidence_used.filter((id) => byId.get(id)!.polarity === "negative");
  if (negative.length) throw new Error(`Ungrounded draft: negative evidence cannot back outreach claims (${negative.join(", ")})`);
}

export const outreachAgent = defineAgent({
  name: "outreach",
  input: OutreachInput,
  output: OutreachDraft,
  async run({ project, lead, evidence, tone }, ctx) {
    const r = await ctx.llm.generateStructured({
      task: "outreach.draft",
      system:
        "Write a short, honest B2B outreach email. Every factual statement about the prospect must come from the provided evidence and you must list the evidence ids you used. " +
        "Never claim the prospect is 'struggling' or has a problem unless an evidence item says so. Reference what they published or posted instead. No hype.",
      prompt: JSON.stringify({
        product: { name: project.name, description: project.description },
        prospect: { name: lead.company_name, entity_type: lead.entity_type },
        tone,
        evidence: evidence.filter((e) => e.polarity === "positive").map((e) => ({ id: e.id, claim: e.claim, category: e.category })),
      }),
      schema: DraftSchema,
    });
    assertGrounded(r.data.evidence_used, evidence);
    return {
      id: ctx.newId("draft"),
      lead_id: lead.id,
      channel: "email" as const,
      subject: r.data.subject,
      body: r.data.body,
      evidence_used: r.data.evidence_used,
      tone,
      confidence: r.data.confidence,
      status: "DRAFT" as const,
      version: 1,
      human_edited: false,
      created_at: ctx.now().toISOString(),
      approved_at: null,
    };
  },
});
