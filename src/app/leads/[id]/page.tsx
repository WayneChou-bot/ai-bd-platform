import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { StatusBadge } from "@/components/leads/status-badge";
import { ScoreRing } from "@/components/leads/score-ring";
import { repo } from "@/lib/data";
import { WEIGHTS } from "@/core/scoring";
import { ignoreLeadAction, qualifyLeadAction, researchLeadAction } from "@/app/discover/actions";
import { ErrorAlert } from "@/components/ui/alert";
import { RefreshCw, Search, XCircle } from "lucide-react";
import { MessagesTab } from "@/components/leads/messages-tab";
import { getConfig } from "@/lib/config";
import { generateDraftAction } from "./actions";
import { getT } from "@/lib/i18n.server";

const TABS = ["overview", "research", "evidence", "messages", "activity"] as const;

export default async function LeadDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; error?: string; edit?: string }> }) {
  const { id } = await params;
  const { tab = "overview", error, edit } = await searchParams;
  const r = await repo();
  const { locale, t } = await getT();
  const lead = await r.lead(id);
  if (!lead) notFound();
  const [q, evidence, drafts, receipts, events, classifications, outcomes, audit] = await Promise.all([
    r.qualification(id), r.evidenceFor(id), r.draftsFor(id), r.receipts(), r.inboundEvents(), r.replyClassifications(), r.outcomes(), r.auditEvents(id),
  ]);
  const myReceipts = receipts.filter((x) => x.lead_id === id);
  const myEvents = events.filter((x) => x.lead_id === id);
  const myCls = classifications.filter((x) => x.lead_id === id);
  const myOutcomes = outcomes.filter((x) => x.lead_id === id);

  const title = lead.entity_type === "individual" ? lead.display_name ?? lead.company_name : lead.company_name;
  const returnTo = `/leads/${id}`;
  const canResearch = ["DISCOVERED", "RESEARCHED", "QUALIFIED", "REJECTED"].includes(lead.status);
  const canQualify = evidence.length > 0 && ["RESEARCHED", "QUALIFIED", "REJECTED"].includes(lead.status);
  const canIgnore = !["REJECTED", "CONTACTED", "REPLIED", "OUTCOME_RECORDED"].includes(lead.status);

  return (
    <>
      <PageHeader
        title={title}
        subtitle={[lead.entity_type === "individual" ? lead.headline : lead.industry, lead.size_estimate, lead.location, lead.website].filter(Boolean).join(" · ")}
        right={<div className="flex items-center gap-2"><StatusBadge s={lead.status} t={t} outcome={myOutcomes.at(-1)?.outcome} />{lead.entity_type === "individual" && <Badge tone="research">{t("individual")}</Badge>}</div>}
      />

      <ErrorAlert message={error} />
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-white/10">
        {TABS.map((tab_) => (
          <Link key={tab_} href={`/leads/${id}?tab=${tab_}`} className={`px-3 py-2 text-sm capitalize ${tab === tab_ ? "border-b-2 border-accent text-fg" : "text-muted hover:text-fg"}`}>{t(tab_)}</Link>
        ))}
        <div className="ml-auto flex flex-wrap gap-1.5 pb-1">
          {canResearch && <form action={researchLeadAction.bind(null, id, returnTo)}><SubmitButton className="px-2.5 py-1 text-xs"><RefreshCw size={12} /> {evidence.length ? t("Re-research") : t("Research")}</SubmitButton></form>}
          {canQualify && <form action={qualifyLeadAction.bind(null, id, returnTo)}><SubmitButton className="px-2.5 py-1 text-xs"><Search size={12} /> {t("Re-qualify")}</SubmitButton></form>}
          {canIgnore && <form action={ignoreLeadAction.bind(null, id, returnTo)}><Button type="submit" variant="ghost" className="px-2.5 py-1 text-xs"><XCircle size={12} /> {t("Ignore")}</Button></form>}
        </div>
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>{t("Fit Score")}</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-center">
              {q && !q.withheld ? (
                <>
                  <ScoreRing value={q.total_score} label={t(q.classification.replace("_", " "))} />
                  <ul className="mt-4 w-full space-y-1.5 text-sm">
                    {(Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).map((k) => (
                      <li key={k} className="flex items-center gap-2">
                        <span className="w-36 capitalize text-muted">{t(k.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "))}</span>
                        <span className="h-1.5 flex-1 rounded-full bg-white/5"><span className="block h-full rounded-full bg-qualify" style={{ width: `${q.breakdown[k]}%` }} /></span>
                        <span className="tabular w-8 text-right">{q.breakdown[k]}</span>
                        <span className="tabular w-10 text-right text-xs text-muted">×{WEIGHTS[k]}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : q ? (
                <div className="flex items-center gap-2 py-6 text-learn"><AlertTriangle size={18} /> {t("Insufficient evidence — score withheld")}</div>
              ) : (
                <div className="py-6 text-center text-sm text-muted">{evidence.length ? t("Not qualified yet.") : t("Not researched yet.")}</div>
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>{t("Why this lead?")}</CardTitle></CardHeader>
            <CardContent>
              {q ? <p className="mb-3 text-sm text-fg/90">{q.rationale}</p> : <p className="mb-3 text-sm text-muted">{lead.discovery_reason}</p>}
              <ul className="space-y-1.5 text-sm">
                {q?.why.map((w) => {
                  const e = evidence.find((x) => x.id === w.evidence_id);
                  return (
                    <li key={w.evidence_id} className="group -mx-2 rounded-lg px-2 py-1 transition-colors hover:bg-engage/[0.06]">
                      <div className="flex items-start gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-engage" /><span>{w.text} <Link href={`/leads/${id}?tab=evidence#${w.evidence_id}`} className="text-xs text-muted hover:text-accent">[{w.evidence_id}]</Link></span></div>
                      {e && (
                        <div className="ml-6 mt-1 hidden flex-wrap items-center gap-2 text-xs text-muted group-hover:flex">
                          <Badge>{e.type}</Badge><Badge tone="research">{e.category}</Badge>
                          <span>{t("supports")} {t(e.supports.replace("_", " "))}</span><span>· {t("confidence")} {e.confidence}</span><span>· {t("observed")} {e.observed_at.slice(0, 10)}</span>
                          <a href={e.source_url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-accent">{t("source")}</a>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {q && q.risks.length > 0 && (
                <>
                  <div className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("RISKS")}</div>
                  <ul className="space-y-1.5 text-sm">
                    {q.risks.map((rk) => <li key={rk} className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-learn" />{rk}</li>)}
                  </ul>
                </>
              )}
              <div className="mt-5 flex gap-2">
                <Link href={`/leads/${id}?tab=evidence`}><Button>{t("View Evidence")}</Button></Link>
                {["QUALIFIED", "REVIEW"].includes(lead.status) ? (
                  <form action={generateDraftAction.bind(null, id)}><input type="hidden" name="tone" value="professional" /><SubmitButton variant="primary">{t("Generate Outreach")}</SubmitButton></form>
                ) : (
                  <Link href={`/leads/${id}?tab=messages`}><Button variant="primary">{t("Open Messages")}</Button></Link>
                )}
                {canIgnore && <form action={ignoreLeadAction.bind(null, id, returnTo)}><Button type="submit" variant="danger">{t("Reject")}</Button></form>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "research" && (
        <Card>
          <CardHeader><CardTitle>{t("Research synthesis")}</CardTitle></CardHeader>
          <CardContent className="text-sm leading-relaxed text-fg/90">
            <p>{lead.discovery_reason}. {evidence.filter((e) => e.polarity === "positive").map((e) => e.claim).join(". ")}.</p>
            {evidence.some((e) => e.polarity === "negative") && <p className="mt-3 text-learn">{t("Contradicting signals")}: {evidence.filter((e) => e.polarity === "negative").map((e) => e.claim).join("; ")}.</p>}
            <p className="mt-3 text-xs text-muted">{t("Narrative is assembled from structured evidence only — see the Evidence tab for sources.")}</p>
          </CardContent>
        </Card>
      )}

      {tab === "evidence" && (
        <Card>
          <CardHeader><CardTitle>{t("Evidence")} ({evidence.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-white/5">
              {evidence.map((e) => (
                <li key={e.id} id={e.id} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 text-sm transition-colors target:bg-accent/10 hover:bg-white/[0.03]">
                  <span className="tabular mt-0.5 w-14 shrink-0 text-xs text-muted">{e.id}</span>
                  <div className="flex-1">
                    <div className={e.polarity === "negative" ? "text-learn" : ""}>{e.claim}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Badge>{e.type}</Badge><Badge tone={e.polarity === "negative" ? "danger" : "research"}>{e.category}</Badge>
                      <span>{t("supports")} {t(e.supports.replace("_", " "))}</span>
                      <span>· {t("confidence")} {e.confidence}</span>
                      <span>· {t("observed")} {e.observed_at.slice(0, 10)}</span>
                      <a href={e.source_url} className="inline-flex items-center gap-1 hover:text-accent" target="_blank" rel="noreferrer">{t("source")} <ExternalLink size={11} /></a>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {tab === "messages" && (
        <MessagesTab lead={lead} mode={getConfig().mode} mailProvider={getConfig().mailProvider} locale={locale} drafts={drafts} evidence={evidence} receipts={myReceipts} events={myEvents} classifications={myCls} outcomes={myOutcomes} editing={edit} />
      )}

      {tab === "activity" && (
        <Card>
          <CardHeader><CardTitle>{t("Audit trail")}</CardTitle></CardHeader>
          <CardContent>
            <ol className="relative ml-2 border-l border-white/10 pl-5">
              {audit.map((a) => (
                <li key={a.id} className="relative pb-4 text-sm">
                  <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border border-white/20 bg-bg-elev" />
                  <div className="flex items-center gap-2"><span className="font-medium">{a.action}</span><Badge>{a.actor}</Badge><span className="text-xs text-muted">{a.created_at.slice(0, 16).replace("T", " ")}</span></div>
                  {a.detail && <div className="text-xs text-muted">{a.detail}</div>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </>
  );
}
