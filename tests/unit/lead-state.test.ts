import { describe, expect, it } from "vitest";
import { canTransition, transition } from "@/core/orchestrator/lead-state";

describe("lead state machine (§31, S10)", () => {
  it("follows the happy path", () => {
    const path = ["DISCOVERED", "RESEARCHING", "RESEARCHED", "QUALIFIED", "REVIEW", "DRAFTED", "APPROVED", "CONTACTED", "REPLIED", "OUTCOME_RECORDED"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });
  it("allows CONTACTED → OUTCOME_RECORDED (no response)", () => {
    expect(canTransition("CONTACTED", "OUTCOME_RECORDED")).toBe(true);
  });
  it("blocks skipping approval", () => {
    expect(() => transition("DRAFTED", "CONTACTED")).toThrow();
    expect(() => transition("REJECTED", "REVIEW")).toThrow();
  });
});
