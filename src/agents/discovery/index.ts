/**
 * Discovery Agent (Spec §12). Phase 2 — contract only in Phase 0.
 * Runs every configured LeadSourceAdapter and merges results.
 */
import { z } from "zod";
import { defineAgent } from "@/core/orchestrator/agent";
import { DiscoveryResult, ICPProfile } from "@/core/schemas";
import type { LeadSourceAdapter } from "@/adapters/sources";

export const DiscoveryInput = z.object({ icp: ICPProfile, limit: z.number().int().min(1).max(500).default(50) });

export function createDiscoveryAgent(sources: LeadSourceAdapter[]) {
  return defineAgent({
    name: "discovery",
    input: DiscoveryInput,
    output: z.array(DiscoveryResult),
    async run({ icp, limit }, ctx) {
      const all = await Promise.all(sources.map((s) => s.discover({ icp, limit }, ctx)));
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
