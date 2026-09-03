import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Metric } from "@/components/dashboard/metric";
import { Badge } from "@/components/ui/badge";
import { Donut, FunnelBars, RateBars, TrendLine } from "@/components/charts/charts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { repo } from "@/lib/data";
import { projectAnalytics } from "@/lib/analytics";
import { insightConfidence } from "@/agents/learning";
import { getT } from "@/lib/i18n.server";

export default async function Analytics({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams;
  const r = await repo();
  const { t } = await getT();
  const projects = await r.projects();
  const project = sp.project ? await r.project(sp.project).catch(() => projects[0]) : projects[0];
  const [a, insights] = await Promise.all([projectAnalytics(r, project.id), r.insights()]);
  const headline = insights.filter((i) => i.project_id === project.id).find((i) => i.kind === "headline");
  const m = a.metrics;

  return (
    <>
      <PageHeader
        title={t("Analytics")}
        subtitle={t("Every number is recomputed from rows — nothing is stored as a metric.")}
        right={projects.length > 1 ? (
          <div className="flex gap-1">{projects.map((p) => <Link key={p.id} href={`/analytics?project=${p.id}`} className={`rounded-lg px-2.5 py-1.5 text-xs ${p.id === project.id ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}>{p.name}</Link>)}</div>
        ) : <Badge>{project.name}</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label={t("Discovered")} value={m.discovered} />
        <Metric label={t("Qualified")} value={m.qualified} />
        <Metric label={t("Contacted")} value={m.contacted} />
        <Metric label={t("Reply Rate")} value={m.replyRate} suffix="%" hint={`${m.replies} ${t("replies")}`} formula={`${t("Reply Rate")} = ${t("replies")} ÷ ${t("contacted leads")} = ${m.replies} / ${m.contacted}`} />
        <Metric label={t("Positive Response Rate")} value={m.positiveRate} suffix="%" hint={`${m.positive} ${t("positive")} / ${m.contacted} ${t("contacted")}`} formula={`${t("Positive Response Rate")} = ${t("positive outcomes")} ÷ ${t("contacted leads")} = ${m.positive} / ${m.contacted}`} />
        <Metric label={t("Qualified → Positive")} value={m.qualifiedToPositive} suffix="%" formula={`${t("Qualified → Positive")} = ${t("positive outcomes")} ÷ ${t("qualified leads")} = ${m.positive} / ${m.qualified}`} />
      </div>

      {headline && (
        <Card className="mt-4 border-learn/30"><CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-learn">{headline.title}</span>
            <Badge tone={insightConfidence(headline.sample_size) === "directional" ? "learn" : "engage"}>
              {t(insightConfidence(headline.sample_size))}{insightConfidence(headline.sample_size) === "directional" ? ` · ${t("small sample")}` : ""} · n={headline.sample_size}
            </Badge>
          </div>
          <div className="text-xs text-muted">{headline.detail} · Learning Agent, {headline.generated_at.slice(0, 16).replace("T", " ")}</div>
        </CardContent></Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("Pipeline funnel")}</CardTitle><span className="text-xs text-muted">{t("count per stage")}</span></CardHeader>
          <CardContent><FunnelBars data={a.funnel.map((f) => ({ ...f, stage: t(f.stage) }))} height={260} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("Reply breakdown")}</CardTitle><span className="text-xs text-muted">{t("latest classification per contacted lead")}</span></CardHeader>
          <CardContent>{a.replyBreakdown.length ? <Donut data={a.replyBreakdown} height={200} /> : <p className="py-8 text-center text-sm text-muted">{t("No replies yet.")}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("Positive response by score band")}</CardTitle><span className="text-xs text-muted">{t("does the score predict outcomes?")}</span></CardHeader>
          <CardContent>{a.sample ? <RateBars data={a.bands} /> : <p className="py-8 text-center text-sm text-muted">{t("Record outcomes to see this.")}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("Qualification distribution")}</CardTitle><span className="text-xs text-muted">{a.withheld ? `${a.withheld} ${t("withheld (insufficient evidence)")}` : ""}</span></CardHeader>
          <CardContent><RateBars data={a.distribution.map((d) => ({ ...d, label: t(d.label) }))} suffix="" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("Evidence category performance")}</CardTitle><span className="text-xs text-muted">{t("positive rate among leads carrying the category")}</span></CardHeader>
          <CardContent>{a.categories.length ? <RateBars data={a.categories} /> : <p className="py-8 text-center text-sm text-muted">{t("Record outcomes to see this.")}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("Replies over time")}</CardTitle><span className="text-xs text-muted">{t("per week (week starting)")}</span></CardHeader>
          <CardContent>{a.repliesOverTime.length ? <TrendLine data={a.repliesOverTime} /> : <p className="py-8 text-center text-sm text-muted">{t("No replies yet.")}</p>}</CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("Lead source performance")}</CardTitle></CardHeader>
          <Table>
            <THead><TR><TH>{t("Source")}</TH><TH className="text-right">{t("Discovered")}</TH><TH className="text-right">{t("Qualified")}</TH><TH className="text-right">{t("Positive")}</TH><TH className="text-right">{t("Qualified rate")}</TH></TR></THead>
            <TBody>
              {a.sources.map((s) => (
                <TR key={s.source}><TD className="capitalize">{s.source}</TD><TD className="tabular text-right">{s.discovered}</TD><TD className="tabular text-right">{s.qualified}</TD><TD className="tabular text-right">{s.positive}</TD><TD className="tabular text-right">{s.discovered ? Math.round((s.qualified / s.discovered) * 100) : 0}%</TD></TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("Agent operations")}</CardTitle><span className="text-xs text-muted">{t("latency p50 · failure rate · tokens")}</span></CardHeader>
          <Table>
            <THead><TR><TH>{t("Agent")}</TH><TH className="text-right">{t("Runs")}</TH><TH className="text-right">{t("Failed")}</TH><TH className="text-right">{t("Failure rate")}</TH><TH className="text-right">{t("p50 latency")}</TH><TH className="text-right">{t("Tokens")}</TH></TR></THead>
            <TBody>
              {a.agents.map((x) => (
                <TR key={x.label}><TD className="capitalize">{x.label}</TD><TD className="tabular text-right">{x.runs}</TD><TD className="tabular text-right">{x.failed}</TD><TD className={`tabular text-right ${x.failureRate > 0 ? "text-learn" : ""}`}>{x.failureRate}%</TD><TD className="tabular text-right">{x.p50 ? `${x.p50} ms` : "—"}</TD><TD className="tabular text-right text-muted">{x.tokens ? x.tokens.toLocaleString() : "—"}</TD></TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
