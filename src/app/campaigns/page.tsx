import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { repo } from "@/lib/data";
import { projectAnalytics } from "@/lib/analytics";
import { getT } from "@/lib/i18n.server";

export default async function Campaigns() {
  const { t } = await getT();
  const r = await repo();
  const [projects, drafts, cls, events, leads] = await Promise.all([r.projects(), r.drafts(), r.replyClassifications(), r.inboundEvents(), r.leads()]);
  const leadProject = new Map(leads.map((l) => [l.id, l.project_id]));
  const leadName = new Map(leads.map((l) => [l.id, l.entity_type === "individual" ? l.display_name ?? l.company_name : l.company_name]));
  const cards = await Promise.all(projects.map(async (p) => {
    const a = await projectAnalytics(r, p.id);
    const awaiting = drafts.filter((d) => d.status === "DRAFT" && leadProject.get(d.lead_id) === p.id).length;
    const needsHuman = cls.filter((c) => c.needs_human && leadProject.get(c.lead_id) === p.id).length;
    const latest = [...events].filter((e) => e.lead_id && leadProject.get(e.lead_id) === p.id).sort((x, y) => y.received_at.localeCompare(x.received_at))[0];
    return { p, a, awaiting, needsHuman, latest, latestCls: latest ? cls.find((c) => c.event_id === latest.id) : undefined };
  }));
  const stages = ["Qualified", "Approved", "Contacted", "Replies", "Positive"];
  return (
    <>
      <PageHeader title={t("Engagement")} subtitle={t("One campaign per project: the outreach funnel, what is waiting on you, and the latest replies.")} />
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map(({ p, a, awaiting, needsHuman, latest, latestCls }) => (
          <Card key={p.id} lift>
            <CardHeader>
              <div><CardTitle>{p.name}</CardTitle><div className="text-xs text-muted">{p.category ?? "—"} · {a.metrics.discovered} {t("leads")}</div></div>
              <Link href={`/projects/${p.id}`}><Button className="px-2.5 py-1 text-xs">{t("Open project")}</Button></Link>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {stages.map((s) => {
                  const f = a.funnel.find((x) => x.stage === s);
                  const v = f?.value ?? 0;
                  return (
                    <li key={s} className="flex items-center gap-3 text-sm">
                      <span className="w-20 text-muted">{t(s)}</span>
                      <span className="h-1.5 flex-1 rounded-full bg-white/5"><span className="block h-full rounded-full bg-gradient-to-r from-discover to-engage" style={{ width: `${Math.max(2, (v / Math.max(1, a.metrics.discovered)) * 100)}%` }} /></span>
                      <span className="tabular w-8 text-right">{v}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <Link href="/messages"><Badge tone={awaiting ? "learn" : "neutral"}>{awaiting} {t("Awaiting review")}</Badge></Link>
                <Link href="/messages"><Badge tone={needsHuman ? "learn" : "neutral"}>{needsHuman} {t("Needs a human")}</Badge></Link>
                <Badge tone="engage">{a.metrics.positiveRate}% {t("Positive Response Rate")}</Badge>
              </div>
              <div className="mt-3 border-t border-white/5 pt-3 text-xs">
                <span className="text-muted">{t("Latest reply")}: </span>
                {latest ? (
                  <Link href={`/leads/${latest.lead_id}?tab=messages`} className="hover:text-accent">{leadName.get(latest.lead_id!)} — “{latest.subject}”{latestCls && <Badge tone="reply" className="ml-2">{t(latestCls.outcome)}</Badge>}</Link>
                ) : <span className="text-muted">{t("No campaign activity yet.")}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
