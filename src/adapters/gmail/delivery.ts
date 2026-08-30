/**
 * GmailDeliveryAdapter (v0.2 S3): sends from the authorised mailbox.
 * The thread key rides in a custom header AND the Gmail threadId is stored
 * on the receipt, so replies can be matched either way.
 */
import type { DeliveryReceipt, Lead, OutreachDraft } from "@/core/schemas";
import { outreachFooter, threadKeyFor, type DeliveryAdapter, type Recipient } from "@/adapters/delivery";
import { gmailFetch, type TokenProvider } from "./auth";
import { base64url, buildMessage } from "./mime";

export class GmailDeliveryAdapter implements DeliveryAdapter {
  readonly provider = "gmail" as const;
  constructor(private readonly tp: TokenProvider, private readonly opts: { replyTo?: string; fromName?: string } = {}) {}

  async send(draft: OutreachDraft, lead: Lead, to: Recipient, ctx: { now: () => Date; newId: (p: string) => string }): Promise<DeliveryReceipt> {
    const thread_key = threadKeyFor(lead, draft);
    const from = this.opts.fromName ? `${this.opts.fromName} <${this.tp.mailbox}>` : this.tp.mailbox;
    const raw = buildMessage({
      from, to: to.address, subject: draft.subject, replyTo: this.opts.replyTo,
      text: draft.body + outreachFooter(this.tp.mailbox),
      headers: { "X-BD-Thread-Key": thread_key, "X-BD-Lead": lead.id },
    });
    const base = { id: ctx.newId("rcpt"), draft_id: draft.id, lead_id: lead.id, provider: "gmail" as const, thread_key, simulated: false, sent_at: ctx.now().toISOString() };
    try {
      const r = await gmailFetch<{ id: string; threadId: string }>(this.tp, "messages/send", { method: "POST", body: JSON.stringify({ raw: base64url(raw) }) });
      return { ...base, message_id: r.id, provider_thread_id: r.threadId, error: null };
    } catch (e) {
      return { ...base, message_id: "", provider_thread_id: null, error: (e as Error).message.slice(0, 500) };
    }
  }
}
