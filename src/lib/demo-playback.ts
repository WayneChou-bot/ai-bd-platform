/**
 * Demo playback (Spec §34–§35, §41): "Start Demo" creates a fresh project and
 * walks the whole pipeline with visible pacing so the Orchestrator animates:
 * understand → ICP → discover → research (one injected failure + retry) →
 * qualify → draft → approve & send → replies → outcomes → learning.
 *
 * Runs the real agents with the mock provider. State lives on globalThis so
 * the status endpoint can report progress; only one playback at a time.
 */
import { productUnderstandingAgent } from "@/agents/product-understanding";
import { icpSuggestAgent } from "@/agents/icp";
import { runAgent, newId } from "@/core/orchestrator/run";
import type { AgentRun, Project } from "@/core/schemas";
import { agentContext } from "@/lib/context";
import { discoverLeads, qualifyLead, researchLead } from "@/lib/pipeline";
import { approveAndSend, generateDraft, recordOutcome, simulateReply } from "@/lib/engagement";
import type { Repository } from "@/lib/repository";

export interface PlaybackState {
  running: boolean;
  projectId: string | null;
  step: string;
  startedAt: string | null;
  finishedAt: string | null;
  log: Array<{ at: string; text: string; tone?: "ok" | "warn" | "fail" }>;
  error?: string;
  /** §35 human-in-the-loop pause: the demo stops at the first draft and waits
   *  for a real click before anything is "sent". */
  waitingApproval: { draftId: string; leadId: string; company: string; subject: string } | null;
  approvalGranted: boolean;
}

const g = globalThis as unknown as { __bdPlayback?: PlaybackState };
export function playbackState(): PlaybackState {
  if (!g.__bdPlayback) g.__bdPlayback = { running: false, projectId: null, step: "idle", startedAt: null, finishedAt: null, log: [], waitingApproval: null, approvalGranted: false };
  return g.__bdPlayback;
}

/** Called by the API when a human clicks Approve during the playback pause. */
export function grantPlaybackApproval(): boolean {
  const st = playbackState();
  if (!st.waitingApproval) return false;
  st.approvalGranted = true;
  return true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const REPLIES: Array<[RegExp, string, string]> = [
  [/acme/i, "Re: your knowledge engineering roles", "Thanks for reaching out — this is timely. Could you send a short overview and we can set up 20 minutes next week?"],
  [/northwind/i, "Re: documentation engineering", "Interesting. We are indeed looking at this. Happy to have a call — what does the integration look like?"],
  [/helios/i, "Re: architecture docs", "We have a pilot budget this quarter. Can you do a demo on Thursday?"],
  [/tessera/i, "Re: onboarding docs", "Not the right time for us — we just committed to another vendor. Please check back next year."],
  [/meridian/i, "Automatic reply: Out of office", "I am out of the office until Monday with limited access to email."],
  [/quantleaf/i, "Re: where knowledge goes to die", "Ha — yes, let's talk. I'm interested in how role-specific pages work."],
];

export async function startDemoPlayback(repo: Repository, opts: { pace?: number; approvalTimeoutMs?: number } = {}): Promise<PlaybackState> {
  const st = playbackState();
  if (st.running) return st;
  const pace = opts.pace ?? 350;
  const approvalTimeoutMs = opts.approvalTimeoutMs ?? 120_000;
  Object.assign(st, { running: true, projectId: null, step: "starting", startedAt: new Date().toISOString(), finishedAt: null, log: [], error: undefined, waitingApproval: null, approvalGranted: false });
  const log = (text: string, tone?: PlaybackState["log"][number]["tone"]) => { st.log.push({ at: new Date().toISOString(), text, tone }); if (st.log.length > 60) st.log.shift(); };
  const ctx = agentContext();

  (async () => {
    try {
      // 1. Project (§35: one consistent product). Each run replaces the
      // previous demo project so repeated demos don't pile up.
      st.step = "project";
      for (const p of await repo.projects()) {
        if (/\(demo [^)]*\)\s*$/i.test(p.name)) {
          await repo.deleteProject(p.id);
          log(`Cleared previous demo project "${p.name}"`);
        }
      }
      const project: Project = {
        id: newId("proj"), name: `LLM Wiki Agent (demo ${new Date().toISOString().slice(11, 16)})`,
        category: "Developer Tool / Knowledge Management",
        description: "Multi-agent system that transforms raw source material into role-specific interconnected knowledge pages.",
        website: "https://github.com/WayneChou-bot/LLM-Wiki-Agent-Workflow-Demo", repository: "https://github.com/WayneChou-bot/LLM-Wiki-Agent-Workflow-Demo", created_at: new Date().toISOString(),
      };
      await repo.createProject(project);
      st.projectId = project.id;
      log(`Created project "${project.name}"`, "ok");

      // 2. Understand + ICP
      st.step = "understanding";
      log("Understanding product…");
      const { output: pu } = await runAgent(repo, productUnderstandingAgent, { project }, ctx, { project_id: project.id, input_summary: "description", summarize: (o) => o.category });
      await repo.saveProductUnderstanding(pu);
      await sleep(pace * 2);
      log(`✓ Product understood: ${pu.category}`, "ok");
      st.step = "icp";
      log("Generating ICP…");
      const { output: icp } = await runAgent(repo, icpSuggestAgent, { project, understanding: pu }, ctx, { project_id: project.id, input_summary: "understanding", summarize: (o) => `${o.positive_signals.length} signals` });
      await repo.saveICP(icp);
      await sleep(pace * 2);
      log(`✓ ICP ready: ${icp.positive_signals.slice(0, 2).join(", ")}…`, "ok");

      // 3. Discover
      st.step = "discover";
      log("Discovering leads…");
      const leads = await discoverLeads(repo, project.id, { limit: 12, ctx });
      await sleep(pace * 2);
      log(`✓ ${leads.length} discovered`, "ok");

      // 4. Research with one injected failure + retry (§41)
      st.step = "research";
      for (const [i, lead] of leads.entries()) {
        if (i === 3) {
          const failed: AgentRun = {
            id: newId("run"), project_id: project.id, agent: "research", lead_id: lead.id, status: "FAILED",
            started_at: new Date().toISOString(), completed_at: new Date(Date.now() + 900).toISOString(), latency_ms: 900, model: "mock", token_usage: null,
            retry_count: 0, error: "Source unavailable (HTTP 503) — retry 1 / 2 scheduled", input_summary: lead.website ?? "", output_summary: "", created_at: new Date().toISOString(),
          };
          await repo.addAgentRun(failed);
          log(`⚠ ${lead.company_name}: source unavailable — retrying`, "warn");
          await sleep(pace * 3);
          // The FAILED row stays (§23: never hide failures). The retry IS the
          // researchLead run below — exactly ONE successful AgentRun, marked
          // retry_count=1 (a duplicate hand-made retry row double-counted the
          // board; caught in external review v3).
          await researchLead(repo, lead.id, ctx);
          const rerun = (await repo.agentRuns())
            .filter((r) => r.agent === "research" && r.lead_id === lead.id && r.status === "COMPLETED")
            .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          if (rerun) await repo.updateAgentRun({ ...rerun, retry_count: 1, output_summary: `${rerun.output_summary} — recovered on retry 1 / 2` });
          log(`Researched ${lead.company_name} (retry succeeded)`);
          await sleep(pace);
          continue;
        }
        await researchLead(repo, lead.id, ctx);
        log(`Researched ${lead.company_name}`);
        await sleep(pace);
      }
      log(`✓ ${leads.length} / ${leads.length} researched`, "ok");

      // 5. Qualify
      st.step = "qualify";
      const mix = { HIGH_FIT: 0, MEDIUM_FIT: 0, REJECT: 0 };
      const qualified: string[] = [];
      for (const lead of leads) {
        const q = await qualifyLead(repo, lead.id, ctx);
        if (q.classification === "HIGH_FIT") { mix.HIGH_FIT++; qualified.push(lead.id); }
        else if (q.classification === "MEDIUM_FIT") { mix.MEDIUM_FIT++; qualified.push(lead.id); }
        else mix.REJECT++;
        log(`${lead.company_name}: ${q.withheld ? "score withheld" : `${q.total_score} ${q.classification.replace("_", " ")}`}`, q.withheld ? "warn" : undefined);
        await sleep(pace * 0.8);
      }
      log(`✓ ${mix.HIGH_FIT} High Fit · ${mix.MEDIUM_FIT} Medium Fit · ${mix.REJECT} Rejected`, "ok");

      // 6. Engage: draft + approve & send for the top 6.
      // The FIRST draft pauses the playback and waits for a real human click —
      // human-in-the-loop is enforced, not narrated (§35). Times out to keep
      // unattended demos from hanging forever.
      st.step = "engage";
      const sent: string[] = [];
      for (const [i, id] of qualified.slice(0, 6).entries()) {
        const lead = (await repo.lead(id))!;
        const d = await generateDraft(repo, id, "professional", ctx);
        log(`Draft for ${lead.company_name}: “${d.subject}”`);
        await sleep(pace);
        let sendId = d.id;
        if (i === 0) {
          st.step = "awaiting_approval";
          st.waitingApproval = { draftId: d.id, leadId: id, company: lead.company_name, subject: d.subject };
          st.approvalGranted = false;
          log("⏸ Waiting for a human — nothing is sent until you approve", "warn");
          // The human can approve from the banner OR open the draft on the
          // lead's Messages tab and act there (approve / edit / reject) — all count.
          const deadline = Date.now() + approvalTimeoutMs;
          let external: "approved" | "rejected" | null = null;
          while (!st.approvalGranted && Date.now() < deadline) {
            const cur = await repo.draft(sendId);
            if (cur?.status === "SUPERSEDED") {
              // human edited the draft — follow the new version
              const next = (await repo.draftsFor(id)).find((x) => x.status === "DRAFT");
              if (next) { sendId = next.id; st.waitingApproval = { draftId: next.id, leadId: id, company: lead.company_name, subject: next.subject }; }
            } else if (cur && cur.status !== "DRAFT") {
              external = cur.status === "REJECTED" ? "rejected" : "approved";
              break;
            }
            await sleep(50);
          }
          st.waitingApproval = null;
          st.step = "engage";
          if (external === "rejected") {
            log(`✗ Draft rejected by a human — skipping ${lead.company_name}`, "warn");
            continue;
          }
          if (external === "approved") {
            log(`✓ Approved from the lead page & sent (simulated) → ${lead.company_name}`, "ok");
            sent.push(id);
            await sleep(pace);
            continue;
          }
          if (!st.approvalGranted) {
            // No human, no send — the gate fails closed (external review v3:
            // a timeout must never impersonate an approval, even in demo data).
            log("No approval received before timeout — draft skipped, nothing was sent", "warn");
            continue;
          }
          log("✓ Approved by a human", "ok");
        }
        await approveAndSend(repo, sendId, ctx);
        log(`✓ Approved & sent (simulated) → ${lead.company_name}`, "ok");
        sent.push(id);
        await sleep(pace);
      }

      // 7. Replies → Reply Agent → outcomes
      st.step = "reply";
      for (const id of sent) {
        const lead = (await repo.lead(id))!;
        const script = REPLIES.find(([re]) => re.test(lead.company_name));
        if (!script) continue;
        await sleep(pace * 1.5);
        const cls = await simulateReply(repo, id, script[1], script[2], ctx);
        log(`↩ ${lead.company_name} replied → ${cls?.outcome}${cls?.needs_human ? " (needs human)" : ""}`, cls?.outcome === "negative_reply" ? "warn" : "ok");
      }
      // Match against COMPANY NAMES, not lead ids (bug caught in external review v2).
      const noReply: string[] = [];
      for (const id of sent) {
        const l = (await repo.lead(id))!;
        if (!REPLIES.some(([re]) => re.test(l.company_name))) noReply.push(id);
      }
      for (const id of noReply.slice(0, 1)) {
        const lead = (await repo.lead(id))!;
        if (lead.status === "CONTACTED") { await recordOutcome(repo, id, "no_response", "demo: no reply after 14 days", { ctx }); log(`${lead.company_name}: no response recorded`); }
      }

      st.step = "learn";
      log("✓ Learning Agent refreshed insights", "ok");
      st.step = "done";
      log("Demo complete", "ok");
    } catch (e) {
      st.error = (e as Error).message;
      st.step = "failed";
      log(`✖ ${st.error}`, "fail");
    } finally {
      st.running = false;
      st.finishedAt = new Date().toISOString();
    }
  })();

  return st;
}
