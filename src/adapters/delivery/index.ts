/**
 * DeliveryAdapter (Spec v0.2 S3).
 * Approve & Send is one user action; the adapter decides what "send" means.
 */
import type { DeliveryReceipt, Lead, OutreachDraft } from "@/core/schemas";
import type { AppConfig } from "@/lib/config";

export interface Recipient {
  address: string;
  name?: string;
}

export interface DeliveryAdapter {
  readonly provider: DeliveryReceipt["provider"];
  send(draft: OutreachDraft, lead: Lead, to: Recipient, ctx: { now: () => Date; newId: (p: string) => string }): Promise<DeliveryReceipt>;
}

/** Plain-text footer required by §46 / S3.2. */
export function outreachFooter(sender: string): string {
  return [
    "",
    "--",
    `Sent by ${sender}. This message was drafted with AI assistance and reviewed and approved by a human before sending.`,
    "If you'd prefer not to hear from us again, reply with \"unsubscribe\" and we will not contact you further.",
  ].join("\n");
}

export function threadKeyFor(lead: Lead, draft: OutreachDraft): string {
  return `thr_${lead.id}_${draft.id}`;
}

export class MockDeliveryAdapter implements DeliveryAdapter {
  readonly provider = "mock" as const;
  async send(draft: OutreachDraft, lead: Lead, _to: Recipient, ctx: { now: () => Date; newId: (p: string) => string }): Promise<DeliveryReceipt> {
    const thread_key = threadKeyFor(lead, draft);
    return {
      id: ctx.newId("rcpt"),
      draft_id: draft.id,
      lead_id: lead.id,
      provider: "mock",
      message_id: `mock-${draft.id}`,
      provider_thread_id: null,
      thread_key,
      simulated: true,
      sent_at: ctx.now().toISOString(),
      error: null,
    };
  }
}

export class ResendDeliveryAdapter implements DeliveryAdapter {
  readonly provider = "resend" as const;
  constructor(private readonly cfg: AppConfig) {}

  async send(draft: OutreachDraft, lead: Lead, to: Recipient, ctx: { now: () => Date; newId: (p: string) => string }): Promise<DeliveryReceipt> {
    const thread_key = threadKeyFor(lead, draft);
    const recipient = this.cfg.demoRecipientOverride ?? to.address;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: this.cfg.senderAddress,
        to: recipient.split(",").map((e) => e.trim()).filter(Boolean),
        subject: draft.subject,
        text: draft.body + outreachFooter(this.cfg.senderAddress),
        headers: { "X-BD-Thread-Key": thread_key },
        tags: [{ name: "thread_key", value: thread_key }],
      }),
    });
    const base = {
      id: ctx.newId("rcpt"),
      draft_id: draft.id,
      lead_id: lead.id,
      provider: "resend" as const,
      thread_key,
      simulated: false,
      sent_at: ctx.now().toISOString(),
    };
    if (!res.ok) {
      return { ...base, message_id: "", provider_thread_id: null, error: `Resend ${res.status}: ${await res.text()}` };
    }
    const json = (await res.json()) as { id: string };
    return { ...base, message_id: json.id, provider_thread_id: null, error: null };
  }
}

export async function createDeliveryAdapter(cfg: AppConfig): Promise<DeliveryAdapter> {
  if (cfg.mode === "demo") return new MockDeliveryAdapter();
  if (cfg.mailProvider === "gmail") {
    if (!cfg.gmail) throw new Error("MAIL_PROVIDER=gmail but GMAIL_* variables are missing");
    const { RefreshTokenProvider } = await import("@/adapters/gmail/auth");
    const { GmailDeliveryAdapter } = await import("@/adapters/gmail/delivery");
    return new GmailDeliveryAdapter(new RefreshTokenProvider(cfg.gmail.user, cfg.gmail.clientId, cfg.gmail.clientSecret, cfg.gmail.refreshToken), { replyTo: cfg.gmail.replyTo, fromName: cfg.gmail.fromName });
  }
  return new ResendDeliveryAdapter(cfg);
}
