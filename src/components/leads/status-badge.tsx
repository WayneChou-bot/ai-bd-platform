import { Badge, type Tone } from "@/components/ui/badge";
import type { LeadStatus, OutcomeKind, ReplyOutcome } from "@/core/schemas";

const tone: Record<LeadStatus, Tone> = {
  DISCOVERED: "discover", RESEARCHING: "research", RESEARCHED: "research", QUALIFIED: "qualify", REJECTED: "danger",
  REVIEW: "neutral", DRAFTED: "engage", APPROVED: "engage", CONTACTED: "engage", REPLIED: "reply", OUTCOME_RECORDED: "learn",
};

/** Business-facing status. Pass `t` to localize; pass `outcome` to render the
 *  actual result (e.g. "interested") instead of the internal OUTCOME_RECORDED
 *  state — the underlying event stays visible in the lead's Activity tab. */
export function StatusBadge({ s, t, outcome }: { s: LeadStatus; t?: (k: string) => string; outcome?: OutcomeKind | ReplyOutcome }) {
  const tt = t ?? ((k: string) => k);
  if (s === "OUTCOME_RECORDED" && outcome) {
    const positive = ["interested", "meeting_requested", "positive_reply"].includes(outcome);
    const negative = ["negative_reply", "not_relevant"].includes(outcome);
    return <Badge tone={positive ? "engage" : negative ? "danger" : "learn"} title={tt("OUTCOME RECORDED")}>{tt(outcome)}</Badge>;
  }
  return <Badge tone={tone[s]}>{tt(s.replace("_", " "))}</Badge>;
}
