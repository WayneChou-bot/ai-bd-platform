import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/leads/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { repo } from "@/lib/data";
import { relTime } from "@/lib/utils";
import { getT } from "@/lib/i18n.server";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpDown } from "lucide-react";

const intentLabel = (n: number) => (n >= 75 ? "High" : n >= 50 ? "Medium" : "Low");

export default async function Leads({ searchParams }: { searchParams: Promise<{ view?: string; project?: string; q?: string; sort?: string }> }) {
  const { view = "all", project, q = "", sort = "score" } = await searchParams;
  const r = await repo();
  const { t } = await getT();
  const [leads, quals, runs, projects, outcomes] = await Promise.all([r.leads(project || undefined), r.qualifications(), r.agentRuns(), r.projects(), r.outcomes()]);
  const latestOutcome = new Map<string, (typeof outcomes)[number]["outcome"]>();
  for (const o of [...outcomes].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))) latestOutcome.set(o.lead_id, o.outcome);
  const pname = new Map(projects.map((p) => [p.id, p.name]));
  const qmap = new Map(quals.map((x) => [x.lead_id, x]));
  const lastResearch = new Map<string, string>();
  for (const run of runs) if (run.agent === "research" && run.lead_id && run.completed_at) lastResearch.set(run.lead_id, run.completed_at);

  const filters: Record<string, (s: string) => boolean> = {
    all: () => true,
    qualified: (s) => ["QUALIFIED", "REVIEW", "DRAFTED", "APPROVED", "CONTACTED", "REPLIED", "OUTCOME_RECORDED"].includes(s),
    reviewing: (s) => ["REVIEW", "DRAFTED"].includes(s),
    approved: (s) => ["APPROVED", "CONTACTED", "REPLIED", "OUTCOME_RECORDED"].includes(s),
    rejected: (s) => s === "REJECTED",
  };
  const needle = q.trim().toLowerCase();
  const matches = (l: (typeof leads)[number]) => !needle || [l.company_name, l.display_name, l.industry, l.location, l.source, l.status].some((v) => v?.toLowerCase().includes(needle));
  const statusRank = (s: string) => ["OUTCOME_RECORDED", "REPLIED", "CONTACTED", "APPROVED", "DRAFTED", "REVIEW", "QUALIFIED", "RESEARCHED", "RESEARCHING", "DISCOVERED", "REJECTED"].indexOf(s);
  const sorters: Record<string, (a: (typeof leads)[number], b: (typeof leads)[number]) => number> = {
    score: (a, b) => (qmap.get(b.id)?.total_score ?? -1) - (qmap.get(a.id)?.total_score ?? -1),
    name: (a, b) => a.company_name.localeCompare(b.company_name),
    status: (a, b) => statusRank(a.status) - statusRank(b.status),
    updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
  };
  const rows = leads.filter((l) => (filters[view] ?? filters.all)(l.status)).filter(matches).sort(sorters[sort] ?? sorters.score);
  const link = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams(); const all = { view, project, q, sort, ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    return `/leads?${p.toString()}`;
  };
  const sortTH = (k: string, label: string) => (
    <TH><Link href={link({ sort: k })} className={`inline-flex items-center gap-1 hover:text-fg ${sort === k ? "text-fg" : ""}`}>{label}<ArrowUpDown size={11} className="opacity-50" /></Link></TH>
  );

  return (
    <>
      <PageHeader title={t("Leads")} subtitle={`${rows.length} ${t("of")} ${leads.length}`} />
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {["all", "qualified", "reviewing", "approved", "rejected"].map((v) => (
          <Link key={v} href={link({ view: v })} className={`rounded-lg px-3 py-1.5 text-sm capitalize ${view === v ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}>{t(v)}</Link>
        ))}
        {projects.length > 1 && (
          <div className="ml-auto flex gap-1 text-xs">
            <Link href={link({ project: undefined })} className={`rounded-lg px-2.5 py-1.5 ${!project ? "bg-white/8 text-fg" : "text-muted hover:text-fg"}`}>{t("All projects")}</Link>
            {projects.map((p) => <Link key={p.id} href={link({ project: p.id })} className={`rounded-lg px-2.5 py-1.5 ${project === p.id ? "bg-white/8 text-fg" : "text-muted hover:text-fg"}`}>{p.name}</Link>)}
          </div>
        )}
      </div>
      <form method="get" action="/leads" className="mb-3 flex items-center gap-2">
        <input type="hidden" name="view" value={view} />{project && <input type="hidden" name="project" value={project} />}<input type="hidden" name="sort" value={sort} />
        <div className="relative w-full max-w-80"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><Input name="q" defaultValue={q} placeholder={t("Search leads…")} className="pl-8" /></div>
        {q && <Link href={link({ q: undefined })} className="text-xs text-muted hover:text-fg">{t("Clear")}</Link>}
      </form>
      <Card>
        <Table>
          <THead><TR>{sortTH("name", t("Lead"))}{sortTH("score", t("Score"))}<TH>{t("Intent")}</TH>{sortTH("status", t("Status"))}<TH>{t("Source")}</TH>{sortTH("updated", t("Last Research"))}</TR></THead>
          <TBody>
            {rows.map((l) => {
              const s = qmap.get(l.id);
              return (
                <TR key={l.id}>
                  <TD>
                    <Link href={`/leads/${l.id}`} className="font-medium hover:text-accent">{l.entity_type === "individual" ? l.display_name : l.company_name}</Link>
                    {/* industry · location — the project name is a separate chip (shown in the all-projects view), never a stand-in for a missing location */}
                    <div className="text-xs text-muted">
                      {[l.entity_type === "individual" ? l.headline : l.industry ?? l.website, l.location].filter(Boolean).join(" · ") || "—"}
                      {!project && projects.length > 1 && <span className="ml-1.5 rounded bg-white/5 px-1 text-[10px]">{pname.get(l.project_id)}</span>}
                    </div>
                  </TD>
                  <TD className="tabular font-semibold">{s?.withheld ? <span className="text-learn text-xs">{t("withheld")}</span> : s?.total_score ?? "—"}</TD>
                  <TD>{s && !s.withheld ? t(intentLabel(s.breakdown.intent_signal)) : "—"}</TD>
                  <TD><StatusBadge s={l.status} t={t} outcome={latestOutcome.get(l.id)} /></TD>
                  <TD><Badge>{t(l.source)}</Badge> {l.entity_type === "individual" && <Badge tone="research">{t("individual")}</Badge>}</TD>
                  <TD className="text-muted">{lastResearch.has(l.id) ? relTime(lastResearch.get(l.id)!) : "—"}</TD>
                </TR>
              );
            })}
            {rows.length === 0 && <TR><TD colSpan={6} className="py-8 text-center text-muted">{t("No leads match.")}</TD></TR>}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
