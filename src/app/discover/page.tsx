import Link from "next/link";
import { Play, Radar, Search, XCircle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ErrorAlert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/leads/status-badge";
import { repo } from "@/lib/data";
import { getConfig } from "@/lib/config";
import { getT } from "@/lib/i18n.server";
import { addLeadAction, convertSignalAction, discoverAction, ignoreLeadAction, ignoreSignalAction, importCsvAction, researchLeadAction, runPipelineAction, scanMentionsAction } from "./actions";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { Signal, TrackedEntity } from "@/core/schemas";
import { ExternalLink, Plus } from "lucide-react";

export default async function Discover({ searchParams }: { searchParams: Promise<{ project?: string; view?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "mentions" ? "mentions" : "prospects";
  const r = await repo();
  const { t } = await getT();
  const cfg = getConfig();
  const projects = await r.projects();
  const project = sp.project ? await r.project(sp.project).catch(() => projects[0]) : projects[0];
  const [icp, leads, runs, signals, entities] = await Promise.all([r.icp(project.id), r.leads(project.id), r.agentRuns(), r.signals(project.id), r.trackedEntities(project.id)]);
  const returnTo = `/discover?project=${project.id}`;

  const bySource = leads.reduce((m, l) => m.set(l.source, (m.get(l.source) ?? 0) + 1), new Map<string, number>());
  const candidates = leads.filter((l) => l.status === "DISCOVERED" || l.status === "RESEARCHING" || l.status === "RESEARCHED").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const discoveryRuns = runs.filter((x) => x.project_id === project.id && x.agent === "discovery").sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const sourceLabel: Record<string, string> = { search: t("Web Search"), github: t("Developer Sources"), company_page: t("Company Pages"), csv: t("Imported Leads"), manual: t("Manual"), fixture: t("Demo pool") };
  const runSummary = (s?: string | null) => {
    const m = s?.match(/^(\d+) (?:new )?candidates?$/);
    return m ? `${m[1]} ${t("new candidates — existing leads excluded")}` : s;
  };

  return (
    <>
      <PageHeader
        title={t("Discover")}
        subtitle={`${t("Controlled sources only")}: ${cfg.mode === "demo" ? t("demo seed pool") : [cfg.searchApiKey && "Tavily search", "GitHub"].filter(Boolean).join(" + ")}`}
        right={
          <div className="flex items-center gap-2">
            {projects.length > 1 && (
              <div className="flex gap-1">{projects.map((p) => <Link key={p.id} href={`/discover?project=${p.id}&view=${view}`} className={`rounded-lg px-2.5 py-1.5 text-xs ${p.id === project.id ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}>{p.name}</Link>)}</div>
            )}
            {view === "prospects" ? (
              <>
                <form action={discoverAction.bind(null, project.id)}><SubmitButton disabled={!icp}><Radar size={14} /> {t("Discover")}</SubmitButton></form>
                <form action={runPipelineAction.bind(null, project.id)}><SubmitButton variant="primary" disabled={!icp}><Play size={14} /> {t("Run full pipeline")}</SubmitButton></form>
              </>
            ) : (
              <form action={scanMentionsAction.bind(null, project.id)}><SubmitButton variant="primary"><Radar size={14} /> {t("Scan mentions")}</SubmitButton></form>
            )}
          </div>
        }
      />
      <div className="mb-3 flex items-center gap-1">
        {(["prospects", "mentions"] as const).map((v) => (
          <Link key={v} href={`/discover?project=${project.id}&view=${v}`} className={`rounded-lg px-3 py-1.5 text-sm ${view === v ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}>{t(v === "prospects" ? "Prospects" : "Mentions")}{v === "mentions" && signals.filter((s) => s.status === "NEW").length > 0 && <span className="tabular ml-1.5 rounded-md bg-reply/20 px-1.5 text-xs text-reply">{signals.filter((s) => s.status === "NEW").length}</span>}</Link>
        ))}
      </div>
      <ErrorAlert message={sp.error} />
      {sp.msg && (
        <div className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${sp.msg.includes("⚠") ? "border-learn/40 bg-learn/10 text-learn" : "border-engage/30 bg-engage/10 text-engage"}`}>
          <span>{sp.msg}</span>
          {/* Fresh candidates are only DISCOVERED — the qualified view would be empty (field test). */}
          {view === "prospects" && <Link href={`/leads?project=${project.id}`} className="font-medium underline decoration-dotted hover:decoration-solid">{t("View all leads")} →</Link>}
        </div>
      )}
      {view === "prospects" && !icp && <div className="mb-4 rounded-lg border border-learn/30 bg-learn/10 px-3 py-2 text-sm text-learn">{t("This project has no ICP yet.")} <Link href={`/projects/${project.id}?tab=icp`} className="underline">{t("Define or generate one")}</Link> {t("before discovery.")}</div>}

      {view === "mentions" && (
        <MentionsView t={t} projectId={project.id} signals={signals} entities={entities} />
      )}

      {view === "prospects" && (<>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t("Sources")}</CardTitle><span className="text-xs text-muted">{leads.length} {t("total")}</span></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {[...bySource.entries()].map(([s, n]) => (
                <li key={s} className="flex items-center justify-between"><span className="text-muted">{sourceLabel[s] ?? s}</span><span className="tabular font-medium">{n}</span></li>
              ))}
              {bySource.size === 0 && <li className="text-muted">{t("Nothing discovered yet.")}</li>}
            </ul>
            {icp && (
              <div className="mt-4 border-t border-white/5 pt-3 text-xs text-muted">
                <div className="mb-1 flex items-center justify-between font-medium text-fg/80">
                  <span>{t("Discovering for")}</span>
                  <Link href={`/projects/${project.id}?tab=icp`} className="font-normal text-accent hover:underline">{t("edit in ICP")}</Link>
                </div>
                <div className="flex flex-wrap gap-1">{icp.positive_signals.map((s) => <Badge key={s} tone="engage">{s}</Badge>)}</div>
                <div className="mt-1.5 text-[11px]">{t("Search queries are built from the ICP: industries + positive signals + technologies.")}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("Candidates awaiting research / review")}</CardTitle><span className="text-xs text-muted">{candidates.length}</span></CardHeader>
          <CardContent>
            {candidates.length === 0 && <p className="py-6 text-center text-sm text-muted">{t("No pending candidates. Run Discover to find more, or see")} <Link href="/leads" className="text-accent">{t("Leads")}</Link> {t("for qualified ones.")}</p>}
            <ul className="divide-y divide-white/5">
              {candidates.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/leads/${l.id}`} className="font-medium hover:text-accent">{l.entity_type === "individual" ? l.display_name ?? l.company_name : l.company_name}</Link>
                      <StatusBadge s={l.status} t={t} />
                      <Badge>{sourceLabel[l.source] ?? l.source}</Badge>
                      {l.entity_type === "individual" && <Badge tone="research">{t("individual")}</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{l.industry ?? l.website}</div>
                    <div className="mt-1 text-xs"><span className="text-muted">{t("Why discovered?")} </span>{l.discovery_reason}</div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {/* Jump to the lead afterwards so the user SEES the score + evidence instead of watching the row vanish */}
                    <form action={researchLeadAction.bind(null, l.id, `/leads/${l.id}`)}><SubmitButton variant="primary" className="px-2.5 py-1 text-xs"><Search size={12} /> {l.status === "RESEARCHED" ? t("QUALIFY") : t("Research")}</SubmitButton></form>
                    <form action={ignoreLeadAction.bind(null, l.id, returnTo)}><Button type="submit" variant="ghost" className="px-2.5 py-1 text-xs"><XCircle size={12} /> {t("Ignore")}</Button></form>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>{t("Add a lead manually")}</CardTitle><span className="text-xs text-muted">{t("e.g. a company that messaged you on LinkedIn — Research will fetch its real website")}</span></CardHeader>
        <CardContent>
          <form action={addLeadAction.bind(null, project.id)} className="grid items-end gap-3 md:grid-cols-[1.2fr_1.4fr_0.8fr_1.2fr_auto]">
            <Field label={t("Company / person")}><Input name="company_name" required placeholder="Acme Corp" /></Field>
            <Field label={t("Website")}><Input name="website" type="url" placeholder="https://acme.com" /></Field>
            <Field label={t("Entity")}><Select name="entity_type" defaultValue="company"><option value="company">{t("Company")}</option><option value="individual">{t("Individual")}</option></Select></Field>
            <Field label={t("Why?")} hint={t("optional")}><Input name="reason" placeholder={t("Asked about WareTwin on LinkedIn")} /></Field>
            <Button type="submit" variant="primary"><Plus size={14} /> {t("Add lead")}</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>{t("Import leads from CSV")}</CardTitle><span className="text-xs text-muted">{t("Headers")}: company_name, website, entity_type, reason · {t("existing leads are skipped")}</span></CardHeader>
        <CardContent>
          <form action={importCsvAction.bind(null, project.id)} className="space-y-3">
            <Textarea name="csv" rows={5} required placeholder={"company_name,website,entity_type,reason\nAcme Corp,https://acme.com,company,Met at Computex\nJane Chen,https://janechen.dev,individual,Asked for a quote"} className="font-mono text-xs" />
            <SubmitButton><Plus size={14} /> {t("Import CSV")}</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {discoveryRuns.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>{t("Recent discovery runs")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-white/5 text-sm">
              {discoveryRuns.map((x) => (
                <li key={x.id} className="flex items-center justify-between py-2"><span className="text-muted">{x.input_summary}</span><span className="flex items-center gap-2"><Badge tone={x.status === "COMPLETED" ? "engage" : x.status === "FAILED" ? "danger" : "learn"}>{t(x.status)}</Badge><span className="tabular text-xs text-muted">{runSummary(x.output_summary) || x.error} · {x.created_at.slice(0, 16).replace("T", " ")}</span></span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      </>)}
    </>
  );
}

// ─── Mention Discovery (Spec v0.3 §4B, §25–§28) ─────────────────────────────

function MentionsView({ t, projectId, signals, entities }: { t: (k: string) => string; projectId: string; signals: Signal[]; entities: TrackedEntity[] }) {
  const entityName = new Map(entities.map((e) => [e.id, e.canonical_name]));
  const active = signals.filter((s) => s.status !== "IGNORED");
  const band = (c: number) => (c >= 90 ? { label: t("confirmed"), tone: "engage" as const } : c >= 70 ? { label: t("likely"), tone: "qualify" as const } : { label: t("review"), tone: "learn" as const });
  const relTone = { high: "engage", medium: "qualify", low: "neutral" } as const;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          [t("Mentions"), active.length],
          [t("High relevance"), active.filter((s) => s.business_relevance === "high").length],
          [t("Languages"), new Set(active.map((s) => s.language)).size],
          [t("Converted to leads"), signals.filter((s) => s.status === "CONVERTED").length],
        ] as const).map(([label, v]) => (
          <Card key={label} className="px-4 py-3"><div className="text-xs text-muted">{label}</div><div className="tabular mt-1 text-2xl font-semibold">{v}</div></Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Public mentions of your tracked entities")} <span className="ml-1.5 rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-normal text-muted">{t("Tavily search only — no fallback source")}</span></CardTitle>
          <span className="text-xs text-muted">{t("Tracking")}: {entities.length ? entities.map((e) => e.canonical_name).join("、") : t("derived on first scan")} · <Link href={`/projects/${projectId}?tab=entities`} className="text-accent">{t("edit")}</Link></span>
        </CardHeader>
        <CardContent>
          {active.length === 0 && <p className="py-6 text-center text-sm text-muted">{t("No signals yet — press Scan mentions. A mention is never a lead by itself; you decide what converts.")}</p>}
          <ul className="divide-y divide-white/5">
            {active.map((s) => (
              <li key={s.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={s.source_url} target="_blank" rel="noreferrer" className="font-medium hover:text-accent">{s.title} <ExternalLink size={11} className="inline" /></a>
                      <Badge tone={band(s.confidence).tone}>{band(s.confidence).label} · {s.confidence}</Badge>
                      <Badge tone={relTone[s.business_relevance]}>{t("relevance")} {t(s.business_relevance)}</Badge>
                      {s.status === "CONVERTED" && <Badge tone="engage">{t("converted")}</Badge>}
                    </div>
                    <div className="mt-1 text-sm text-fg/85">“{s.snippet}”</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Badge>{t(s.source_type)}</Badge>
                      <span>{entityName.get(s.entity_id) ?? s.entity_id}</span>
                      <span>· {t(s.mention_context)}</span>
                      <span>· {t("sentiment")} {t(s.sentiment)} / {t("intent")} {t(s.intent)}</span>
                      <span>· {s.language}</span>
                      <span className="tabular">· {t("query")} {s.query}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {/* The human names the buyer (review v6 F04) — the source platform is never the default. */}
                    {s.status === "NEW" && s.business_relevance !== "low" && (
                      <form action={convertSignalAction.bind(null, projectId, s.id)} className="flex flex-wrap items-center gap-1">
                        <input name="company_name" required placeholder={t("Organization mentioned")} className="w-36 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none placeholder:text-muted focus:border-accent/60" />
                        <input name="website" placeholder={t("Website (optional)")} className="w-32 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none placeholder:text-muted focus:border-accent/60" />
                        <SubmitButton variant="primary" className="px-2.5 py-1 text-xs">{t("Convert to Lead")}</SubmitButton>
                      </form>
                    )}
                    {s.status === "NEW" && (
                      <form action={ignoreSignalAction.bind(null, projectId, s.id)}><Button type="submit" variant="ghost" className="px-2.5 py-1 text-xs">{t("Ignore")}</Button></form>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
