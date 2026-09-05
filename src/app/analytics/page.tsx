import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Metric } from "@/components/dashboard/metric";
import { Badge } from "@/components/ui/badge";
import { Donut, FunnelBars, RateBars, TrendLine } from "@/components/charts/charts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { repo } from "@/lib/data";
import { projectAnalytics } from "@/lib/analytics";
import { insightConfidence, OBSERVATION_WINDOW_DAYS } from "@/agents/learning";
import { getT } from "@/lib/i18n.server";
import { Button } from "@/components/ui/button";
import { decideRecommendationAction } from "./actions";

export default async function Analytics({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams;
  const r = await repo();
  const { t } = await getT();
  const projects = await r.projects();
  const project = sp.project ? await r.project(sp.project).catch(() => projects[0]) : projects[0];
  const [a, insights, adoptions] = await Promise.all([projectAnalytics(r, project.id), r.insights(), r.strategyAdoptions(project.id)]);
  const mine = insights.filter((i) => i.project_id === project.id);
  const headline = mine.find((i) => i.kind === "headline");
  const recommendations = mine.filter((i) => i.kind === "recommendation");
  // Standing decision per recommendation: the LATEST adoption row for its key.
  const decision = (key: string) => [...adoptions].filter((x) => x.recommendation_key === key).sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
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
        <Metric label={t("Positive Response Rate")} value={m.positiveRate} suffix="%" hint={`${m.positive} ${t("positive")} / ${m.assessable} ${t("assessable")}${m.awaiting ? ` · ${m.awaiting} ${t("awaiting")}` : ""}`} formula={`${t("Positive Response Rate")} = ${t("positive outcomes")} ÷ ${t("assessable sends (outcome recorded, or observation window elapsed)")} = ${m.positive} / ${m.assessable}`} />
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

      {recommendations.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>{t("Strategy recommendations")}</CardTitle><span className="text-xs text-muted">{t("analysis only — adopting is your decision, and it is recorded")}</span></CardHeader>
          <CardContent>
            <ul className="divide-y divide-white/5">
              {recommendations.map((rec) => {
                const key = String(rec.data.key ?? rec.title);
                const dec = decision(key);
                return (
                  <li key={rec.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{rec.title}</span>
                      {dec
                        ? <Badge tone={dec.action === "adopted" ? "engage" : "neutral"}>{t(dec.action)} · {dec.created_at.slice(0, 10)}</Badge>
                        : <span className="flex gap-1.5">
                            <form action={decideRecommendationAction.bind(null, project.id, key, rec.title, "adopted")}><Button type="submit" variant="primary" className="px-2.5 py-1 text-xs">{t("Adopt")}</Button></form>
                            <form action={decideRecommendationAction.bind(null, project.id, key, rec.title, "dismissed")}><Button type="submit" variant="ghost" className="px-2.5 py-1 text-xs">{t("Dismiss")}</Button></form>
                          </span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{rec.detail} · n={rec.sample_size}</div>
                    {dec?.action === "adopted" && <div className="mt-1 text-xs text-muted">{t("Adopted — reflect it yourself in the ICP:")} <Link href={`/projects/${project.id}?tab=icp`} className="text-accent">{t("edit ICP")}</Link></div>}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
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
          <CardHeader><CardTitle>{t("Positive response by score band")}</CardTitle><span className="text-xs text-muted">{t("among assessable sends")} · {OBSERVATION_WINDOW_DAYS}{t("d window")} · ⏳ = {t("awaiting")}</span></CardHeader>
          <CardContent>{a.sample ? <RateBars data={a.bands} /> : <p className="py-8 text-center text-sm text-muted">{t("Record outcomes to see this.")}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("Qualification distribution")}</CardTitle><span className="text-xs text-muted">{a.withheld ? `${a.withheld} ${t("withheld (insufficient evidence)")}` : ""}</span></CardHeader>
          <CardContent><RateBars data={a.distribution.map((d) => ({ ...d, label: t(d.label) }))} suffix="" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("Evidence category performance")}</CardTitle><span className="text-xs text-muted">{t("positive rate among leads carrying the category")} · {t("among assessable sends")}</span></CardHeader>
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
