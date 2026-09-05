"use server";
/**
 * Messages queue actions (review v6 F15): a needs-human ticket can be
 * dismissed after a look, and an unmatched inbound mail can be assigned to a
 * contacted lead — the queue goes DOWN when a human does the work.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assignInbound, dismissReview } from "@/lib/engagement";
import { repo } from "@/lib/data";

function done(error?: string): never {
  revalidatePath("/messages"); revalidatePath("/leads"); revalidatePath("/");
  redirect(`/messages${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}
const isRedirect = (e: unknown) => (e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT");

export async function dismissReviewAction(classificationId: string) {
  try { await dismissReview(await repo(), classificationId); done(); }
  catch (e) { if (isRedirect(e)) throw e; done((e as Error).message); }
}

export async function assignInboundAction(eventId: string, formData: FormData) {
  try {
    const leadId = String(formData.get("lead_id") ?? "");
    if (!leadId) throw new Error("Pick a lead to assign this mail to");
    await assignInbound(await repo(), eventId, leadId);
    done();
  } catch (e) { if (isRedirect(e)) throw e; done((e as Error).message); }
}
