/**
 * Lead state machine (Spec §31 + v0.2 S10). Explicit transitions only.
 */
import type { LeadStatus } from "@/core/schemas";

const TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  DISCOVERED: ["RESEARCHING"],
  RESEARCHING: ["RESEARCHED", "DISCOVERED"],
  // Re-research is a first-class edge (external review v6 F10): the UI offers
  // it for RESEARCHED, QUALIFIED and REJECTED leads, so the machine must too.
  RESEARCHED: ["QUALIFIED", "REJECTED", "RESEARCHING"],
  QUALIFIED: ["REVIEW", "REJECTED", "RESEARCHING"],
  REJECTED: ["RESEARCHING"],
  REVIEW: ["DRAFTED", "REJECTED"],
  DRAFTED: ["APPROVED", "REVIEW", "REJECTED"],
  // APPROVED → DRAFTED: a delivery failure hands the draft back for another
  // attempt instead of stranding the lead (external review v6 F06).
  APPROVED: ["CONTACTED", "DRAFTED"],
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
