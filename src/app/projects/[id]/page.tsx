import Link from "next/link";
import { notFound } from "next/navigation";
import { Play, Sparkles, Wand2 } from "lucide-react";
import { runPipelineAction } from "@/app/discover/actions";
import { getT } from "@/lib/i18n.server";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ErrorAlert } from "@/components/ui/alert";
import { repo } from "@/lib/data";
import { addTrackedEntityAction, deleteTrackedEntityAction, runProductUnderstandingAction, saveICPAction, suggestICPAction, updateProjectAction } from "../actions";

const TABS = ["product", "understanding", "icp", "entities", "activity"] as const;
const Tags = ({ items, tone }: { items: string[]; tone?: "engage" | "danger" | "research" | "neutral" }) => (
  <div className="flex flex-wrap gap-1">{items.length ? items.map((i, n) => <Badge key={`${i}-${n}`} tone={tone}>{i}</Badge>) : <span className="text-xs text-muted">—</span>}</div>
);
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="grid grid-cols-[150px_1fr] gap-2 py-2 text-sm"><span className="text-muted">{k}</span><span>{v}</span></div>
);

export default async function ProjectDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; error?: string }> }) {
  const { id } = await params;
  const { tab = "product", error } = await searchParams;
  const r = await repo();
  const { t } = await getT();
  const project = await r.project(id).catch(() => undefined);
  if (!project) notFound();
  const [understanding, icp, leads, audit, runs, entities] = await Promise.all([
    r.productUnderstanding(id), r.icp(id), r.leads(id), r.auditEvents(), r.agentRuns(), r.trackedEntities(id),
  ]);
  const projectAudit = audit.filter((a) => a.project_id === id && !a.lead_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const projectRuns = runs.filter((x) => x.project_id === id && !x.lead_id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10);
  const runPU = runProductUnderstandingAction.bind(null, id);
  const suggest = suggestICPAction.bind(null, id);
  const saveICP = saveICPAction.bind(null, id);
  const update = updateProjectAction.bind(null, id);
  const join = (a: string[]) => a.join("\n");
  /** First incomplete pipeline step — highlighted so the flow is obvious. */
  const nextStep = !understanding ? 1 : !icp ? 2 : leads.length === 0 ? 3 : 0;

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={project.category ?? "No category"}
        right={<div className="flex items-center gap-2"><Badge>{leads.length} {t("leads")}</Badge>{understanding && <Badge tone="engage">{t("Product understood")}</Badge>}{icp && <Badge tone="engage">ICP · {icp.source.replace("_", " ")}</Badge>}</div>}
      />
      <div className="mb-4 flex gap-1 border-b border-white/10">
        {TABS.map((tab_) => (
          <Link key={tab_} href={`/projects/${id}?tab=${tab_}`} className={`px-3 py-2 text-sm capitalize ${tab === tab_ ? "border-b-2 border-accent text-fg" : "text-muted hover:text-fg"}`}>{tab_ === "icp" ? t("ICP") : tab_ === "activity" ? t("Activity") : tab_ === "entities" ? t("Entities") : t(tab_)}</Link>
        ))}
      </div>
      <ErrorAlert message={error} />

      {/* ─── Product ─────────────────────────────────────────────────────── */}
      {tab === "product" && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader><CardTitle>{t("Product profile")}</CardTitle></CardHeader>
            <CardContent>
              <form action={update} className="space-y-4">
                <Field label={t("Product name")}><Input name="name" defaultValue={project.name} required /></Field>
                <Field label={t("Category")}>
                  <Input name="category" list="category-options" defaultValue={project.category ?? ""} />
                  <datalist id="category-options">
                    <option value="Developer Tool / Knowledge Management" /><option value="AI / ML Platform" /><option value="SaaS / B2B Software" />
                    <option value="Data / Analytics" /><option value="Security / Compliance" /><option value="E-commerce" /><option value="Fintech" />
                    <option value="IoT / Digital Twin" /><option value="Healthcare / Biotech" /><option value="Open Source Project" />
                  </datalist>
                </Field>
                <Field label={t("Description")}><Textarea name="description" rows={4} defaultValue={project.description} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("Website")}><Input name="website" type="url" defaultValue={project.website ?? ""} /></Field>
                  <Field label={t("GitHub repository")}><Input name="repository" type="url" defaultValue={project.repository ?? ""} /></Field>
                </div>
                <div className="flex justify-end"><Button type="submit">{t("Save")}</Button></div>
              </form>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>{t("Pipeline for this project")}</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <ol>
                {[
                  { n: 1, href: `/projects/${id}?tab=understanding`, label: t("Product Understanding"), done: !!understanding, extra: "" },
                  { n: 2, href: `/projects/${id}?tab=icp`, label: t("ICP"), done: !!icp, extra: icp ? ` (${icp.source.replace("_", " ")})` : "" },
                  { n: 3, href: `/discover?project=${id}`, label: t("Discovery"), done: leads.length > 0, extra: leads.length ? ` · ${leads.length} ${t("leads")}` : "" },
                ].map((s) => (
                  <li key={s.n}>
                    <Link href={s.href} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5 ${nextStep === s.n ? "bg-accent/10 ring-1 ring-accent/40" : ""}`}>
                      <Badge tone={s.done ? "engage" : "neutral"}>{s.done ? "✓" : s.n}</Badge>
                      <span className={s.done ? "" : "text-muted"}>{s.label}{s.extra}</span>
                      {nextStep === s.n && <span className="ml-auto text-xs font-medium text-accent">← {t("next step")}</span>}
                    </Link>
                    {s.n < 3 && <div className="ml-[18px] h-2 w-px bg-white/15" />}
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex gap-2">
                <Link href={`/discover?project=${id}`}><Button disabled={!icp}>{t("Open Discover")}</Button></Link>
                <form action={runPipelineAction.bind(null, id)}><SubmitButton variant="primary" disabled={!icp}><Play size={14} /> {t("Run full pipeline")}</SubmitButton></form>
              </div>
              {!icp && <p className="mt-2 text-xs text-learn">{t("Run full pipeline unlocks after steps 1–2 — click the highlighted step to complete it.")}</p>}
              <p className="mt-4 text-xs text-muted">{t("The platform must understand what is being promoted before it looks for anyone to promote it to.")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Understanding ───────────────────────────────────────────────── */}
      {tab === "understanding" && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>{t("Run Product Understanding Agent")}</CardTitle></CardHeader>
            <CardContent>
              <form action={runPU} className="space-y-4">
                <Field label="README" hint={t("optional — auto-fetched from the GitHub repository when empty; treated as untrusted data")}><Textarea name="readme" rows={6} placeholder="Paste your README.md here" /></Field>
                <Field label={t("Manual notes")} hint={t("optional")}><Textarea name="notes" rows={3} placeholder={t("Anything the description does not say")} /></Field>
                <div className="flex justify-end"><SubmitButton variant="primary"><Sparkles size={14} /> {understanding ? t("Re-run") : t("Understand product")}</SubmitButton></div>
              </form>
            </CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader><CardTitle>{t("Structured output")}</CardTitle>{understanding && <span className="text-xs text-muted">{t("confidence")} {understanding.confidence} · {understanding.generated_at.slice(0, 16).replace("T", " ")}</span>}</CardHeader>
            <CardContent>
              {understanding ? (
                <div className="divide-y divide-white/5">
                  <Row k={t("Category")} v={understanding.category} />
                  <Row k={t("Problems solved")} v={<Tags items={understanding.problem} tone="research" />} />
                  <Row k={t("Value propositions")} v={<Tags items={understanding.value_propositions} tone="engage" />} />
                  <Row k={t("Target roles")} v={<Tags items={understanding.target_roles} />} />
                  <Row k={t("Target company types")} v={<Tags items={understanding.target_company_types} />} />
                  <div className="pt-4">
                    <form action={suggest}><SubmitButton variant="primary"><Wand2 size={14} /> {t("Suggest ICP from this")}</SubmitButton></form>
                  </div>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted">{t("Not run yet. The agent returns structured JSON only — the UI never shows raw model text.")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── ICP ─────────────────────────────────────────────────────────── */}
      {tab === "icp" && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>{t("Ideal Customer Profile")}</CardTitle>
              <form action={suggest}><SubmitButton disabled={!understanding} title={understanding ? "" : t("Run Product Understanding first")}><Wand2 size={14} /> {t("AI suggest")}</SubmitButton></form>
            </CardHeader>
            <CardContent>
              {/* Guided empty state (field test: step 2 lit up, the tab opened on a blank form,
                  and the real next action — suggest from the understanding — was easy to miss). */}
              {!icp && (
                <div className="mb-4 rounded-xl border border-accent/30 bg-accent/10 p-5">
                  <div className="text-sm font-semibold">{t("Step 2 — define who to look for")}</div>
                  {understanding ? (
                    <>
                      <p className="mt-1 text-xs text-muted">{t("The product is understood. Let the ICP Suggestion Agent derive buyer industries, roles and observable buying signals from it — every field can be edited before you save.")}</p>
                      <form action={suggest} className="mt-3"><SubmitButton variant="primary"><Wand2 size={14} /> {t("Suggest ICP from product understanding")}</SubmitButton></form>
                      <p className="mt-2 text-xs text-muted">{t("Or expand the form below, fill it in by hand and save it as a manual ICP.")}</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-xs text-muted">{t("Run Product Understanding first (step 1) — the suggestion is derived from it. You can still fill in the form by hand.")}</p>
                      <Link href={`/projects/${id}?tab=understanding`} className="mt-3 inline-block"><Button>{t("Go to Product Understanding")}</Button></Link>
                    </>
                  )}
                </div>
              )}
              <details open={!!icp} className="group">
                <summary className={`cursor-pointer text-xs text-muted hover:text-fg ${icp ? "hidden" : ""}`}>{t("Fill in manually")}</summary>
              <form action={saveICP} className="space-y-4 pt-2">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label={t("Target entity")}>
                    <Select name="target_entity" defaultValue={icp?.target_entity ?? "company"}>
                      <option value="company">{t("Company")}</option><option value="individual">{t("Individual")}</option><option value="both">{t("Both")}</option>
                    </Select>
                  </Field>
                  <Field label={t("Company size min")}><Input name="size_min" type="number" min={1} defaultValue={icp?.company_size?.min ?? ""} /></Field>
                  <Field label={t("Company size max")}><Input name="size_max" type="number" min={1} defaultValue={icp?.company_size?.max ?? ""} /></Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("Industries")} hint={t("one per line")}><Textarea name="industries" rows={3} defaultValue={join(icp?.industries ?? [])} /></Field>
                  <Field label={t("Regions")} hint={t("one per line")}><Textarea name="regions" rows={3} defaultValue={join(icp?.regions ?? [])} /></Field>
                  <Field label={t("Relevant technology")} hint={t("one per line")}><Textarea name="technologies" rows={3} defaultValue={join(icp?.technologies ?? [])} /></Field>
                  <Field label={t("Target roles")} hint={t("one per line")}><Textarea name="target_roles" rows={3} defaultValue={join(icp?.target_roles ?? [])} /></Field>
                  <Field label={t("Business problems")} hint={t("one per line")}><Textarea name="business_problems" rows={3} defaultValue={join(icp?.business_problems ?? [])} /></Field>
                  <Field label={t("Positive signals")} hint={t("observable facts: hiring, launches, posts")}><Textarea name="positive_signals" rows={3} defaultValue={join(icp?.positive_signals ?? [])} /></Field>
                  <Field label={t("Exclusion criteria")} hint={t("negative signals")}><Textarea name="negative_signals" rows={3} defaultValue={join(icp?.negative_signals ?? [])} /></Field>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted">{icp ? `${icp.source.replace("_", " ")} · ${icp.created_at.slice(0, 10)}` : t("No ICP yet")}</span>
                  <Button type="submit" variant="primary">{t("Save as manual ICP")}</Button>
                </div>
              </form>
              </details>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>{t("Preview")}</CardTitle></CardHeader>
            <CardContent>
              {icp ? (
                <div className="divide-y divide-white/5">
                  <Row k={t("Entity")} v={icp.target_entity} />
                  <Row k={t("Industry")} v={<Tags items={icp.industries} />} />
                  <Row k={t("Size")} v={icp.company_size ? `${icp.company_size.min}–${icp.company_size.max}` : "—"} />
                  <Row k={t("Roles")} v={<Tags items={icp.target_roles} />} />
                  <Row k={t("Positive signals")} v={<Tags items={icp.positive_signals} tone="engage" />} />
                  <Row k={t("Negative signals")} v={<Tags items={icp.negative_signals} tone="danger" />} />
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted">{t("Suggest with AI or fill in manually.")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Activity ────────────────────────────────────────────────────── */}
      {/* ─── Tracked entities (Spec v0.3 §3) ─────────────────────────────── */}
      {tab === "entities" && (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader><CardTitle>{t("Tracked entities")}</CardTitle><span className="text-xs text-muted">{t("Mention Discovery searches for these names, aliases and identifiers")}</span></CardHeader>
            <CardContent>
              {entities.length === 0 && <p className="py-4 text-sm text-muted">{t("None yet — the first mention scan derives one from the project name and repository, or add one below.")}</p>}
              <ul className="divide-y divide-white/5">
                {entities.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><span className="font-medium">{e.canonical_name}</span><Badge tone="research">{t(e.entity_type)}</Badge></div>
                      {e.aliases.length > 0 && <div className="mt-1 text-xs text-muted">{t("Aliases")}: {e.aliases.join("、")}</div>}
                      {e.identifiers.length > 0 && <div className="mt-0.5 text-xs text-muted">{t("Identifiers")}: {e.identifiers.join("、")}</div>}
                      {e.keywords.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{e.keywords.map((k, n) => <Badge key={`${k}-${n}`}>{k}</Badge>)}</div>}
                      {e.canonical_url && <a href={e.canonical_url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs text-muted hover:text-accent">{e.canonical_url}</a>}
                    </div>
                    <form action={deleteTrackedEntityAction.bind(null, id, e.id)}><Button type="submit" variant="ghost" className="px-2 py-1 text-xs">{t("Remove")}</Button></form>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>{t("Track a new entity")}</CardTitle></CardHeader>
            <CardContent>
              <form action={addTrackedEntityAction.bind(null, id)} className="space-y-3">
                <Field label={t("Canonical name")}><Input name="canonical_name" required placeholder="WareTwin" /></Field>
                <Field label={t("Entity")}><Select name="entity_type" defaultValue="product"><option value="product">{t("product")}</option><option value="company">{t("company")}</option><option value="repository">{t("repository")}</option><option value="person">{t("person")}</option><option value="technology">{t("technology")}</option></Select></Field>
                <Field label={t("Aliases")} hint={t("comma separated")}><Input name="aliases" placeholder="Ware Twin, WareTwin Digital Twin" /></Field>
                <Field label={t("Identifiers")} hint={t("e.g. GitHub repo path")}><Input name="identifiers" placeholder="WayneChou-bot/WareTwin" /></Field>
                <Field label={t("Related topics")} hint={t("comma separated")}><Input name="keywords" placeholder="warehouse digital twin, AGV simulation" /></Field>
                <Field label={t("Canonical URL")} hint={t("optional")}><Input name="canonical_url" type="url" placeholder="https://github.com/WayneChou-bot/WareTwin" /></Field>
                <SubmitButton variant="primary">{t("Track entity")}</SubmitButton>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "activity" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>{t("Agent runs")}</CardTitle></CardHeader>
            <CardContent>
              {projectRuns.length === 0 && <p className="text-sm text-muted">{t("No runs yet.")}</p>}
              <ul className="divide-y divide-white/5 text-sm">
                {projectRuns.map((x) => (
                  <li key={x.id} className="flex items-center justify-between py-2">
                    <div><span className="capitalize">{t(x.agent === "icp_suggest" ? "ICP Suggest" : x.agent.replace("_", " "))}</span><div className="text-xs text-muted">{x.output_summary || x.error || x.input_summary}</div></div>
                    <div className="text-right"><Badge tone={x.status === "COMPLETED" ? "engage" : x.status === "FAILED" ? "danger" : "learn"}>{x.status}</Badge><div className="tabular text-xs text-muted">{x.latency_ms != null ? `${x.latency_ms} ms` : ""} · {x.model ?? ""}</div></div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("Audit trail")}</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y divide-white/5 text-sm">
                {projectAudit.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2"><div><span className="font-medium">{a.action}</span> <Badge>{a.actor}</Badge><div className="text-xs text-muted">{a.detail}</div></div><span className="text-xs text-muted">{a.created_at.slice(0, 16).replace("T", " ")}</span></li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
