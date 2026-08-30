/**
 * ICP Suggestion Agent (Spec §11 — "AI Suggested ICP").
 * Derives an Ideal Customer Profile from the Product Understanding output.
 * The user can edit every field afterwards (Manual ICP).
 */
import { z } from "zod";
import { defineAgent } from "@/core/orchestrator/agent";
import { ICPProfile, ProductUnderstanding, Project } from "@/core/schemas";

export const ICPSuggestInput = z.object({ project: Project, understanding: ProductUnderstanding });

const OutSchema = ICPProfile.omit({ id: true, project_id: true, source: true, created_at: true });

export const icpSuggestAgent = defineAgent({
  name: "product_understanding",
  input: ICPSuggestInput,
  output: ICPProfile,
  async run({ project, understanding }, ctx) {
    const r = await ctx.llm.generateStructured({
      task: "icp.suggest",
      system:
        "From a product analysis, propose an Ideal Customer Profile: industries, company size range, regions, relevant technologies, target roles, business problems, positive buying signals (observable facts such as hiring, launches, published content) and exclusion criteria. " +
        "Prefer signals that can be verified from public sources.",
      prompt: JSON.stringify({ product: project.name, understanding }),
      schema: OutSchema,
    });
    return { ...r.data, id: ctx.newId("icp"), project_id: project.id, source: "ai_suggested" as const, created_at: ctx.now().toISOString() };
  },
});
