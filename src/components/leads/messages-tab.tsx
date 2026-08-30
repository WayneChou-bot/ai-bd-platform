import { CheckCircle2, MailPlus, Pencil, RefreshCw, Send, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type Tone as BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { DeliveryReceipt, Evidence, InboundEvent, Lead, Outcome, OutreachDraft, ReplyClassification } from "@/core/schemas";
import { OutcomeKind } from "@/core/schemas";
import { tr, type Locale } from "@/lib/i18n";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { CheckInboxButton } from "./check-inbox";
import {
  approveAndSendAction, editDraftAction, generateDraftAction, recordOutcomeAction, regenerateDraftAction, rejectDraftAction, setContactEmailAction, simulateReplyAction,
} from "@/app/leads/[id]/actions";

const draftTone: Record<OutreachDraft["status"], BadgeTone> = { DRAFT: "learn", APPROVED: "engage", SENT: "engage", REJECTED: "danger", FAILED: "danger", SUPERSEDED: "neutral" };
const fmt = (iso: string) => iso.slice(0, 16).replace("T", " ");

export function MessagesTab({ lead, mode, mailProvider, drafts, evidence, receipts, events, classifications, outcomes, editing, locale = "en" }: {
  lead: Lead; mode: "demo" | "live"; mailProvider?: "gmail" | "resend"; locale?: Locale; drafts: OutreachDraft[]; evidence: Evidence[]; receipts: DeliveryReceipt[];
  events: InboundEvent[]; classifications: ReplyClassification[]; outcomes: Outcome[]; editing?: string;
}) {
  const t = tr(locale);
  const evById = new Map(evidence.map((e) => [e.id, e]));
  const sorted = [...drafts].sort((a, b) => b.version - a.version);
  const current = sorted.find((d) => d.status === "DRAFT");
  const canGenerate = ["QUALIFIED", "REVIEW"].includes(lead.status) || (lead.status === "DRAFTED" && !current);
  const canReply = ["CONTACTED", "REPLIED"].includes(lead.status);
  const canOutcome = ["CONTACTED", "REPLIED", "OUTCOME_RECORDED"].includes(lead.status);
  const timeline = [
    ...sorted.map((d) => ({ at: d.created_at, kind: "draft" as const, d })),
    ...events.map((e) => ({ at: e.received_at, kind: "inbound" as const, e })),
    ...outcomes.map((o) => ({ at: o.recorded_at, kind: "outcome" as const, o })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="space-y-4">
      <AutoRefresh enabled={mode === "live" && ["CONTACTED", "REPLIED"].includes(lead.status) && !editing} poke={mailProvider === "gmail" ? "/api/inbound/poll" : undefined} />
      {/* Generate */}
      {canGenerate && (
        <Card>
          <CardHeader><CardTitle>{t("Generate outreach")}</CardTitle><span className="text-xs text-muted">{t("Grounded on")} {evidence.filter((e) => e.polarity === "positive").length} {t("positive evidence items")}</span></CardHeader>
          <CardContent>
            <form action={generateDraftAction.bind(null, lead.id)} className="flex flex-wrap items-end gap-3">
              <div className="w-48"><Field label={t("Tone")}><Select name="tone" defaultValue="professional"><option value="professional">{t("Professional")}</option><option value="friendly">{t("Friendly")}</option><option value="concise">{t("Concise")}</option></Select></Field></div>
              <SubmitButton variant="primary"><MailPlus size={14} /> {t("Generate draft")}</SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}

      {mode === "live" && ["QUALIFIED", "REVIEW", "DRAFTED"].includes(lead.status) && (
        <Card>
          <CardContent className="pt-4">
            <form action={setContactEmailAction.bind(null, lead.id)} className="flex flex-wrap items-end gap-3">
              <div className="flex-1"><Field label={t("Recipient (public business address)")} hint={`${t("comma-separate for multiple recipients")} · ${t("DEMO_RECIPIENT_OVERRIDE wins when set")}`}><Input name="contact_email" type="text" defaultValue={lead.contact_email ?? ""} placeholder="hello@company.com, sales@company.com" /></Field></div>
              <Button type="submit">{t("Save")}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {timeline.length === 0 && <Card><CardContent className="py-8 text-center text-sm text-muted">{canGenerate ? t("No drafts yet — generate one above.") : t("Nothing here yet.")}</CardContent></Card>}

      {timeline.map((item) => {
        if (item.kind === "draft") {
          const d = item.d;
          const isEditing = editing === d.id && d.status === "DRAFT";
          const receipt = receipts.find((r) => r.draft_id === d.id);
          return (
            <Card key={d.id} className={d.status === "DRAFT" ? "border-learn/40" : d.status === "SUPERSEDED" || d.status === "REJECTED" ? "opacity-60" : ""}>
              <CardHeader>
                <CardTitle>{d.subject}</CardTitle>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><Badge tone={draftTone[d.status]}>{t(d.status)}</Badge> v{d.version} · {t(d.tone[0].toUpperCase() + d.tone.slice(1))} · {t("confidence")} {d.confidence} · {fmt(d.created_at)}{d.human_edited && <Badge tone="learn" title={t("Evidence grounding is not revalidated after manual edits")}>{t("human edited")}</Badge>}</div>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <form action={editDraftAction.bind(null, lead.id, d.id)} className="space-y-3">
                    <Field label={t("Subject")}><Input name="subject" defaultValue={d.subject} required /></Field>
                    <Field label={t("Body")} hint={t("claims must stay within the cited evidence")}><Textarea name="body" rows={12} defaultValue={d.body} required /></Field>
                    <div className="flex gap-2"><Button type="submit" variant="primary">{t("Save as v")}{d.version + 1}</Button><a href={`/leads/${lead.id}?tab=messages`}><Button type="button" variant="ghost">{t("Cancel")}</Button></a></div>
                  </form>
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-fg/90">{d.body}</pre>
                )}
                <div className="mt-3 text-xs text-muted">{t("Evidence used")}: {d.evidence_used.map((eid) => <span key={eid} className="mr-2 cursor-help underline decoration-dotted" title={evById.get(eid)?.claim ?? "unknown"}>[{eid}]</span>)}</div>
                {receipt && (
                  <div className="mt-2 text-xs text-muted">{t("Delivered via")} <Badge tone={receipt.simulated ? "learn" : "engage"}>{receipt.simulated ? t("simulated") : receipt.provider}</Badge> {fmt(receipt.sent_at)} · {t("thread")} {receipt.thread_key}{receipt.error && <span className="text-danger"> · {receipt.error}</span>}</div>
                )}
                {d.status === "DRAFT" && !isEditing && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <form action={rejectDraftAction.bind(null, lead.id, d.id)}><Button type="submit" variant="danger"><XCircle size={14} /> {t("Reject")}</Button></form>
                    <a href={`/leads/${lead.id}?tab=messages&edit=${d.id}`}><Button type="button"><Pencil size={14} /> {t("Edit")}</Button></a>
                    <form action={regenerateDraftAction.bind(null, lead.id)} className="flex items-center gap-1">
                      <input type="hidden" name="tone" value={d.tone} />
                      <SubmitButton><RefreshCw size={14} /> {t("Regenerate")}</SubmitButton>
                    </form>
                    <form action={approveAndSendAction.bind(null, lead.id, d.id)}><SubmitButton variant="success"><Send size={14} /> {t("Approve & Send")}</SubmitButton></form>
                    {mode === "demo" && <span className="text-xs text-muted">{t("Simulated delivery in DEMO mode")}</span>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        }
        if (item.kind === "inbound") {
          const e = item.e;
          const c = classifications.find((x) => x.event_id === e.id);
          return (
            <Card key={e.id} className="border-reply/30">
              <CardHeader><CardTitle>↩ {e.subject}</CardTitle><span className="text-xs text-muted">{fmt(e.received_at)} · {e.source} · {e.from_address}</span></CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap font-sans text-sm text-fg/90">{e.body_text}</pre>
                {c ? (
                  <div className="mt-3 rounded-lg bg-reply/10 p-3 text-xs">
                    <div className="flex items-center gap-2"><Badge tone="reply">{t("Reply Agent")}</Badge><span className="font-medium">{t(c.outcome)}</span><span className="text-muted">{t("confidence")} {c.confidence}</span>{c.needs_human && <Badge tone="learn">{t("needs human")}</Badge>}</div>
                    <div className="mt-1 text-muted">{c.rationale} — “{c.quoted_signal}”</div>
                  </div>
                ) : <div className="mt-2 text-xs text-muted">{t("Awaiting classification…")}</div>}
              </CardContent>
            </Card>
          );
        }
        const o = item.o;
        return (
          <div key={o.id} className="flex items-center gap-2 px-1 text-sm text-muted"><CheckCircle2 size={14} className="text-learn" /> {t("Outcome recorded")}: <Badge tone="learn">{t(o.outcome)}</Badge> {t("by")} {o.recorded_by} · {fmt(o.recorded_at)}{o.notes && <span className="text-xs">· {o.notes}</span>}</div>
        );
      })}

      {(canReply || canOutcome) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {canReply && (
            <Card>
              <CardHeader><CardTitle>{mode === "demo" ? t("Simulate a reply") : t("Inject a reply (testing)")}</CardTitle><span className="flex items-center gap-2 text-xs text-muted">{mode === "live" && mailProvider === "gmail" && <CheckInboxButton label={t("Check inbox now")} />}{t("runs the real Reply Agent")}</span></CardHeader>
              <CardContent>
                <form action={simulateReplyAction.bind(null, lead.id)} className="space-y-3">
                  <Field label={t("Subject")}><Input name="subject" defaultValue={`Re: ${sorted[0]?.subject ?? ""}`} /></Field>
                  <Field label={t("Body")} hint={t("treated as untrusted data")}><Textarea name="body" rows={4} placeholder="Thanks — could we set up a 20-minute call next week?" required /></Field>
                  <SubmitButton variant="primary">{t("Receive reply")}</SubmitButton>
                </form>
              </CardContent>
            </Card>
          )}
          {canOutcome && (
            <Card>
              <CardHeader><CardTitle>{t("Record outcome")}</CardTitle><span className="text-xs text-muted">{t("manual · overrides are additional rows")}</span></CardHeader>
              <CardContent>
                <form action={recordOutcomeAction.bind(null, lead.id)} className="space-y-3">
                  <Field label={t("Outcome")}><Select name="outcome" defaultValue="no_response">{OutcomeKind.options.map((o) => <option key={o} value={o}>{t(o)}</option>)}</Select></Field>
                  <Field label={t("Notes")}><Input name="notes" placeholder={t("optional")} /></Field>
                  <Button type="submit">{t("Record")}</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
