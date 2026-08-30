/**
 * DEMO discovery source: the hand-authored seed universe, ranked by keyword
 * overlap with the ICP. Lets a visitor create a brand-new project and still
 * watch Discover → Research → Qualify run with zero external calls.
 */
import { COMPANIES, type CompanySeed } from "../../../fixtures/demo/companies";
import type { DiscoveryResult, ICPProfile } from "@/core/schemas";
import { keyOf, type DiscoveryQuery, type LeadSourceAdapter } from "./index";

export const seedWebsite = (c: CompanySeed) => `https://${c.slug}.example.com`;

export function seedByName(name: string): CompanySeed | undefined {
  const n = name.toLowerCase();
  return COMPANIES.find((c) => c.name.toLowerCase() === n || c.slug === n || n.includes(c.slug));
}

function tokens(s: string) { return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3)); }

export function rankSeeds(icp: ICPProfile): Array<{ seed: CompanySeed; score: number }> {
  const want = tokens([...icp.industries, ...icp.technologies, ...icp.positive_signals, ...icp.business_problems, ...icp.target_roles].join(" "));
  return COMPANIES.map((seed) => {
    const have = tokens([seed.industry, seed.reason, ...seed.evidence.map((e) => e.claim)].join(" "));
    let score = 0;
    for (const t of want) if (have.has(t)) score++;
    if (icp.target_entity === "company" && seed.entity_type === "individual") score -= 5;
    if (icp.target_entity === "individual" && seed.entity_type !== "individual") score -= 5;
    return { seed, score };
  }).sort((a, b) => b.score - a.score);
}

export class FixturePoolAdapter implements LeadSourceAdapter {
  readonly source = "fixture" as const;
  async discover(q: DiscoveryQuery, ctx: { now: () => Date }): Promise<DiscoveryResult[]> {
    const out: DiscoveryResult[] = [];
    for (const { seed } of rankSeeds(q.icp)) {
      const r: DiscoveryResult = {
        company_name: seed.name,
        entity_type: seed.entity_type ?? "company",
        website: seedWebsite(seed),
        source: seed.source,
        discovery_reason: seed.reason,
        initial_signals: seed.evidence.slice(0, 2).map((e) => e.claim),
        discovered_at: ctx.now().toISOString(),
      };
      if (q.exclude?.has(keyOf(r))) continue;
      out.push(r);
      if (out.length >= q.limit) break;
    }
    return out;
  }
}
