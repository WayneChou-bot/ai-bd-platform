# Roadmap (Spec v0.1 §49 + v0.2)

| Phase | Scope | Status |
|---|---|---|
| 0 — Foundation | App shell, navigation, DB schema, Zod contracts, agent interfaces, adapters (LLM / delivery / inbound / sources / CRM), 25-lead demo fixtures, tests | **done** |
| 1 — Product + ICP | Project create/edit, Product Understanding Agent, ICP Builder (AI-suggested + manual), agent-run logging, Supabase write paths | **done** |
| 2 — Intelligence | Discovery (fixture pool / Tavily / GitHub adapters), safe page fetch, Research Agent with untrusted-source fencing, live qualification, Discover page, per-lead Research / Qualify / Ignore, full pipeline run | **done** |
| 3 — Engagement | Generate / Edit / Regenerate / Reject / Approve & Send (versioned drafts), Mock + Resend delivery, `/api/inbound` webhook (signature, idempotent, rate-limited, `after()` processing), Reply Agent → outcomes, simulate reply, manual outcome recording, Messages queue page | **done** |
| 4 — Analytics | Per-project analytics computed from rows: funnel, reply breakdown, score-band and evidence-category response rates, replies over time, source performance, agent latency/failure/tokens; Overview funnel chart | **done** |
| 5 — Visualization | Live Orchestrator (per-node input/completed/failed/remaining, current lead, elapsed, animated connectors only while active), activity stream, Start Demo playback on a fresh project with injected failure + retry, Overview follows the demo project | **done** |

## Also done

- zh-TW / en language toggle (cookie), hover/motion polish, pending spinners on agent actions
- Settings: read-only runtime status (mode, adapters, which keys are set)
- Campaigns: per-project outreach funnel + review queue summary
- Leads: search + sortable columns; evidence hover on "Why this lead"

## Also done (mail)

- Gmail adapter: send as the authorised mailbox, poll for replies, `npm run gmail:auth`; Resend kept as alternative; `TokenProvider` interface ready for Workspace domain-wide delegation

## Next

- README rewrite + launch post copy (deferred per decision log)
- Optional: CSV import UI, saved ICP templates, lead comparison (P1)
- Optional: worker loop for LIVE batch runs on Render

## What the test suite proves

- Deterministic scoring reproducible from evidence rows (`tests/evaluation/fixtures-consistency.test.ts`)
- Every draft cites existing, positive evidence only (grounding guard)
- Reply Agent ignores instructions embedded in replies (prompt-injection fixture)
- Webhook signature verification and idempotent parsing
- Legal lead-state transitions across the whole audit trail

---

## External review v2 (2026-08-30) — accepted priorities

Verified findings fixed immediately: Resend inbound double-dedupe (P0, regression-tested),
LIVE-without-override now refuses to start unless `ALLOW_REAL_OUTREACH=true`,
`private/` excluded from lint, form labels associated via wrapping `<label>`.

### Before any real LIVE operation (P0)
- Resend receiving path: fetch full content via Receiving API; thread on RFC
  Message-ID / In-Reply-To, not the API response id. (Gmail path is the
  verified production route today; Resend stays experimental until then.)
- Durable job queue: claim/lease, retry policy, dead-letter, crash recovery,
  multi-instance locking. `runAgent` is intentionally synchronous in-process
  today — fine for single-user, not for operations.
- Auth / workspace / RBAC / RLS before any multi-user deployment; Supabase
  service-role key must move behind authenticated server boundaries.
- LIVE requires a durable database — no silent in-memory fallback.
- Suppression/unsubscribe list, per-domain send limits.

### Product competitiveness (P1)
- "Today / Work Queue" home: drafts awaiting review, high-intent signals,
  replies needing a human, stale research, follow-ups due.
- Golden dataset evaluation: Precision@10, Evidence Support Rate,
  reply-classification F1, score→outcome calibration (fixture-consistency
  tests prove determinism, not intelligence quality).
- Responsive/mobile layout; Campaigns either renamed (funnel view) or grown
  into a real sequence/play model; ICP weights + versioning; CRM sync
  (Salesforce/HubSpot) instead of rebuilding CRM.

### Positioning (for README rewrite)
"Evidence-first AI prospecting & signal intelligence" — not a CRM replacement.
Differentiators: evidence behind every conclusion, score withholding,
deterministic reproducible scoring, visible agent failures, enforced human
approval, Source → Signal → Evidence layering, zero-key deterministic demo.
