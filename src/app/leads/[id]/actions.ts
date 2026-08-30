"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { OutcomeKind } from "@/core/schemas";
import { repo } from "@/lib/data";
import { approveAndSend, editDraft, generateDraft, recordOutcome, rejectDraft, simulateReply, type Tone } from "@/lib/engagement";

function done(leadId: string, error?: string): never {
  revalidatePath(`/leads/${leadId}`); revalidatePath("/leads"); revalidatePath("/messages"); revalidatePath("/"); revalidatePath("/analytics");
  redirect(`/leads/${leadId}?tab=messages${error ? `&error=${encodeURIComponent(error)}` : ""}`);
}
const isRedirect = (e: unknown) => (e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT");

export async function generateDraftAction(leadId: string, formData: FormData) {
  const tone = (String(formData.get("tone") || "professional") as Tone);
  try { await generateDraft(await repo(), leadId, tone); done(leadId); }
  catch (e) { if (isRedirect(e)) throw e; done(leadId, (e as Error).message); }
}
export async function regenerateDraftAction(leadId: string, formData: FormData) {
  return generateDraftAction(leadId, formData);
}
export async function editDraftAction(leadId: string, draftId: string, formData: FormData) {
  try { await editDraft(await repo(), draftId, String(formData.get("subject") ?? ""), String(formData.get("body") ?? "")); done(leadId); }
  catch (e) { if (isRedirect(e)) throw e; done(leadId, (e as Error).message); }
}
export async function rejectDraftAction(leadId: string, draftId: string) {
  try { await rejectDraft(await repo(), draftId); done(leadId); }
  catch (e) { if (isRedirect(e)) throw e; done(leadId, (e as Error).message); }
}
export async function approveAndSendAction(leadId: string, draftId: string) {
  try { await approveAndSend(await repo(), draftId); done(leadId); }
  catch (e) { if (isRedirect(e)) throw e; done(leadId, (e as Error).message); }
}
export async function simulateReplyAction(leadId: string, formData: FormData) {
  try { await simulateReply(await repo(), leadId, String(formData.get("subject") || "Re:"), String(formData.get("body") ?? "")); done(leadId); }
  catch (e) { if (isRedirect(e)) throw e; done(leadId, (e as Error).message); }
}
export async function recordOutcomeAction(leadId: string, formData: FormData) {
  try {
    const outcome = OutcomeKind.parse(formData.get("outcome"));
    await recordOutcome(await repo(), leadId, outcome, String(formData.get("notes") ?? ""));
    done(leadId);
  } catch (e) { if (isRedirect(e)) throw e; done(leadId, (e as Error).message); }
}
export async function setContactEmailAction(leadId: string, formData: FormData) {
  try {
    const r = await repo();
    const lead = await r.lead(leadId);
    if (!lead) throw new Error("lead not found");
    const email = String(formData.get("contact_email") ?? "").trim();
    if (email && !email.split(",").every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()))) throw new Error("Enter one or more comma-separated email addresses");
    await r.updateLead({ ...lead, contact_email: email || undefined, updated_at: new Date().toISOString() });
    done(leadId);
  } catch (e) { if (isRedirect(e)) throw e; done(leadId, (e as Error).message); }
}
