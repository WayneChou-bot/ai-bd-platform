"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ICPProfile, Project } from "@/core/schemas";
import { runAgent, newId } from "@/core/orchestrator/run";
import { productUnderstandingAgent } from "@/agents/product-understanding";
import { icpSuggestAgent } from "@/agents/icp";
import { agentContext } from "@/lib/context";
import { repo } from "@/lib/data";

const optionalUrl = z.string().trim().url().optional().or(z.literal("").transform(() => undefined));

const ProjectForm = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: z.string().trim().optional().transform((v) => v || undefined),
  description: z.string().trim().default(""),
  website: optionalUrl,
  repository: optionalUrl,
});

async function audit(projectId: string, action: string, detail = "", actor: "user" | "agent" | "system" = "user") {
  const r = await repo();
  await r.addAuditEvent({ id: newId("aud"), project_id: projectId, lead_id: null, actor, action, detail, created_at: new Date().toISOString() });
}

export async function createProjectAction(formData: FormData) {
  const parsed = ProjectForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/projects/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const r = await repo();
  const project = Project.parse({ id: newId("proj"), ...parsed.data, created_at: new Date().toISOString() });
  await r.createProject(project);
  await audit(project.id, "project.created", project.name);
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProjectAction(id: string, formData: FormData) {
  const parsed = ProjectForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/projects/${id}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const r = await repo();
  const existing = await r.project(id);
  await r.updateProject(Project.parse({ ...existing, ...parsed.data }));
  await audit(id, "project.updated");
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}`);
}

export async function runProductUnderstandingAction(id: string, formData: FormData) {
  const r = await repo();
  const project = await r.project(id);
  const readme = String(formData.get("readme") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  try {
    const { output } = await runAgent(r, productUnderstandingAgent, { project, readme, notes }, agentContext(), {
      project_id: id,
      input_summary: [project.name, readme && "README", notes && "notes"].filter(Boolean).join(" + "),
      summarize: (o) => `category=${o.category}; ${o.problem.length} problems; ${o.target_roles.length} roles`,
    });
    await r.saveProductUnderstanding(output);
    await audit(id, "product.understood", output.category, "agent");
  } catch (e) {
    revalidatePath(`/projects/${id}`);
    redirect(`/projects/${id}?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}`);
}

export async function suggestICPAction(id: string) {
  const r = await repo();
  const project = await r.project(id);
  const understanding = await r.productUnderstanding(id);
  if (!understanding) redirect(`/projects/${id}?error=${encodeURIComponent("Run Product Understanding first")}`);
  try {
    const { output } = await runAgent(r, icpSuggestAgent, { project, understanding }, agentContext(), {
      project_id: id,
      input_summary: "product understanding → ICP",
      summarize: (o) => `${o.industries.length} industries; ${o.positive_signals.length} positive signals`,
    });
    await r.saveICP(output);
    await audit(id, "icp.suggested", output.id, "agent");
  } catch (e) {
    revalidatePath(`/projects/${id}`);
    redirect(`/projects/${id}?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}?tab=icp`);
}

const lines = (v: FormDataEntryValue | null) => String(v ?? "").split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);

export async function saveICPAction(id: string, formData: FormData) {
  const r = await repo();
  const existing = await r.icp(id);
  const min = Number(formData.get("size_min"));
  const max = Number(formData.get("size_max"));
  const icp = ICPProfile.parse({
    id: existing?.id ?? newId("icp"),
    project_id: id,
    source: "manual",
    target_entity: String(formData.get("target_entity") ?? "company"),
    industries: lines(formData.get("industries")),
    company_size: min > 0 && max >= min ? { min, max } : undefined,
    regions: lines(formData.get("regions")),
    technologies: lines(formData.get("technologies")),
    target_roles: lines(formData.get("target_roles")),
    business_problems: lines(formData.get("business_problems")),
    positive_signals: lines(formData.get("positive_signals")),
    negative_signals: lines(formData.get("negative_signals")),
    created_at: existing?.created_at ?? new Date().toISOString(),
  });
  await r.saveICP(icp);
  await audit(id, "icp.saved", "manual edit");
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}?tab=icp`);
}

// ---------------------------------------------------------------------------
// Tracked entities (Spec v0.3 §3, §23)
// ---------------------------------------------------------------------------

export async function addTrackedEntityAction(projectId: string, formData: FormData) {
  const r = await repo();
  const back = `/projects/${projectId}?tab=entities`;
  try {
    const { TrackedEntity } = await import("@/core/schemas");
    const list = (v: unknown) => String(v ?? "").split(/[,、;\n]/).map((s) => s.trim()).filter(Boolean);
    const url = String(formData.get("canonical_url") ?? "").trim();
    const entity = TrackedEntity.parse({
      id: newId("ent"), project_id: projectId,
      canonical_name: String(formData.get("canonical_name") ?? "").trim(),
      entity_type: String(formData.get("entity_type") ?? "product"),
      aliases: list(formData.get("aliases")),
      canonical_url: url || undefined,
      identifiers: list(formData.get("identifiers")),
      keywords: list(formData.get("keywords")),
      created_at: new Date().toISOString(),
    });
    await r.saveTrackedEntity(entity);
    await r.addAuditEvent({ id: newId("aud"), project_id: projectId, lead_id: null, actor: "user", action: "entity.tracked", detail: entity.canonical_name, created_at: new Date().toISOString() });
    revalidatePath(back); revalidatePath("/discover");
    redirect(back);
  } catch (e) {
    if ((e as Error & { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`${back}&error=${encodeURIComponent((e as Error).message)}`);
  }
}

export async function deleteTrackedEntityAction(projectId: string, entityId: string) {
  const r = await repo();
  await r.deleteTrackedEntity(entityId);
  revalidatePath(`/projects/${projectId}`); revalidatePath("/discover");
  redirect(`/projects/${projectId}?tab=entities`);
}
