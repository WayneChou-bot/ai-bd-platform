"use client";
/**
 * Agent Orchestrator (Spec §22, §33). Animations communicate state:
 * connectors carry particles only while the downstream node is active,
 * counters tween on change, the active node pulses. Enterprise SaaS, not a
 * gaming dashboard — no effects without a state behind them.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import { AlertTriangle, Play, RotateCcw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrchestratorStatus } from "@/lib/orchestrator-status";
import { tr, type Locale } from "@/lib/i18n";

const TONE: Record<string, string> = { discovery: "var(--c-discover)", research: "var(--c-research)", qualification: "var(--c-qualify)", outreach: "var(--c-engage)", reply: "var(--c-reply)", learning: "var(--c-learn)" };

function Counter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const from = prev.current; prev.current = value;
    if (from === value) { el.textContent = String(value); return; }
    const c = animate(from, value, { duration: 0.6, ease: "easeOut", onUpdate: (v) => { el.textContent = String(Math.round(v)); } });
    return () => c.stop();
  }, [value]);
  return <span ref={ref} className="tabular">{value}</span>;
}

function Connector({ active, color }: { active: boolean; color: string }) {
  return (
    <div className="relative hidden h-10 w-7 shrink-0 items-center xl:flex 2xl:w-10">
      <div className="h-px w-full" style={{ background: active ? color : "rgba(148,163,184,0.18)", opacity: active ? 0.8 : 1 }} />
      <AnimatePresence>
        {active && [0, 1, 2].map((i) => (
          <motion.span key={i} className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }}
            initial={{ left: "0%", opacity: 0 }} animate={{ left: ["0%", "100%"], opacity: [0, 1, 1, 0] }} exit={{ opacity: 0 }}
            transition={{ duration: 1.4, delay: i * 0.45, repeat: Infinity, ease: "linear" }} />
        ))}
      </AnimatePresence>
    </div>
  );
}

const fmtElapsed = (ms: number | null) => { if (ms == null) return null; const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

export function Orchestrator({ initial, projectId, canStartDemo, compact = false, locale = "en" }: { initial: OrchestratorStatus; projectId?: string; canStartDemo?: boolean; compact?: boolean; locale?: Locale }) {
  const t = tr(locale);
  const [s, setS] = useState(initial);
  const [starting, setStarting] = useState(false);
  const live = s.playback.running || s.nodes.some((n) => n.active);

  // Poll only while something is happening (§33: animate only when jobs are active).
  useEffect(() => {
    const url = `/api/orchestrator${projectId ? `?project=${projectId}` : ""}`;
    let stop = false;
    const tick = async () => { try { const r = await fetch(url, { cache: "no-store" }); if (!stop) setS(await r.json()); } catch { /* ignore */ } };
    const id = setInterval(tick, live ? 1200 : 6000);
    return () => { stop = true; clearInterval(id); };
  }, [projectId, live]);

  const start = async () => {
    setStarting(true);
    try { await fetch("/api/demo", { method: "POST" }); } finally { setTimeout(() => setStarting(false), 800); }
  };
  const approve = async () => {
    try { await fetch("/api/demo?action=approve", { method: "POST" }); } catch { /* next poll reflects the state */ }
  };
  const wa = s.playback.waitingApproval;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{t("Agent Orchestrator")}</h2>
          <div className="text-xs text-muted">{live ? <span className="text-engage">● {t("Live — jobs running")}</span> : t("Idle — animations run only while jobs are active")}</div>
        </div>
        <div className="flex items-center gap-2">
          {s.playback.step !== "idle" && <span className="text-xs text-muted">{t("Demo")}: {s.playback.step}</span>}
          {canStartDemo && (
            <button onClick={start} disabled={s.playback.running || starting} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50">
              {s.playback.running ? <RotateCcw size={14} className="animate-spin" /> : <Play size={14} />} {s.playback.running ? t("Running…") : s.playback.step === "done" ? t("Run demo again") : t("Start Demo")}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {wa && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-engage/40 bg-engage/10 px-4 py-3">
            <div className="min-w-0 text-sm">
              <span className="font-semibold text-engage">⏸ {t("Human approval required")}</span>
              <span className="ml-2 text-fg/90">“{wa.subject}” → {wa.company}</span>
              <div className="text-xs text-muted">{t("The pipeline is paused — nothing is sent until you approve.")}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={`/leads/${wa.leadId}?tab=messages`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-fg/90 hover:bg-white/5">
                {t("View draft")}
              </a>
              <button onClick={approve} className="inline-flex items-center gap-1.5 rounded-lg bg-engage px-3 py-1.5 text-sm font-medium text-white hover:bg-engage/90">
                <Send size={14} /> {t("Approve & continue")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="glass overflow-hidden rounded-xl p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:items-stretch">
          {s.nodes.map((n, i) => (
            <div key={n.key} className="contents">
              <motion.div
                layout
                className={cn("relative min-w-0 rounded-xl border p-3 transition-colors xl:flex-1 xl:basis-0", n.active ? "border-white/20 bg-white/[0.04]" : "border-white/10 bg-white/[0.02]")}
                animate={{
                  boxShadow: n.status === "RUNNING"
                    ? [`0 0 0 1px ${TONE[n.key]}55, 0 0 16px ${TONE[n.key]}22`, `0 0 0 1px ${TONE[n.key]}bb, 0 0 36px ${TONE[n.key]}44`, `0 0 0 1px ${TONE[n.key]}55, 0 0 16px ${TONE[n.key]}22`]
                    : n.active ? `0 0 0 1px ${TONE[n.key]}55, 0 0 24px ${TONE[n.key]}22` : "0 0 0 0px transparent",
                }}
                transition={n.status === "RUNNING" ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
              >
                <div className="absolute inset-x-3 top-0 h-0.5 rounded-b" style={{ background: TONE[n.key] }} />
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold tracking-wider" style={{ color: TONE[n.key] }}>{t(n.short)}</div>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className={cn("inline-block h-2 w-2 rounded-full", n.status === "RUNNING" ? "pulse" : "", n.status === "RUNNING" || n.status === "READY" ? "bg-engage" : n.status === "QUEUED" ? "bg-learn" : "bg-white/20")} />
                    {t(n.status)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-sm font-medium" title={t(n.label)}>{t(n.label)}</div>
                {compact ? (
                  <div className="tabular mt-2 flex items-center gap-3 text-xs">
                    <span><span className="text-muted">{t("Completed")} </span><Counter value={n.completed} /><span className="text-muted"> / </span><Counter value={n.input} /></span>
                    {n.failed > 0 && <span className="text-danger">{t("Failed")} <Counter value={n.failed} /></span>}
                    {n.remaining > 0 && <span className="text-learn">{t("Remaining")} <Counter value={n.remaining} /></span>}
                  </div>
                ) : (
                  <div className="tabular mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-muted">{t("Input")}</span><span className="text-right"><Counter value={n.input} /></span>
                    <span className="text-muted">{t("Completed")}</span><span className="text-right"><Counter value={n.completed} /></span>
                    <span className="text-muted">{t("Failed")}</span><span className={cn("text-right", n.failed && "text-danger")}><Counter value={n.failed} /></span>
                    <span className="text-muted">{t("Remaining")}</span><span className="text-right"><Counter value={n.remaining} /></span>
                  </div>
                )}
                <div className="mt-2 min-h-8 text-xs">
                  {n.current && <div className="truncate text-muted">{n.status === "RUNNING" ? t("Current") : t("Last")}: <span className="text-fg/90">{n.current}</span></div>}
                  {n.elapsedMs != null && <div className="tabular text-muted">{t("Elapsed")} {fmtElapsed(n.elapsedMs)}</div>}
                  {n.error && n.status !== "READY" && <div className="mt-1 flex items-start gap-1 text-learn"><AlertTriangle size={12} className="mt-0.5 shrink-0" /><span className="line-clamp-2">{n.error}</span></div>}
                </div>
              </motion.div>
              {i < s.nodes.length - 1 && <Connector active={s.nodes[i + 1].active || (n.active && s.nodes[i + 1].status !== "IDLE" && s.playback.running)} color={TONE[s.nodes[i + 1].key]} />}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-learn/40 to-transparent" />
          <span>{t("Learn ↺ Discover — outcomes feed the next targeting round")}</span>
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-learn/40 to-transparent" />
        </div>
      </div>

      {!compact && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="glass rounded-xl p-4">
            <div className="mb-2 text-sm font-semibold">{t("Activity stream")}</div>
            <ul className="space-y-1 text-xs">
                {s.activity.map((a) => (
                  <motion.li key={a.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-baseline gap-2">
                    <span className="tabular w-11 shrink-0 text-muted">{a.at.slice(11, 19)}</span>
                    <span className={cn("shrink-0 rounded px-1", a.actor === "user" ? "bg-engage/15 text-engage" : a.actor === "agent" ? "bg-research/15 text-research" : "bg-white/5 text-muted")}>{a.actor}</span>
                    <span className="truncate"><span className="text-fg/90">{a.action}</span>{a.lead && <span className="text-muted"> · {a.lead}</span>}{a.detail && <span className="text-muted"> — {a.detail}</span>}</span>
                  </motion.li>
                ))}
            </ul>
          </div>
          <div className="glass rounded-xl p-4">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold"><span>{t("Demo playback")}</span>{s.playback.error && <span className="text-xs text-danger">{s.playback.error}</span>}</div>
            {!canStartDemo && s.playback.log.length === 0 ? (
              <p className="text-xs text-muted">{t("Demo playback is available in DEMO mode only — it creates a fresh simulated project, which stays separate from your real LIVE data. Set APP_MODE=demo in .env.local and restart to run it.")}</p>
            ) : s.playback.log.length === 0 ? (
              <p className="text-xs text-muted">{t("Press Start Demo to create a fresh project and watch Discover → Research → Qualify → Engage → Reply → Learn run end to end — including one injected source failure with retry (§41). No external APIs are called.")} {t("The first draft demonstrates the human approval gate — the demo pauses until you act. Remaining simulated drafts auto-advance to keep the demo brisk; nothing external is ever sent.")}</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {s.playback.log.map((l, i) => (
                  <li key={i} className={cn("flex gap-2", l.tone === "ok" && "text-engage", l.tone === "warn" && "text-learn", l.tone === "fail" && "text-danger", !l.tone && "text-fg/80")}>
                    <span className="tabular w-11 shrink-0 text-muted">{l.at.slice(11, 19)}</span><span>{l.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
