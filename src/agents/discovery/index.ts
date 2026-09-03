/**
 * Discovery Agent (Spec §12). Phase 2 — contract only in Phase 0.
 * Runs every configured LeadSourceAdapter and merges results.
 */
import { z } from "zod";
import { defineAgent } from "@/core/orchestrator/agent";
import { DiscoveryResult, ICPProfile } from "@/core/schemas";
import type { LeadSourceAdapter } from "@/adapters/sources";

export const DiscoveryInput = z.object({ icp: ICPProfile, limit: z.number().int().min(1).max(500).default(50) });

export interface SourceFailure { source: string; error: string }

/**
 * Sources run independently: one failing adapter must not discard what the
 * others found (field test: a single "fetch failed" from one source wiped
 * the whole round). Failures are reported through `onSourceError` so the
 * caller can put them on the run row — visible, never hidden (§23). Only
 * when EVERY source fails does the run itself fail.
 */
export function createDiscoveryAgent(sources: LeadSourceAdapter[], onSourceError?: (f: SourceFailure) => void) {
  return defineAgent({
    name: "discovery",
    input: DiscoveryInput,
    output: z.array(DiscoveryResult),
    async run({ icp, limit }, ctx) {
      const settled = await Promise.allSettled(sources.map((s) => s.discover({ icp, limit }, ctx)));
      const failures: SourceFailure[] = [];
      const all: DiscoveryResult[][] = [];
      settled.forEach((r, i) => {
        if (r.status === "fulfilled") all.push(r.value);
        else { const f = { source: sources[i].source, error: (r.reason as Error)?.message ?? String(r.reason) }; failures.push(f); onSourceError?.(f); }
      });
      if (sources.length > 0 && failures.length === sources.length) {
        throw new Error(failures.map((f) => `${f.source}: ${f.error}`).join(" | "));
      }
      const seen = new Set<string>();
      const merged: DiscoveryResult[] = [];
      for (const r of all.flat()) {
        const key = (r.website ?? r.company_name).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(r);
      }
      return merged.slice(0, limit);
    },
  });
}
