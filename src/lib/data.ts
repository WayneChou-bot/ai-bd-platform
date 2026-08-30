/** Server-side data access for pages. */
import { getConfig } from "@/lib/config";
import { getRepository } from "@/lib/repository";
import { POSITIVE_OUTCOMES, type AgentName } from "@/core/schemas";
import { latestOutcomes } from "@/agents/learning";

export async function repo() {
  return getRepository(getConfig());
}

export async function overviewMetrics() {
  const r = await repo();
  const [leads, quals, drafts, receipts, events, outcomes] = await Promise.all([
    r.leads(), r.qualifications(), r.drafts(), r.receipts(), r.inboundEvents(), r.outcomes(),
  ]);
  const latest = latestOutcomes(outcomes);
  const qualified = quals.filter((q) => q.classification === "HIGH_FIT" || q.classification === "MEDIUM_FIT").length;
  const reviewed = leads.filter((l) => !["DISCOVERED", "RESEARCHING", "RESEARCHED", "QUALIFIED", "REJECTED"].includes(l.status)).length;
  const approved = drafts.filter((d) => d.status === "APPROVED" || d.status === "SENT").length;
  const contacted = receipts.filter((x) => !x.error).length;
  const replies = new Set(events.map((e) => e.lead_id)).size;
  const positive = [...latest.values()].filter((o) => POSITIVE_OUTCOMES.has(o.outcome)).length;
  return {
    discovered: leads.length, qualified, reviewed, approved, contacted, replies, positive,
    positiveRate: contacted ? Math.round((positive / contacted) * 1000) / 10 : 0,
    qualifiedToPositive: qualified ? Math.round((positive / qualified) * 1000) / 10 : 0,
  };
}

export const AGENTS: Array<{ key: AgentName; label: string; tone: "discover" | "research" | "qualify" | "engage" | "reply" | "learn"; blurb: string }> = [
  { key: "discovery", label: "Discovery Agent", tone: "discover", blurb: "Finds candidates from controlled sources" },
  { key: "research", label: "Research Agent", tone: "research", blurb: "Enriches each lead with cited evidence" },
  { key: "qualification", label: "Qualification Agent", tone: "qualify", blurb: "Deterministic score + explanation" },
  { key: "outreach", label: "Outreach Agent", tone: "engage", blurb: "Drafts grounded messages for human approval" },
  { key: "reply", label: "Reply Agent", tone: "reply", blurb: "Classifies inbound replies into outcomes" },
  { key: "learning", label: "Learning Agent", tone: "learn", blurb: "Analyzes outcomes; no model training" },
];

export async function agentStatus() {
  const r = await repo();
  const runs = await r.agentRuns();
  return AGENTS.map((a) => {
    const mine = runs.filter((x) => x.agent === a.key);
    const running = mine.some((x) => x.status === "RUNNING");
    const queued = mine.filter((x) => x.status === "QUEUED").length;
    const failed = mine.filter((x) => x.status === "FAILED").length;
    const completed = mine.filter((x) => x.status === "COMPLETED").length;
    const status = running ? "RUNNING" : queued ? "QUEUED" : failed && !completed ? "FAILED" : "READY";
    return { ...a, status, completed, failed, queued, total: mine.length };
  });
}
