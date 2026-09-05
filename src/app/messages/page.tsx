import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/leads/status-badge";
import { repo } from "@/lib/data";
import { getT } from "@/lib/i18n.server";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { getConfig } from "@/lib/config";
import { CheckInboxButton } from "@/components/leads/check-inbox";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Select } from "@/components/ui/input";
import { assignInboundAction, dismissReviewAction } from "./actions";

export default async function Messages({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const r = await repo();
  const { t } = await getT();
  const { error } = await searchParams;
  const [leads, drafts, events, cls] = await Promise.all([r.leads(), r.drafts(), r.inboundEvents(), r.replyClassifications()]);
  const lead = new Map(leads.map((l) => [l.id, l]));
  const name = (id: string | null) => { const l = id ? lead.get(id) : undefined; return l ? (l.entity_type === "individual" ? l.display_name ?? l.company_name : l.company_name) : t("Unmatched inbound"); };
  const awaiting = drafts.filter((d) => d.status === "DRAFT").sort((a, b) => b.created_at.localeCompare(a.created_at));
  // The queue counts open TICKETS, not the model's confidence flags (review v6
  // F15): a handled reply leaves the queue; its original classification stays.
  const needsHuman = cls.filter((c) => c.needs_human && c.review_status === "pending");
  const handled = cls.filter((c) => c.needs_human && c.review_status !== "pending").length;
  const inboxIds = new Set(needsHuman.map((c) => c.event_id));
  const recentInbound = [...events].sort((a, b) => b.received_at.localeCompare(a.received_at)).slice(0, 15);
  const unmatched = events.filter((e) => !e.lead_id);
  // A reply can only belong to a lead we actually contacted.
  const assignable = leads.filter((l) => ["CONTACTED", "REPLIED", "OUTCOME_RECORDED"].includes(l.status));
  const fmt = (iso: string) => iso.slice(0, 16).replace("T", " ");

  return (
    <>
      <AutoRefresh enabled={getConfig().mode === "live"} poke={getConfig().mailProvider === "gmail" ? "/api/inbound/poll" : undefined} />
      <ErrorAlert message={error} />
      <PageHeader title={t("Messages")} subtitle={t("Human-in-the-loop queue: nothing leaves without approval.")} right={getConfig().mode === "live" && getConfig().mailProvider === "gmail" ? <CheckInboxButton label={t("Check inbox now")} /> : undefined} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("Drafts awaiting review")}</CardTitle><Badge tone={awaiting.length ? "learn" : "neutral"}>{awaiting.length}</Badge></CardHeader>
          <CardContent>
            {awaiting.length === 0 && <p className="py-4 text-sm text-muted">{t("Nothing waiting. Generate drafts from a qualified lead.")}</p>}
            <ul className="divide-y divide-white/5">
              {awaiting.map((d) => (
                <li key={d.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/leads/${d.lead_id}?tab=messages`} className="font-medium hover:text-accent">{name(d.lead_id)}</Link>
                    <span className="text-xs text-muted">v{d.version} · {d.tone} · {fmt(d.created_at)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">{d.subject}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("Replies needing a human")}</CardTitle><span className="flex items-center gap-2">{handled > 0 && <span className="text-xs text-muted">{handled} {t("handled")}</span>}<Badge tone={needsHuman.length ? "learn" : "neutral"}>{needsHuman.length + unmatched.length}</Badge></span></CardHeader>
          <CardContent>
            {needsHuman.length + unmatched.length === 0 && <p className="py-4 text-sm text-muted">{t("All inbound replies were classified with confidence.")}</p>}
            <ul className="divide-y divide-white/5">
              {needsHuman.map((c) => {
                const e = events.find((x) => x.id === c.event_id);
                return (
                  <li key={c.id} className="py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/leads/${c.lead_id}?tab=messages`} className="font-medium hover:text-accent">{name(c.lead_id)}</Link>
                      <span className="flex items-center gap-2 text-xs"><Badge tone="reply">{t(c.outcome)}</Badge><span className="text-muted">conf {c.confidence}</span></span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted">“{c.quoted_signal}” — {e?.subject}</div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs">
                      <Link href={`/leads/${c.lead_id}?tab=messages`} className="text-accent">{t("record the outcome")}</Link>
                      <form action={dismissReviewAction.bind(null, c.id)}><Button type="submit" variant="ghost" className="px-2 py-0.5 text-xs">{t("Dismiss")}</Button></form>
                    </div>
                  </li>
                );
              })}
              {unmatched.map((e) => (
                <li key={e.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between"><span className="font-medium">{t("Unmatched inbound")}</span><Badge tone="danger">{t("no lead")}</Badge></div>
                  <div className="text-xs text-muted">{e.from_address} · {e.subject} · {fmt(e.received_at)}</div>
                  {assignable.length > 0 && (
                    <form action={assignInboundAction.bind(null, e.id)} className="mt-1.5 flex items-center gap-2">
                      <Select name="lead_id" className="w-48 px-2 py-1 text-xs" defaultValue="">
                        <option value="" disabled>{t("Assign to a contacted lead…")}</option>
                        {assignable.map((l) => <option key={l.id} value={l.id}>{l.entity_type === "individual" ? l.display_name ?? l.company_name : l.company_name}</option>)}
                      </Select>
                      <SubmitButton className="px-2.5 py-1 text-xs">{t("Assign")}</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader><CardTitle>{t("Recent inbound")}</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-white/5 text-sm">
            {recentInbound.map((e) => {
              const c = cls.find((x) => x.event_id === e.id);
              const l = e.lead_id ? lead.get(e.lead_id) : undefined;
              return (
                <li key={e.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link href={`/leads/${e.lead_id}?tab=messages`} className="font-medium hover:text-accent">{name(e.lead_id)}</Link>
                    {c && <Badge tone={inboxIds.has(e.id) ? "learn" : "reply"}>{t(c.outcome)}</Badge>}
                    {l && <span className="hidden sm:inline"><StatusBadge s={l.status} t={t} /></span>}
                  </div>
                  <div className="flex min-w-0 shrink-0 items-center gap-2 text-xs text-muted">
                    <span className="truncate">{e.subject}</span><span>· {fmt(e.received_at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
