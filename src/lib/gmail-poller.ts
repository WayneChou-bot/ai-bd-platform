/**
 * In-process Gmail poller (LIVE + MAIL_PROVIDER=gmail). Started once from
 * instrumentation.ts; also callable on demand via POST /api/inbound/poll.
 * Single-instance by design (one shared mailbox). For multi-mailbox / scale,
 * swap to Gmail push (users.watch + Pub/Sub) producing the same InboundEvent.
 */
import { RefreshTokenProvider } from "@/adapters/gmail/auth";
import { GmailPollingSource, type PollResult } from "@/adapters/gmail/inbound";
import { newId } from "@/core/orchestrator/run";
import { getConfig } from "@/lib/config";
import { repo } from "@/lib/data";
import { handleInbound } from "@/lib/engagement";

const g = globalThis as unknown as { __bdPoller?: { timer: NodeJS.Timeout; last?: PollResult & { at: string }; running: boolean; skipped: Set<string> } };

export function pollerStatus() { return g.__bdPoller ? { active: true, last: g.__bdPoller.last ?? null } : { active: false, last: null }; }

export async function pollGmailOnce(): Promise<PollResult> {
  const cfg = getConfig();
  if (cfg.mode !== "live" || cfg.mailProvider !== "gmail" || !cfg.gmail) return { checked: 0, imported: 0, unmatched: 0, errors: ["gmail polling not enabled"] };
  if (!g.__bdPoller) g.__bdPoller = { timer: setInterval(() => {}, 2 ** 31 - 1), running: false, skipped: new Set() };
  const st = g.__bdPoller;
  if (st?.running) return st.last ?? { checked: 0, imported: 0, unmatched: 0, errors: [] };
  if (st) st.running = true;
  const skipped = st?.skipped ?? new Set<string>();
  const result: PollResult = { checked: 0, imported: 0, unmatched: 0, errors: [] };
  try {
    const r = await repo();
    const tp = new RefreshTokenProvider(cfg.gmail.user, cfg.gmail.clientId, cfg.gmail.clientSecret, cfg.gmail.refreshToken);
    const src = new GmailPollingSource(tp);
    // Threads WE started — the only ones this platform is allowed to read (§45).
    const gmailReceipts = (await r.receipts()).filter((x) => x.provider === "gmail");
    const ourThreads = new Set(gmailReceipts.filter((x) => x.provider_thread_id).map((x) => x.provider_thread_id as string));
    // The exact messages we sent (so a self-addressed send is not mistaken for a reply).
    const ourMessageIds = new Set(gmailReceipts.map((x) => x.message_id));
    for (const c of await src.listCandidates()) {
      result.checked++;
      if (ourMessageIds.has(c.id)) continue; // our own outgoing message landing in the inbox
      if (!ourThreads.has(c.threadId)) {
        // Unrelated mail: never fetch its content, never store it. Count once for the status line.
        if (!skipped.has(c.id)) { skipped.add(c.id); result.unmatched++; }
        continue;
      }
      const existing = await r.inboundEventByRef("gmail", c.id);
      if (existing?.processed_at) continue; // imported AND fully processed
      if (existing) {
        // Stored but never classified (an earlier LLM failure — review v6 F07):
        // finish the job instead of skipping it forever.
        try { if (await handleInbound(r, existing)) result.imported++; }
        catch (e) { result.errors.push(`${c.id}: ${(e as Error).message.slice(0, 200)}`); }
        continue;
      }
      try {
        const m = await src.fetchMessage(c.id);
        const event = await src.toEvent(r, m, { now: () => new Date(), newId });
        const cls = await handleInbound(r, event);
        if (cls) result.imported++;
      } catch (e) {
        result.errors.push(`${c.id}: ${(e as Error).message.slice(0, 200)}`);
      }
    }
    if (skipped.size > 500) { const keep = [...skipped].slice(-200); skipped.clear(); for (const k of keep) skipped.add(k); }
  } catch (e) {
    result.errors.push((e as Error).message.slice(0, 300));
  } finally {
    if (g.__bdPoller) { g.__bdPoller.running = false; g.__bdPoller.last = { ...result, at: new Date().toISOString() }; }
  }
  return result;
}

export function startGmailPoller() {
  const cfg = getConfig();
  if (cfg.mode !== "live" || cfg.mailProvider !== "gmail" || !cfg.gmail || g.__bdPoller) return;
  const every = Math.max(5, cfg.gmail.pollSeconds) * 1000;
  const timer = setInterval(() => { void pollGmailOnce(); }, every);
  timer.unref?.();
  g.__bdPoller = { timer, running: false, skipped: new Set() };
  console.log(`[gmail] polling ${cfg.gmail.user} every ${every / 1000}s`);
}
