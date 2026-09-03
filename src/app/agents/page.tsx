import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { repo } from "@/lib/data";
import { getConfig } from "@/lib/config";
import { orchestratorStatus } from "@/lib/orchestrator-status";
import { Orchestrator } from "@/components/agents/orchestrator";
import { getT } from "@/lib/i18n.server";

const runTone: Record<string, Tone> = { COMPLETED: "engage", RUNNING: "qualify", QUEUED: "learn", FAILED: "danger", RETRYING: "learn" };

export default async function Agents({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const r = await repo();
  const { locale, t } = await getT();
  const [runs, leads, status] = await Promise.all([r.agentRuns(), r.leads(), orchestratorStatus(r, project)]);
  const name = new Map(leads.map((l) => [l.id, l.company_name]));
  const recent = [...runs].filter((x) => !project || x.project_id === project).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);
  /** Stored run summaries are English data strings — translate the known shapes at render time. */
  const outLabel = (s?: string | null) => {
    if (!s) return s;
    if (s === "score withheld") return t("score withheld");
    let m = s.match(/^(\d+) evidence records?$/); if (m) return `${m[1]} ${t("evidence records")}`;
    m = s.match(/^(\d+) (HIGH_FIT|MEDIUM_FIT|LOW_FIT|REJECT)$/); if (m) return `${m[1]} ${t(m[2].replace("_", " "))}`;
    m = s.match(/^(\d+) new candidates$/); if (m) return `${m[1]} ${t("new candidates — existing leads excluded")}`;
    m = s.match(/^(\d+) signals \((\d+) existing, (\d+) below threshold\)$/); if (m) return `${m[1]} ${t("signals")}（${m[2]} ${t("existing")}、${m[3]} ${t("below threshold")}）`;
    return s;
  };
  return (
    <>
      <PageHeader title={t("Agents")} subtitle={t("Every run is a row: explicit state, latency, tokens, retries, errors. No chain-of-thought stored.")} />
      <Orchestrator initial={status} projectId={project} canStartDemo={getConfig().mode === "demo"} locale={locale} />
      <Card className="mt-5">
        <Table>
          <THead><TR><TH>{t("Time")}</TH><TH>{t("Agent")}</TH><TH>{t("Lead")}</TH><TH>{t("Status")}</TH><TH>{t("Latency")}</TH><TH>{t("Tokens")}</TH><TH>{t("Retries")}</TH><TH>{t("Output / Error")}</TH></TR></THead>
          <TBody>
            {recent.map((x) => (
              <TR key={x.id}>
                {/* The raw run id read as noise (field test) — time is the useful
                    coordinate; the id survives as a tooltip for audit cross-reference. */}
                <TD className="tabular whitespace-nowrap text-xs text-muted" title={x.id}>
                  <div className="text-fg/90">{(x.started_at ?? x.created_at).slice(11, 19)}</div>
                  <div className="text-[10px]">{(x.started_at ?? x.created_at).slice(5, 10)}</div>
                </TD>
                <TD className="capitalize">{t(x.agent === "icp_suggest" ? "ICP Suggest" : x.agent.replace("_", " "))}</TD>
                <TD>{x.lead_id ? <Link href={`/leads/${x.lead_id}`} className="hover:text-accent">{name.get(x.lead_id)}</Link> : "—"}</TD>
                <TD><Badge tone={runTone[x.status]}>{t(x.status)}</Badge></TD>
                <TD className="tabular">{x.latency_ms != null ? `${x.latency_ms} ms` : "—"}</TD>
                <TD className="tabular text-xs text-muted">{x.token_usage ? `${x.token_usage.input} / ${x.token_usage.output}` : "—"}</TD>
                <TD className="tabular">{x.retry_count}</TD>
                <TD className={x.error ? "text-danger" : "text-muted"}>{x.error ?? outLabel(x.output_summary)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
