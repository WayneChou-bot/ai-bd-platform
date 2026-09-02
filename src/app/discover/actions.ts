"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { repo } from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n.server";
import { agentContext, languageOf } from "@/lib/context";
import { discoverLeads, ignoreLead, qualifyLead, researchLead, runPipeline } from "@/lib/pipeline";
import { Lead } from "@/core/schemas";
import { newId } from "@/core/orchestrator/run";

const back = (projectId: string, msg?: string, error?: string) =>
  redirect(`/discover?project=${projectId}${msg ? `&msg=${encodeURIComponent(msg)}` : ""}${error ? `&error=${encodeURIComponent(error)}` : ""}`);

export async function discoverAction(projectId: string) {
  const r = await repo();
  const { t } = await getT();
  try {
    const found = await discoverLeads(r, projectId);
    revalidatePath("/discover"); revalidatePath("/leads");
    back(projectId, `${found.length} ${t("new candidates — existing leads excluded")}`);
  } catch (e) {
    if ((e as Error & { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    back(projectId, undefined, (e as Error).message);
  }
}

export async function runPipelineAction(projectId: string) {
  const r = await repo();
  const { t, locale } = await getT();
  try {
    const s = await runPipeline(r, projectId, agentContext({ language: languageOf(locale) }));
    revalidatePath("/discover"); revalidatePath("/leads"); revalidatePath("/");
    back(projectId, `${t("Discovered")} ${s.discovered} · ${t("Researched")} ${s.researched} · ${t("Qualified")} ${s.qualified} · ${t("Rejected")} ${s.rejected}${s.withheld ? ` · ${t("Withheld")} ${s.withheld}` : ""}${s.failed ? ` · ${t("Failed")} ${s.failed}` : ""}`);
  } catch (e) {
    if ((e as Error & { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    back(projectId, undefined, (e as Error).message);
  }
}

export async function addLeadAction(projectId: string, formData: FormData) {
  const r = await repo();
  try {
    const name = String(formData.get("company_name") ?? "").trim();
    if (!name) throw new Error("Company name is required");
    const website = String(formData.get("website") ?? "").trim();
    const entity = String(formData.get("entity_type") ?? "company") as "company" | "individual";
    const now = new Date().toISOString();
    const lead = Lead.parse({
      id: newId("lead"), project_id: projectId, entity_type: entity, company_name: name,
      display_name: entity === "individual" ? name : undefined,
      website: website || undefined, source: "manual",
      discovery_reason: String(formData.get("reason") ?? "").trim() || "Added manually",
      status: "DISCOVERED", thread_key: null, created_at: now, updated_at: now,
    });
    await r.createLead(lead);
    await r.addAuditEvent({ id: newId("aud"), project_id: projectId, lead_id: lead.id, actor: "user", action: "lead.added_manually", detail: website, created_at: now });
    revalidatePath("/discover"); revalidatePath("/leads");
    back(projectId, `${name} ${(await getT()).t("added")}`);
  } catch (e) {
    if ((e as Error & { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    back(projectId, undefined, (e as Error).message);
  }
}

export async function researchLeadAction(leadId: string, returnTo: string) {
  const r = await repo();
  let error: string | undefined;
  const ctx = agentContext({ language: languageOf(await getLocale()) });
  try {
    await researchLead(r, leadId, ctx);
    await qualifyLead(r, leadId, ctx);
  } catch (e) { error = (e as Error).message; }
  revalidatePath("/discover"); revalidatePath("/leads"); revalidatePath(`/leads/${leadId}`);
  redirect(error ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}` : returnTo);
}

export async function qualifyLeadAction(leadId: string, returnTo: string) {
  const r = await repo();
  let error: string | undefined;
  try { await qualifyLead(r, leadId, agentContext({ language: languageOf(await getLocale()) })); } catch (e) { error = (e as Error).message; }
  revalidatePath("/leads"); revalidatePath(`/leads/${leadId}`);
  redirect(error ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}` : returnTo);
}

export async function ignoreLeadAction(leadId: string, returnTo: string) {
  const r = await repo();
  await ignoreLead(r, leadId);
  revalidatePath("/discover"); revalidatePath("/leads"); revalidatePath(`/leads/${leadId}`);
  redirect(returnTo);
}

// ---------------------------------------------------------------------------
// Mention discovery (Spec v0.3 §4B, §25, §28)
// ---------------------------------------------------------------------------

export async function scanMentionsAction(projectId: string) {
  const r = await repo();
  const { scanMentions } = await import("@/lib/mentions");
  try {
    const res = await scanMentions(r, projectId);
    const { t } = await getT();
    revalidatePath("/discover");
    const msg = [
      `${res.created} ${t("new signals from")} ${res.documents} ${t("documents")}`,
      `${res.skippedExisting} ${t("already known")}`,
      `${res.belowThreshold} ${t("below confidence threshold")}`,
      `${res.selfPublished} ${t("self-published pages skipped")}`,
    ].join(" · ");
    redirect(`/discover?project=${projectId}&view=mentions&msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    if ((e as Error & { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/discover?project=${projectId}&view=mentions&error=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function convertSignalAction(projectId: string, signalId: string) {
  const r = await repo();
  const { convertSignalToLead } = await import("@/lib/mentions");
  try {
    const lead = await convertSignalToLead(r, signalId);
    revalidatePath("/discover"); revalidatePath("/leads");
    redirect(`/leads/${lead.id}`);
  } catch (e) {
    if ((e as Error & { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/discover?project=${projectId}&view=mentions&error=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function ignoreSignalAction(projectId: string, signalId: string) {
  const r = await repo();
  const sig = (await r.signals()).find((s) => s.id === signalId);
  if (sig) await r.updateSignal({ ...sig, status: "IGNORED" });
  revalidatePath("/discover");
  redirect(`/discover?project=${projectId}&view=mentions`);
}

/** CSV import (§28): headers company_name, website, entity_type?, reason?. */
export async function importCsvAction(projectId: string, formData: FormData) {
  const r = await repo();
  const { t } = await getT();
  try {
    const csv = String(formData.get("csv") ?? "").trim();
    if (!csv) throw new Error("CSV is empty");
    const { CSVAdapter, keyOf } = await import("@/adapters/sources");
    const existing = new Set((await r.leads(projectId)).map((l) => keyOf(l)));
    const items = await new CSVAdapter(csv).discover({ icp: undefined as never, limit: 200, exclude: existing }, { now: () => new Date() });
    const now = new Date().toISOString();
    for (const d of items) {
      const lead = Lead.parse({
        id: newId("lead"), project_id: projectId, entity_type: d.entity_type, company_name: d.company_name,
        display_name: d.entity_type === "individual" ? d.company_name : undefined,
        website: d.website, source: "csv", discovery_reason: d.discovery_reason,
        status: "DISCOVERED", thread_key: null, created_at: now, updated_at: now,
      });
      await r.createLead(lead);
      await r.addAuditEvent({ id: newId("aud"), project_id: projectId, lead_id: lead.id, actor: "user", action: "lead.imported_csv", detail: d.website ?? "", created_at: now });
    }
    revalidatePath("/discover"); revalidatePath("/leads");
    back(projectId, `${items.length} ${t("leads imported from CSV")}`);
  } catch (e) {
    if ((e as Error & { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    back(projectId, undefined, (e as Error).message);
  }
}
