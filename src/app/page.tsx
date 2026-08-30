import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Metric } from "@/components/dashboard/metric";
import { Orchestrator } from "@/components/agents/orchestrator";
import { orchestratorStatus } from "@/lib/orchestrator-status";
import { getConfig } from "@/lib/config";
import { playbackState } from "@/lib/demo-playback";
import { getT } from "@/lib/i18n.server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { repo } from "@/lib/data";
import { FunnelBars } from "@/components/charts/charts";
import { projectAnalytics } from "@/lib/analytics";

export default async function Overview({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams;
  const r = await repo();
  const { locale, t } = await getT();
  const pb = playbackState();
  const [project, quals, leads, projects] = await Promise.all([
    // explicit choice > running demo project > first project
    r.project(sp.project ?? pb.projectId ?? undefined).catch(() => r.project()),
    r.qualifications(), r.leads(), r.projects(),
  ]);
  const [a, status] = await Promise.all([projectAnalytics(r, project.id), orchestratorStatus(r, project.id)]);
  const m = a.metrics;
  const ids = new Set(leads.filter((l) => l.project_id === project.id).map((l) => l.id));
  const byId = new Map(leads.map((l) => [l.id, l]));
  const top = quals.filter((q) => !q.withheld && ids.has(q.lead_id)).sort((x, y) => y.total_score - x.total_score).slice(0, 5);

  return (
    <>
      <PageHeader
        title={t("Overview")}
        subtitle={`${t("Project")}: ${project.name} · ${project.category}`}
        right={projects.length > 1 ? (
          <div className="flex gap-1">{projects.map((p) => <Link key={p.id} href={`/?project=${p.id}`} className={`rounded-lg px-2.5 py-1.5 text-xs ${p.id === project.id ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}>{p.name}</Link>)}</div>
        ) : undefined}
      />
      <p className="-mt-3 mb-4 text-xs text-muted">{t("Evidence-first AI Prospecting & Signal Intelligence — traceable evidence, reproducible qualification, visible agent execution, human-controlled outreach.")}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label={t("Leads Found")} value={m.discovered} />
        <Metric label={t("Qualified")} value={m.qualified} />
        <Metric label={t("Reviewed")} value={m.reviewed} />
        <Metric label={t("Outreach Approved")} value={m.approved} />
        <Metric label={t("Replies")} value={m.replies} />
        <Metric label={t("Positive Response Rate")} value={m.positiveRate} suffix="%" hint={`${m.positive} ${t("positive")} / ${m.contacted} ${t("contacted")}`} formula={`${t("Positive Response Rate")} = ${t("positive outcomes")} ÷ ${t("contacted leads")} = ${m.positive} / ${m.contacted}`} />
      </div>

      <section className="mt-5">
        <Orchestrator initial={status} projectId={project.id} canStartDemo={getConfig().mode === "demo"} compact locale={locale} />
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card lift>
          <CardHeader><CardTitle>{t("Pipeline Funnel")}</CardTitle><Link href="/analytics" className="text-xs text-accent">{t("Analytics")}</Link></CardHeader>
          <CardContent><FunnelBars data={a.funnel.filter((f) => f.stage !== "Researched").map((f) => ({ ...f, stage: t(f.stage) }))} height={240} /></CardContent>
        </Card>
        <Card lift>
          <CardHeader><CardTitle>{t("Top Qualified Leads")}</CardTitle><Link href="/leads" className="text-xs text-accent">{t("View all")}</Link></CardHeader>
          <CardContent>
            <ul className="divide-y divide-white/5">
              {top.map((q) => {
                const l = byId.get(q.lead_id)!;
                return (
                  <li key={q.lead_id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <Link href={`/leads/${l.id}`} className="font-medium hover:text-accent">{l.company_name}</Link>
                      <div className="text-xs text-muted">{l.industry} · {l.location}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={q.classification === "HIGH_FIT" ? "engage" : "qualify"}>{t(q.classification.replace("_", " "))}</Badge>
                      <span className="tabular w-8 text-right font-semibold">{q.total_score}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
