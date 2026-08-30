import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "@/lib/repository";
import { grantPlaybackApproval, playbackState, startDemoPlayback } from "@/lib/demo-playback";
import dataset from "../../fixtures/demo/dataset.json";

process.env.APP_MODE = "demo";

describe("demo playback (§34, §35, §41)", () => {
  it("runs the whole story on a fresh project with an injected failure and retry", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const st = await startDemoPlayback(repo, { pace: 0, approvalTimeoutMs: 10_000 });
    expect(st.running).toBe(true);
    // wait for completion; approve the human-in-the-loop pause when it appears
    let paused = false;
    for (let i = 0; i < 400 && playbackState().running; i++) {
      if (playbackState().waitingApproval) { paused = true; expect(grantPlaybackApproval()).toBe(true); }
      await new Promise((r) => setTimeout(r, 25));
    }
    const final = playbackState();
    expect(paused, "playback must pause for human approval at the first draft").toBe(true);
    expect(final.error).toBeUndefined();
    expect(final.step).toBe("done");
    const pid = final.projectId!;
    const leads = await repo.leads(pid);
    expect(leads.length).toBe(12);
    const runs = (await repo.agentRuns()).filter((r) => r.project_id === pid);
    // Exact counts (external review v3): 12 leads → 13 research attempts =
    // 12 successes + 1 injected failure; the recovered retry is exactly ONE
    // successful run marked retry_count=1, never a duplicate row.
    const research = runs.filter((r) => r.agent === "research");
    expect(research.length).toBe(13);
    expect(research.filter((r) => r.status === "COMPLETED").length).toBe(12);
    expect(research.filter((r) => r.status === "FAILED").length).toBe(1);
    const retryLeadId = research.find((r) => r.status === "FAILED")!.lead_id;
    const retryLeadRuns = research.filter((r) => r.lead_id === retryLeadId);
    expect(retryLeadRuns.filter((r) => r.status === "COMPLETED").length).toBe(1);
    expect(retryLeadRuns.find((r) => r.status === "COMPLETED")!.retry_count).toBe(1);
    expect(runs.filter((r) => r.agent === "qualification" && r.status === "COMPLETED").length).toBe(12);
    expect(runs.some((r) => r.status === "RETRYING" || r.status === "RUNNING" || r.status === "QUEUED")).toBe(false);
    expect(runs.filter((r) => r.agent === "outreach" && r.status === "COMPLETED").length).toBe(6);
    expect(runs.some((r) => r.agent === "reply")).toBe(true);
    expect(runs.some((r) => r.agent === "learning" && r.status === "COMPLETED")).toBe(true);
    expect(leads.filter((l) => l.status === "OUTCOME_RECORDED").length).toBeGreaterThan(0);
    expect((await repo.insights()).some((i) => i.project_id === pid)).toBe(true);

    // A second run replaces the previous demo project instead of piling up.
    await startDemoPlayback(repo, { pace: 0, approvalTimeoutMs: 10_000 });
    for (let i = 0; i < 400 && playbackState().running; i++) {
      if (playbackState().waitingApproval) grantPlaybackApproval();
      await new Promise((r) => setTimeout(r, 25));
    }
    const demoProjects = (await repo.projects()).filter((p) => /\(demo /.test(p.name));
    expect(demoProjects.length).toBe(1);
    expect(demoProjects[0].id).not.toBe(pid);
    expect((await repo.leads(pid)).length).toBe(0); // old demo data fully removed
  }, 30000);
});
