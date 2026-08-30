/** Orchestrator status (§22): per-node stats + current lead + activity. */
import type { AgentName } from "@/core/schemas";
import type { Repository } from "@/lib/repository";
import { playbackState } from "@/lib/demo-playback";

export const NODES: Array<{ key: AgentName; label: string; short: string }> = [
  { key: "discovery", label: "Discovery Agent", short: "DISCOVER" },
  { key: "research", label: "Research Agent", short: "RESEARCH" },
  { key: "qualification", label: "Qualification Agent", short: "QUALIFY" },
  { key: "outreach", label: "Outreach Agent", short: "ENGAGE" },
  { key: "reply", label: "Reply Agent", short: "REPLY" },
  { key: "learning", label: "Learning Agent", short: "LEARN" },
];

export async function orchestratorStatus(repo: Repository, projectId?: string) {
  const [runs, leads, audit] = await Promise.all([repo.agentRuns(), repo.leads(projectId), repo.auditEvents()]);
  const pid = projectId;
  const leadName = new Map(leads.map((l) => [l.id, l.entity_type === "individual" ? l.display_name ?? l.company_name : l.company_name]));
  const scoped = pid ? runs.filter((r) => r.project_id === pid) : runs;
  const now = Date.now();
  const nodes = NODES.map((n) => {
    const mine = scoped.filter((r) => r.agent === n.key);
    const running = mine.filter((r) => r.status === "RUNNING");
    const last = [...mine].sort((a, b) => (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at))[0];
    const recentlyActive = last && last.completed_at ? now - new Date(last.completed_at).getTime() < 4000 : false;
    // Lead progress vs run attempts (external review v3): for lead-scoped
    // agents, input/completed count DISTINCT LEADS so a recovered retry can't
    // read as an unfinished lead; failed stays run-based (failures are never
    // hidden) and the full attempt history lives in the Agent Runs table.
    const withLead = mine.filter((r) => r.lead_id);
    const leadBased = withLead.length > 0;
    return {
      ...n,
      status: running.length ? "RUNNING" : mine.some((r) => r.status === "QUEUED" || r.status === "RETRYING") ? "QUEUED" : mine.length ? "READY" : "IDLE",
      active: running.length > 0 || recentlyActive,
      input: leadBased ? new Set(withLead.map((r) => r.lead_id)).size : mine.length,
      completed: leadBased ? new Set(withLead.filter((r) => r.status === "COMPLETED").map((r) => r.lead_id)).size : mine.filter((r) => r.status === "COMPLETED").length,
      attempts: mine.length,
      recovered: mine.filter((r) => r.status === "COMPLETED" && r.retry_count > 0).length,
      failed: mine.filter((r) => r.status === "FAILED").length,
      remaining: mine.filter((r) => r.status === "QUEUED" || r.status === "RUNNING" || r.status === "RETRYING").length,
      current: last?.lead_id ? leadName.get(last.lead_id) ?? null : null,
      lastAt: last?.completed_at ?? last?.started_at ?? null,
      elapsedMs: running[0]?.started_at ? now - new Date(running[0].started_at).getTime() : null,
      error: mine.find((r) => r.status === "FAILED" || r.status === "RETRYING")?.error ?? null,
    };
  });
  const activity = (pid ? audit.filter((a) => a.project_id === pid) : audit)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 14)
    .map((a) => ({ id: a.id, at: a.created_at, actor: a.actor, action: a.action, detail: a.detail, lead: a.lead_id ? leadName.get(a.lead_id) ?? null : null }));
  const pb = playbackState();
  return { nodes, activity, playback: { running: pb.running, step: pb.step, projectId: pb.projectId, log: pb.log.slice(-12), error: pb.error, waitingApproval: pb.waitingApproval }, ts: new Date().toISOString() };
}
export type OrchestratorStatus = Awaited<ReturnType<typeof orchestratorStatus>>;
