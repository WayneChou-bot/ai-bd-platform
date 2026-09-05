/**
 * POST /api/inbound — Resend Inbound webhook (Spec v0.2 S4.4).
 *
 * Verify signature → persist → 200 within a second. The Reply Agent runs
 * after the response has been sent (Next `after()`), so the endpoint behaves
 * the same on Vercel, Render and a local tunnel. Disabled in DEMO mode.
 */
import { after, NextResponse } from "next/server";
import { ResendInboundSource } from "@/adapters/inbound";
import { newId } from "@/core/orchestrator/run";
import { getConfig } from "@/lib/config";
import { handleInbound } from "@/lib/engagement";
import { repo } from "@/lib/data";

export const runtime = "nodejs";

// Very small in-process rate limit per source IP (§43). Fine for a single instance.
const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string, max = 60, windowMs = 60_000) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > windowMs) { hits.set(ip, { n: 1, t: now }); return false; }
  h.n++;
  return h.n > max;
}

export async function POST(req: Request) {
  const cfg = getConfig();
  if (cfg.mode !== "live" || !cfg.resendWebhookSecret) return new NextResponse("Not found", { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (limited(ip)) return new NextResponse("Too many requests", { status: 429 });

  const rawBody = await req.text();
  const headers = { "svix-id": req.headers.get("svix-id") ?? undefined, "svix-timestamp": req.headers.get("svix-timestamp") ?? undefined, "svix-signature": req.headers.get("svix-signature") ?? undefined };
  const parsed = new ResendInboundSource(cfg.resendWebhookSecret).parse({ rawBody, headers }, { now: () => new Date(), newId });
  if (!parsed.ok) {
    const r = await repo();
    await r.addAuditEvent({ id: newId("aud"), project_id: (await r.project()).id, lead_id: null, actor: "system", action: "inbound.rejected", detail: `${parsed.status} ${parsed.reason} from ${ip}`, created_at: new Date().toISOString() });
    return new NextResponse(parsed.reason, { status: parsed.status });
  }

  const r = await repo();
  const existing = parsed.event.raw_ref ? await r.inboundEventByRef("resend", parsed.event.raw_ref) : undefined;
  if (existing?.processed_at) return NextResponse.json({ ok: true, duplicate: true });
  // New event, or one stored earlier whose classification failed (review v6
  // F07): persist before acking, then (re)process out of band.
  const event = existing ?? parsed.event;
  if (!existing) await r.saveInboundEvent(parsed.event);

  after(async () => {
    try { await handleInbound(r, event); } catch (e) { console.error("[inbound] reply agent failed", e); }
  });
  return NextResponse.json({ ok: true, id: event.id, retried: !!existing });
}
