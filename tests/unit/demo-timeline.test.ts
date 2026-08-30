/**
 * Integrity of the recorded demo timeline (fixtures/demo/playback.json).
 *
 * The public demo is a browser-side replay of this recording, so a broken
 * recording means a broken public demo — assert its shape here instead of
 * finding out on Vercel.
 */
import { describe, expect, it } from "vitest";
import timeline from "../../fixtures/demo/playback.json";

describe("demo playback timeline", () => {
  const frames = timeline.frames;

  it("has frames and ends in step done", () => {
    expect(frames.length).toBeGreaterThan(10);
    expect(frames[frames.length - 1].step).toBe("done");
  });

  it("pauses exactly once for human approval, with company and subject", () => {
    const pauses = frames.filter((f) => f.waitingApproval);
    expect(pauses).toHaveLength(1);
    const p = pauses[0].waitingApproval!;
    expect(p.company.length).toBeGreaterThan(0);
    expect(p.subject.length).toBeGreaterThan(0);
    // the pause must not be the final frame — the demo continues after Approve
    expect(frames.indexOf(pauses[0])).toBeLessThan(frames.length - 1);
  });

  it("timestamps and visible-log length only move forward", () => {
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].t).toBeGreaterThanOrEqual(frames[i - 1].t);
      expect(frames[i].logLen).toBeGreaterThanOrEqual(frames[i - 1].logLen);
    }
    expect(frames[frames.length - 1].logLen).toBe(timeline.log.length);
  });

  it("keeps node counters coherent in every frame", () => {
    // The first frames precede project creation and may have no board yet,
    // but once nodes appear they must never disappear again.
    const firstBoard = frames.findIndex((f) => f.nodes.length > 0);
    expect(firstBoard).toBeGreaterThanOrEqual(0);
    for (const f of frames.slice(firstBoard)) expect(f.nodes.length).toBeGreaterThan(0);
    for (const f of frames) {
      for (const n of f.nodes) {
        for (const v of [n.input, n.completed, n.failed, n.remaining]) {
          expect(v).toBeGreaterThanOrEqual(0);
        }
        expect(typeof n.key).toBe("string");
        expect(typeof n.status).toBe("string");
      }
    }
  });

  it("ends with exact lead-vs-attempt numbers — retry recovered, nothing double-counted (§41)", () => {
    // External review v3: the recovered retry must be ONE successful run, so
    // the board reads 12/12 leads with 13 attempts — never 13/14.
    const byKey = Object.fromEntries(frames[frames.length - 1].nodes.map((n) => [n.key, n]));
    expect(byKey.research).toMatchObject({ input: 12, completed: 12, attempts: 13, failed: 1, recovered: 1 });
    expect(byKey.qualification).toMatchObject({ input: 12, completed: 12, failed: 0 });
    expect(byKey.outreach).toMatchObject({ completed: 6, failed: 0 });
    expect(byKey.discovery).toMatchObject({ completed: 1, failed: 0 });
  });
});
