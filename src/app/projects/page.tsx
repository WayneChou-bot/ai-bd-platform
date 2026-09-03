import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { repo } from "@/lib/data";
import { projectAnalytics } from "@/lib/analytics";
import { getT } from "@/lib/i18n.server";

export default async function Projects() {
  const r = await repo();
  const { t } = await getT();
  const projects = await r.projects();
  const rows = await Promise.all(projects.map(async (p) => ({
    p,
    understanding: await r.productUnderstanding(p.id),
    icp: await r.icp(p.id),
    leads: (await r.leads(p.id)).length,
    m: (await projectAnalytics(r, p.id)).metrics,
  })));
  return (
    <>
      <PageHeader title={t("Projects")} subtitle={t("Every BD campaign belongs to a project.")} right={<Link href="/projects/new"><Button variant="primary"><Plus size={14} /> {t("New project")}</Button></Link>} />
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map(({ p, understanding, icp, leads, m }) => (
          <Link key={p.id} href={`/projects/${p.id}`}>
            <Card lift className="h-full">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="mt-0.5 text-xs text-muted">{p.category ?? "—"}</div>
                  </div>
                  <Badge>{leads} {t("leads")}</Badge>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-fg/80">{p.description || t("No description yet.")}</p>
                <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/5 pt-3 text-center">
                  {([[m.discovered, t("Leads")], [m.qualified, t("Qualified")], [m.contacted, t("Contacted")], [m.positive, t("Positive")]] as const).map(([v, lbl]) => (
                    <div key={lbl}><div className="tabular text-base font-semibold">{v}</div><div className="text-[10px] text-muted">{lbl}</div></div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2 text-xs">
                  <Badge tone={understanding ? "engage" : "neutral"}>{understanding ? t("Product understood") : t("Understanding pending")}</Badge>
                  <Badge tone={icp ? "engage" : "neutral"}>{icp ? `ICP · ${icp.source.replace("_", " ")}` : t("ICP pending")}</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
