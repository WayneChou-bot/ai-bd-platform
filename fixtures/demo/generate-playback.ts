/**
 * Demo playback recorder (Spec v0.3 addendum — reliable public demo).
 *
 * Serverless deployments give every request a different instance, so a demo
 * held in server memory falls apart in public. Instead we run the REAL demo
 * playback (real agents, mock provider) ONCE here, sample its state, and save
 * the timeline. The browser replays it — each visitor gets their own
 * deterministic copy, the human-approval pause included, no server state.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json fixtures/demo/generate-playback.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { InMemoryRepository } from "@/lib/repository";
import { grantPlaybackApproval, playbackState, startDemoPlayback } from "@/lib/demo-playback";
import { orchestratorStatus } from "@/lib/orchestrator-status";
import dataset from "./dataset.json";

process.env.APP_MODE = "demo";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Frame {
  /** ms since demo start (approval wait excluded — the player pauses there). */
  t: number;
  step: string;
  /** how many entries of the shared log are visible at this frame */
  logLen: number;
  waitingApproval: { company: string; subject: string } | null;
  nodes: Array<{ key: string; label: string; short: string; status: string; input: number; completed: number; attempts: number; recovered: number; failed: number; remaining: number; current: string | null }>;
}

async function main() {
  const repo = InMemoryRepository.fromDataset(dataset);
  const frames: Frame[] = [];
  const t0 = Date.now();
  let pausedMs = 0; // subtract recorder-side approval wait from the timeline
  let approved = false;

  await startDemoPlayback(repo, { pace: 260, approvalTimeoutMs: 30_000 });

  while (playbackState().running) {
    const st = playbackState();
    const status = st.projectId ? await orchestratorStatus(repo, st.projectId) : null;
    frames.push({
      t: Date.now() - t0 - pausedMs,
      step: st.step,
      logLen: st.log.length,
      waitingApproval: st.waitingApproval ? { company: st.waitingApproval.company, subject: st.waitingApproval.subject } : null,
      nodes: (status?.nodes ?? []).map((n) => ({ key: n.key, label: n.label, short: n.short, status: n.status, input: n.input, completed: n.completed, attempts: n.attempts, recovered: n.recovered, failed: n.failed, remaining: n.remaining, current: n.current ?? null })),
    });
    if (st.waitingApproval && !approved) {
      const pauseStart = Date.now();
      await sleep(400); // make sure the pause frame is captured
      grantPlaybackApproval();
      approved = true;
      pausedMs += Date.now() - pauseStart;
    }
    await sleep(90);
  }
  const st = playbackState();
  const status = st.projectId ? await orchestratorStatus(repo, st.projectId) : null;
  frames.push({
    t: Date.now() - t0 - pausedMs, step: st.step, logLen: st.log.length, waitingApproval: null,
    nodes: (status?.nodes ?? []).map((n) => ({ key: n.key, label: n.label, short: n.short, status: n.status, input: n.input, completed: n.completed, attempts: n.attempts, recovered: n.recovered, failed: n.failed, remaining: n.remaining, current: n.current ?? null })),
  });
  if (st.error) throw new Error(`recorded demo failed: ${st.error}`);
  if (st.step !== "done") throw new Error(`recorded demo ended in step "${st.step}"`);

  // Drop frames that change nothing so the bundle stays small.
  const compact: Frame[] = [];
  for (const f of frames) {
    const prev = compact[compact.length - 1];
    if (prev && prev.step === f.step && prev.logLen === f.logLen && !f.waitingApproval === !prev.waitingApproval && JSON.stringify(prev.nodes) === JSON.stringify(f.nodes)) continue;
    compact.push(f);
  }

  const timeline = {
    version: "1",
    note: "Recorded from a real run of the real agents with the mock provider — the browser replays it so every visitor gets a reliable, instance-independent demo.",
    log: playbackState().log,
    frames: compact,
  };
  writeFileSync(join(__dirname, "playback.json"), JSON.stringify(timeline, null, 1) + "\n");
  const pauseIdx = compact.findIndex((f) => f.waitingApproval);
  console.log(`playback.json: ${compact.length} frames, ${timeline.log.length} log lines, approval pause at frame ${pauseIdx}, duration ${(compact[compact.length - 1].t / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
