"use client";
/**
 * Agent Orchestrator (Spec §22, §33). Animations communicate state:
 * connectors carry particles only while the downstream node is active,
 * counters tween on change, the active node pulses.
 *
 * The public demo is a CLIENT-SIDE replay (v0.3 addendum): serverless
 * deployments spread requests across instances, so server-memory playback
 * falls apart in public. fixtures/demo/playback.json is recorded from one
 * real run of the real agents (mock provider); the browser replays it, so
 * every visitor gets a deterministic, instance-independent demo — the
 * human-approval pause included.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import { AlertTriangle, Play, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrchestratorStatus } from "@/lib/orchestrator-status";
import { tr, type Locale } from "@/lib/i18n";
import timeline from "../../../fixtures/demo/playback.json";

const TONE: Record<string, string> = { discovery: "var(--c-discover)", research: "var(--c-research)", qualification: "var(--c-qualify)", outreach: "var(--c-engage)", reply: "var(--c-reply)", learning: "var(--c-learn)" };

type ServerNode = OrchestratorStatus["nodes"][number];
type Frame = (typeof timeline)["frames"][number];

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

/** Browser-side deterministic replay of the recorded demo run. */
function useDemoPlayer() {
  const [idx, setIdx] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  useEffect(() => {
    if (idx == null) return;
    const frames = timeline.frames;
    if (idx >= frames.length - 1) return; // done
    if (frames[idx].waitingApproval) return; // hold for the human — Approve advances idx
    const delay = Math.min(Math.max(frames[idx + 1].t - frames[idx].t, 60), 1600);
    timer.current = setTimeout(() => setIdx(idx + 1), delay);
    return clear;
  }, [idx]);

  const start = useCallback(() => { clear(); setIdx(0); }, []);
  const approve = useCallback(() => { setIdx((i) => (i == null ? i : i + 1)); }, []);

  const frame: Frame | null = idx == null ? null : timeline.frames[idx];
  const playing = frame != null && frame.step !== "done";
  const waiting = frame?.waitingApproval != null; // derived — the recording pauses on exactly one frame
  return { frame, playing, waiting, start, approve };
}

const frameNodes = (f: Frame): ServerNode[] =>
  f.nodes.map((n) => ({ ...n, active: n.status === "RUNNING", elapsedMs: null, error: null, queued: 0 } as unknown as ServerNode));

export function Orchestrator({ initial, projectId, canStartDemo, compact = false, locale = "en" }: { initial: OrchestratorStatus; projectId?: string; canStartDemo?: boolean; compact?: boolean; locale?: Locale }) {
  const t = tr(locale);
  const [s, setS] = useState(initial);
  const demo = useDemoPlayer();
  const serverActive = s.nodes.some((n) => n.active);
  // Honest status semantics (external review v3): a recorded replay is not
  // "Live — jobs running" — nothing is executing on the server.
  const researchDone = demo.frame && demo.frame.step === "done" ? demo.frame.nodes.find((n) => n.key === "research") ?? null : null;

  // Poll only while real jobs are active (§33). The demo replay is fully
  // client-side and never touches the server.
  useEffect(() => {
    const url = `/api/orchestrator${projectId ? `?project=${projectId}` : ""}`;
    let stop = false;
    const tick = async () => { try { const r = await fetch(url, { cache: "no-store" }); if (!stop) setS(await r.json()); } catch { /* ignore */ } };
    const id = setInterval(tick, serverActive ? 1200 : 6000);
    return () => { stop = true; clearInterval(id); };
  }, [projectId, serverActive]);

  // What the panel shows: the replay when one is loaded, live data otherwise.
  const nodes = demo.frame ? frameNodes(demo.frame) : s.nodes;
  const demoLog = demo.frame ? timeline.log.slice(0, demo.frame.logLen) : [];
  const logT0 = timeline.log.length ? new Date(timeline.log[0].at).getTime() : 0;
  const relTimeOf = (at: string) => `+${((new Date(at).getTime() - logT0) / 1000).toFixed(1).padStart(5, " ")}s`;
  const wa = demo.waiting && demo.frame ? demo.frame.waitingApproval : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t("Agent Orchestrator")}</h2>
          <div className="text-xs text-muted">{demo.playing ? <span className="text-research">▶ {t("Recorded demo playing")}</span> : serverActive ? <span className="text-engage">● {t("Live — jobs running")}</span> : t("Idle — animations run only while jobs are active")}</div>
        </div>
        <div className="flex items-center gap-2">
          {demo.frame && <span className="text-xs text-muted">{t("Demo")}: {demo.frame.step}</span>}
          {canStartDemo && (
            <button onClick={demo.start} disabled={demo.playing} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50">
              <Play size={14} /> {demo.playing ? t("Running…") : demo.frame ? t("Run demo again") : t("Start Demo")}
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
            <button onClick={demo.approve} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-engage px-3 py-1.5 text-sm font-medium text-white hover:bg-engage/90">
              <Send size={14} /> {t("Approve & continue")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="glass overflow-hidden rounded-xl p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:items-stretch">
          {nodes.map((n, i) => (
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
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-[11px] font-semibold tracking-wider" style={{ color: TONE[n.key] }}>{t(n.short)}</div>
                  <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-muted">
                    <span className={cn("inline-block h-2 w-2 rounded-full", n.status === "RUNNING" ? "pulse" : "", n.status === "RUNNING" || n.status === "READY" ? "bg-engage" : n.status === "QUEUED" ? "bg-learn" : "bg-white/20")} />
                    {t(n.status)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-sm font-medium" title={t(n.label)}>{t(n.label)}</div>
                {compact ? (
                  <div className="tabular mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    <span className="whitespace-nowrap"><span className="text-muted">{t("Completed")} </span><Counter value={n.completed} /><span className="text-muted"> / </span><Counter value={n.input} /></span>
                    {n.failed > 0 && <span className="whitespace-nowrap text-danger">{t("Failed")} <Counter value={n.failed} /></span>}
                    {n.recovered > 0 && <span className="whitespace-nowrap text-engage">↻ {t("Recovered")} <Counter value={n.recovered} /></span>}
                    {n.remaining > 0 && <span className="whitespace-nowrap text-learn">{t("Remaining")} <Counter value={n.remaining} /></span>}
                  </div>
                ) : (
                  <div className="tabular mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-muted">{t("Input")}</span><span className="text-right"><Counter value={n.input} /></span>
                    <span className="text-muted">{t("Completed")}</span><span className="text-right"><Counter value={n.completed} /></span>
                    <span className="text-muted">{t("Failed")}</span><span className={cn("text-right", n.failed && "text-danger")}><Counter value={n.failed} /></span>
                    {n.attempts !== n.input && (<><span className="text-muted">{t("Attempts")}</span><span className="text-right"><Counter value={n.attempts} /></span></>)}
                    {n.recovered > 0 && (<><span className="text-muted">↻ {t("Recovered")}</span><span className="text-right text-engage"><Counter value={n.recovered} /></span></>)}
                    <span className="text-muted">{t("Remaining")}</span><span className="text-right"><Counter value={n.remaining} /></span>
                  </div>
                )}
                <div className="mt-2 min-h-8 text-xs">
                  {n.current && <div className="truncate text-muted">{n.status === "RUNNING" ? t("Current") : t("Last")}: <span className="text-fg/90">{n.current}</span></div>}
                  {n.elapsedMs != null && <div className="tabular text-muted">{t("Elapsed")} {fmtElapsed(n.elapsedMs)}</div>}
                  {n.error && n.status !== "READY" && <div className="mt-1 flex items-start gap-1 text-learn"><AlertTriangle size={12} className="mt-0.5 shrink-0" /><span className="line-clamp-2">{n.error}</span></div>}
                </div>
              </motion.div>
              {i < nodes.length - 1 && <Connector active={nodes[i + 1].active || (n.active && nodes[i + 1].status !== "IDLE" && demo.playing)} color={TONE[nodes[i + 1].key]} />}
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
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">{t("Demo playback")}</div>
              {demo.frame && <span className="rounded bg-research/15 px-1.5 py-0.5 text-[11px] text-research">{t("Recorded replay — isolated from dashboard data")}</span>}
            </div>
            {!canStartDemo ? (
              <p className="text-xs text-muted">{t("Demo playback is available in DEMO mode only — it creates a fresh simulated project, which stays separate from your real LIVE data. Set APP_MODE=demo in .env.local and restart to run it.")}</p>
            ) : demoLog.length === 0 ? (
              <p className="text-xs text-muted">{t("Press Start Demo to watch Discover → Research → Qualify → Engage → Reply → Learn run end to end — including one injected source failure with retry.")} {t("It is a deterministic browser-side replay of one real agent run (recorded with the mock provider): every visitor plays their own copy, the approval pause waits for YOUR click, and nothing external is ever sent.")}</p>
            ) : (
              <>
              {researchDone && (
                <div className="mb-2 rounded-lg border border-engage/30 bg-engage/10 px-3 py-2 text-xs text-engage">
                  ✓ {t("Research completed")} — {researchDone.completed}/{researchDone.input} {t("leads researched")} · {researchDone.failed} {t("source failure recovered on retry")}
                </div>
              )}
              <ul className="space-y-1 text-xs">
                {demoLog.slice(-14).map((l, i) => (
                  <li key={i} className={cn("flex gap-2", l.tone === "ok" && "text-engage", l.tone === "warn" && "text-learn", l.tone === "fail" && "text-danger", !l.tone && "text-fg/80")}>
                    <span className="tabular w-14 shrink-0 whitespace-pre text-muted">{relTimeOf(l.at)}</span><span>{l.text}</span>
                  </li>
                ))}
              </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
