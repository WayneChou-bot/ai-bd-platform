"use server";
/**
 * Strategy adoption (review v6 round 4): a Learning recommendation becomes
 * strategy only when a HUMAN adopts it — recorded append-only, audited, and
 * the agent never edits the ICP itself.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { StrategyAdoption } from "@/core/schemas";
import { newId } from "@/core/orchestrator/run";
import { repo } from "@/lib/data";

const isRedirect = (e: unknown) => (e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT");

export async function decideRecommendationAction(projectId: string, key: string, title: string, action: "adopted" | "dismissed", formData: FormData) {
  try {
    const r = await repo();
    const now = new Date().toISOString();
    await r.addStrategyAdoption(StrategyAdoption.parse({
      id: newId("sad"), project_id: projectId, recommendation_key: key, title,
      action, note: String(formData.get("note") ?? "").trim(), created_at: now,
    }));
    await r.addAuditEvent({ id: newId("aud"), project_id: projectId, lead_id: null, actor: "user", action: `strategy.${action}`, detail: title, created_at: now });
  } catch (e) {
    if (isRedirect(e)) throw e;
  }
  revalidatePath("/analytics");
  redirect(`/analytics?project=${projectId}`);
}
