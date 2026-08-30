/**
 * Lead state machine (Spec §31 + v0.2 S10). Explicit transitions only.
 */
import type { LeadStatus } from "@/core/schemas";

const TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  DISCOVERED: ["RESEARCHING"],
  RESEARCHING: ["RESEARCHED", "DISCOVERED"],
  RESEARCHED: ["QUALIFIED", "REJECTED"],
  QUALIFIED: ["REVIEW", "REJECTED"],
  REJECTED: [],
  REVIEW: ["DRAFTED", "REJECTED"],
  DRAFTED: ["APPROVED", "REVIEW", "REJECTED"],
  APPROVED: ["CONTACTED"],
  CONTACTED: ["REPLIED", "OUTCOME_RECORDED"],
  REPLIED: ["OUTCOME_RECORDED"],
  OUTCOME_RECORDED: [],
};

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(public readonly from: LeadStatus, public readonly to: LeadStatus) {
    super(`Invalid lead transition ${from} → ${to}`);
  }
}

export function transition(from: LeadStatus, to: LeadStatus): LeadStatus {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
  return to;
}

export const LEAD_STATUS_ORDER: readonly LeadStatus[] = [
  "DISCOVERED", "RESEARCHING", "RESEARCHED", "QUALIFIED", "REVIEW", "DRAFTED", "APPROVED", "CONTACTED", "REPLIED", "OUTCOME_RECORDED", "REJECTED",
];
