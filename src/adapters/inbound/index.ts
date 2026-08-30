/**
 * Inbound event sources (Spec v0.2 S4).
 *
 * Any channel that can produce an InboundEvent feeds the same Reply Agent.
 * The webhook route only verifies, persists, enqueues and returns 200.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { InboundEvent } from "@/core/schemas";

export interface InboundParseResult {
  ok: true;
  event: InboundEvent;
}
export interface InboundParseError {
  ok: false;
  status: 400 | 401;
  reason: string;
}

export interface InboundSource {
  readonly source: InboundEvent["source"];
  /** Turn a raw provider payload into a validated InboundEvent. */
  parse(input: { rawBody: string; headers: Record<string, string | undefined> }, ctx: { now: () => Date; newId: (p: string) => string }): InboundParseResult | InboundParseError;
}

/** Simulated source used by DEMO mode and by tests. */
export class SimulatedInboundSource implements InboundSource {
  readonly source = "simulated" as const;
  parse(input: { rawBody: string }, ctx: { now: () => Date; newId: (p: string) => string }): InboundParseResult | InboundParseError {
    try {
      const body = JSON.parse(input.rawBody) as Partial<InboundEvent>;
      const event = InboundEvent.parse({
        id: ctx.newId("inb"),
        source: "simulated",
        channel: "email",
        thread_key: body.thread_key ?? null,
        lead_id: body.lead_id ?? null,
        from_address: body.from_address ?? "prospect@example.com",
        subject: body.subject ?? "",
        body_text: body.body_text ?? "",
        received_at: ctx.now().toISOString(),
        raw_ref: "simulated",
        processed_at: null,
      });
      return { ok: true, event };
    } catch (e) {
      return { ok: false, status: 400, reason: (e as Error).message };
    }
  }
}

/**
 * Resend Inbound webhook (Svix-style signature).
 * Headers: svix-id, svix-timestamp, svix-signature ("v1,<base64>").
 */
export class ResendInboundSource implements InboundSource {
  readonly source = "resend" as const;
  constructor(private readonly webhookSecret: string) {}

  private verify(rawBody: string, headers: Record<string, string | undefined>): boolean {
    const id = headers["svix-id"];
    const ts = headers["svix-timestamp"];
    const sig = headers["svix-signature"];
    if (!id || !ts || !sig) return false;
    const secret = this.webhookSecret.replace(/^whsec_/, "");
    const key = Buffer.from(secret, "base64");
    const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest("base64");
    return sig.split(" ").some((part) => {
      const [, value] = part.split(",");
      if (!value) return false;
      const a = Buffer.from(value);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
  }

  parse(input: { rawBody: string; headers: Record<string, string | undefined> }, ctx: { now: () => Date; newId: (p: string) => string }): InboundParseResult | InboundParseError {
    if (!this.verify(input.rawBody, input.headers)) {
      return { ok: false, status: 401, reason: "invalid signature" };
    }
    try {
      const payload = JSON.parse(input.rawBody) as {
        type?: string;
        data?: { email_id?: string; from?: string; subject?: string; text?: string; headers?: Record<string, string> };
      };
      const d = payload.data ?? {};
      const thread_key = d.headers?.["X-BD-Thread-Key"] ?? d.headers?.["x-bd-thread-key"] ?? null;
      const event = InboundEvent.parse({
        id: ctx.newId("inb"),
        source: "resend",
        channel: "email",
        thread_key,
        lead_id: null, // resolved by the repository from thread_key
        from_address: d.from ?? "",
        subject: d.subject ?? "",
        body_text: d.text ?? "",
        received_at: ctx.now().toISOString(),
        raw_ref: d.email_id ?? "",
        processed_at: null,
      });
      return { ok: true, event };
    } catch (e) {
      return { ok: false, status: 400, reason: (e as Error).message };
    }
  }
}
