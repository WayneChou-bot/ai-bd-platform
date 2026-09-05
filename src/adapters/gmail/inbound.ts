/**
 * GmailPollingSource (v0.2 S4, polling variant for a single/shared mailbox).
 *
 * Every N seconds: list recent inbox messages not from us, skip ones we have
 * already stored (raw_ref = Gmail message id), match to a lead by Gmail
 * threadId (from the delivery receipt) or by the X-BD-Thread-Key header on
 * the message we sent, then hand an InboundEvent to handleInbound().
 *
 * Upgrade path without changing callers: replace this with a push source
 * (users.watch + Pub/Sub) that produces the same InboundEvent.
 */
import type { InboundEvent } from "@/core/schemas";
import { gmailFetch, type TokenProvider } from "./auth";
import { addressOnly, bodyText, header, type GmailMessage } from "./mime";
import type { Repository } from "@/lib/repository";

export interface PollResult { checked: number; imported: number; unmatched: number; errors: string[] }

export class GmailPollingSource {
  readonly source = "gmail" as const;
  constructor(private readonly tp: TokenProvider, private readonly newerThan = "7d") {}

  /**
   * ids + threadIds only — no message content. Matching happens BEFORE any
   * body is fetched (§45). Self-sent mail is NOT excluded here: when
   * DEMO_RECIPIENT_OVERRIDE is your own mailbox, replies also come "from you";
   * the poller instead skips the exact message ids we sent (receipts).
   *
   * Pagination + watermark (review v6 F13): every page is followed via
   * nextPageToken — the 26th reply in a busy inbox used to be invisible
   * forever. With a watermark (epoch seconds of the newest already-imported
   * message, minus an overlap the caller chooses) the query becomes
   * `after:<ts>`, which also covers ARCHIVED mail — a reply the user filed
   * away is still a reply; the first ever poll falls back to newer_than.
   * Re-listing already-imported ids is harmless: the poller dedupes by
   * raw_ref.
   */
  async listCandidates(afterEpochSeconds?: number): Promise<Array<{ id: string; threadId: string }>> {
    const q = encodeURIComponent(afterEpochSeconds ? `after:${afterEpochSeconds}` : `newer_than:${this.newerThan}`);
    const out: Array<{ id: string; threadId: string }> = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page++) { // safety cap: 10 × 100 messages per poll
      const r = await gmailFetch<{ messages?: Array<{ id: string; threadId: string }>; nextPageToken?: string }>(
        this.tp, `messages?q=${q}&maxResults=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      out.push(...(r.messages ?? []));
      pageToken = r.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  }

  async fetchMessage(id: string): Promise<GmailMessage> {
    return gmailFetch<GmailMessage>(this.tp, `messages/${id}?format=full`);
  }

  /** Build an InboundEvent (lead resolved by repo) from a Gmail message. */
  async toEvent(repo: Repository, m: GmailMessage, ctx: { now: () => Date; newId: (p: string) => string }): Promise<InboundEvent> {
    // 1) match by Gmail threadId on a receipt we stored
    const receipts = await repo.receipts();
    const byThread = receipts.find((r) => r.provider === "gmail" && r.provider_thread_id === m.threadId);
    // 2) or by our header echoed back in References/In-Reply-To chains (some clients keep custom headers on reply)
    const hdrKey = header(m, "X-BD-Thread-Key") || undefined;
    const thread_key = byThread?.thread_key ?? hdrKey ?? null;
    const lead = thread_key ? await repo.leadByThreadKey(thread_key) : undefined;
    const receivedAt = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : ctx.now().toISOString();
    return {
      id: ctx.newId("inb"), source: "gmail", channel: "email", thread_key,
      lead_id: lead?.id ?? null, from_address: addressOnly(header(m, "From")), subject: header(m, "Subject"),
      body_text: bodyText(m), received_at: receivedAt, raw_ref: m.id, processed_at: null,
    };
  }
}
