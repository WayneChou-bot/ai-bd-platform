/**
 * LeadSourceAdapter (Spec §28, §12). Discovery consumes these; it never
 * scrapes arbitrary sites. V1 sources: fixture pool (demo), manual, CSV,
 * search API (Tavily), GitHub public metadata.
 */
import type { DiscoveryResult, ICPProfile } from "@/core/schemas";
import type { AppConfig } from "@/lib/config";
import type { LLMProvider } from "@/adapters/llm/types";
import type { ProductContext, RawSearchResult } from "./search-screen";
import { fetchJson } from "@/adapters/http/fetch-json";

export interface DiscoveryQuery {
  icp: ICPProfile;
  limit: number;
  /** Names/websites already in the project — adapters should skip them. */
  exclude?: Set<string>;
  /** The project's own domains — a product must never discover itself. */
  selfDomains?: string[];
  /** What is being sold — screening excludes the vendor and its competitors. */
  product?: ProductContext;
}

export const hostOf = (u: string): string | null => {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
};
const hostMatches = (host: string | null, domains: string[]) => !!host && domains.some((d) => host === d || host.endsWith(`.${d}`));

export interface LeadSourceAdapter {
  readonly source: DiscoveryResult["source"];
  discover(query: DiscoveryQuery, ctx: { now: () => Date }): Promise<DiscoveryResult[]>;
}

export const keyOf = (r: { website?: string; company_name: string }) => (r.website ?? r.company_name).toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");

// ---------------------------------------------------------------------------
export class ManualAdapter implements LeadSourceAdapter {
  readonly source: DiscoveryResult["source"];
  constructor(private readonly items: DiscoveryResult[], source: DiscoveryResult["source"] = "manual") { this.source = source; }
  async discover(q: DiscoveryQuery) { return this.items.filter((i) => !q.exclude?.has(keyOf(i))).slice(0, q.limit); }
}

// ---------------------------------------------------------------------------
/** CSV with headers: company_name, website, entity_type?, reason? */
export class CSVAdapter implements LeadSourceAdapter {
  readonly source = "csv" as const;
  constructor(private readonly csv: string) {}
  async discover(q: DiscoveryQuery, ctx: { now: () => Date }): Promise<DiscoveryResult[]> {
    const [header, ...rows] = this.csv.trim().split(/\r?\n/);
    const cols = header.split(",").map((c) => c.trim().toLowerCase());
    const idx = (n: string) => cols.indexOf(n);
    const out: DiscoveryResult[] = [];
    for (const row of rows) {
      const cells = row.split(",").map((c) => c.trim());
      const name = cells[idx("company_name")];
      if (!name) continue;
      const website = cells[idx("website")] || undefined;
      const r: DiscoveryResult = {
        company_name: name,
        entity_type: (cells[idx("entity_type")] as "company" | "individual") || "company",
        website: website && /^https?:\/\//.test(website) ? website : undefined,
        source: "csv",
        discovery_reason: cells[idx("reason")] || "Imported from CSV",
        initial_signals: [],
        discovered_at: ctx.now().toISOString(),
      };
      if (q.exclude?.has(keyOf(r))) continue;
      out.push(r);
      if (out.length >= q.limit) break;
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
/**
 * Tavily search API (LIVE). One query per ICP positive signal + industry.
 *
 * A search hit is a PAGE, not a company (field test: an IBM think-piece and a
 * ZipRecruiter job listing both became "leads"). Raw hits are therefore
 * filtered (aggregator domains, the project's own domains) and then screened
 * by the LLM (search-screen.ts), which extracts only organizations genuinely
 * present in the material. Without an LLM the adapter falls back to the old
 * title heuristic — clearly marked as unscreened.
 */
const AGGREGATOR_DOMAINS = [
  "linkedin.com", "glassdoor.com", "indeed.com", "ziprecruiter.com", "monster.com", "dice.com",
  "wikipedia.org", "crunchbase.com", "reddit.com", "medium.com", "youtube.com", "twitter.com", "x.com",
  "facebook.com", "instagram.com", "tiktok.com", "pinterest.com", "quora.com", "stackoverflow.com",
  "google.com", "bing.com",
];

export class TavilySearchAdapter implements LeadSourceAdapter {
  readonly source = "search" as const;
  constructor(private readonly apiKey: string, private readonly llm?: LLMProvider) {}

  /** Search-hit counts of the last discover() call — surfaced in the run summary. */
  lastStats: { rawHits: number; screened: number; failedQueries: number } | null = null;

  buildQueries(icp: ICPProfile, product?: ProductContext): string[] {
    // Queries must target BUYER industries. If the ICP lists the vendor's own
    // category first ("Cloud Computing" for a cloud platform), searching
    // "Cloud Computing company hiring…" returns competitors — skip it.
    const own = product?.category?.toLowerCase() ?? "";
    const isOwnCategory = (i: string) => !!own && (own.includes(i.toLowerCase()) || i.toLowerCase().includes(own));
    // Rotate through the buyer industries so one round covers several of them
    // (field test: only industries[0] was used — 8 of 8 candidates were finance).
    const inds = icp.industries.filter((i) => !isOwnCategory(i));
    const indAt = (n: number) => (inds.length ? inds[n % inds.length] : "");
    const qs = icp.positive_signals.slice(0, 4).map((s, n) => `${indAt(n)} company ${s}`.trim());
    if (icp.technologies.length) qs.push(`${indAt(qs.length)} companies using ${icp.technologies.slice(0, 2).join(" ")}`);
    return qs;
  }

  private async rawResults(icp: ICPProfile, selfDomains: string[], product?: ProductContext): Promise<{ raw: RawSearchResult[]; failedQueries: number; lastError?: Error }> {
    const raw: RawSearchResult[] = [];
    const seenUrl = new Set<string>(); // the same page often answers several queries — send it to the screen once
    let failedQueries = 0;
    let lastError: Error | undefined;
    // Queries settle independently: one timeout must not discard what the
    // other queries already found (external review v5).
    for (const query of this.buildQueries(icp, product)) {
      let json: { results?: Array<{ title: string; url: string; content: string }> };
      try {
        json = await fetchJson<{ results?: Array<{ title: string; url: string; content: string }> }>("Tavily search", "https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({ query, max_results: 8, search_depth: "basic" }),
        });
      } catch (e) {
        failedQueries++; lastError = e as Error; continue;
      }
      for (const r of json.results ?? []) {
        const host = hostOf(r.url);
        if (!host || hostMatches(host, AGGREGATOR_DOMAINS) || hostMatches(host, selfDomains)) continue;
        if (seenUrl.has(r.url)) continue;
        seenUrl.add(r.url);
        raw.push({ title: r.title, url: r.url, content: r.content, query });
      }
    }
    return { raw, failedQueries, lastError };
  }

  async discover(q: DiscoveryQuery, ctx: { now: () => Date }): Promise<DiscoveryResult[]> {
    const selfDomains = q.selfDomains ?? [];
    const { raw, failedQueries, lastError } = await this.rawResults(q.icp, selfDomains, q.product);
    // All queries failing IS a source failure — surface it, don't return a silent zero.
    if (failedQueries > 0 && raw.length === 0 && lastError) throw lastError;
    const seen = new Set<string>(q.exclude ?? []);
    const out: DiscoveryResult[] = [];
    this.lastStats = { rawHits: raw.length, screened: 0, failedQueries };

    if (this.llm) {
      const { screenSearchResults } = await import("./search-screen");
      const screened = await screenSearchResults(this.llm, q.icp, raw, q.limit, q.product);
      this.lastStats.screened = screened.length;
      for (const c of screened) {
        if (hostMatches(c.website ? hostOf(c.website) : null, selfDomains)) continue;
        const key = keyOf({ website: c.website, company_name: c.company_name });
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          company_name: c.company_name,
          entity_type: "company",
          website: c.website,
          source: "search",
          discovery_reason: `LLM-screened from search — ${c.reason} (found in ${c.source_url})`.slice(0, 400),
          initial_signals: [],
          discovered_at: ctx.now().toISOString(),
        });
        if (out.length >= q.limit) break;
      }
      return out;
    }

    // Fallback without an LLM: the old title heuristic, honestly labelled.
    this.lastStats.screened = raw.length;
    for (const r of raw) {
      const host = hostOf(r.url)!;
      const website = `https://${host}`;
      const key = keyOf({ website, company_name: host });
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        company_name: (r.title.split(/[|\-–—:]/)[0] || host).trim().slice(0, 80),
        entity_type: "company",
        website,
        source: "search",
        discovery_reason: `Unscreened search hit (no LLM available): "${r.query}"`,
        initial_signals: [r.content.slice(0, 160)],
        discovered_at: ctx.now().toISOString(),
      });
      if (out.length >= q.limit) break;
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
/** GitHub public repository search (LIVE). Token optional but raises rate limits. */
type GitHubRepo = { full_name: string; html_url: string; description: string | null; homepage: string | null; stargazers_count: number; owner: { login: string; type: string; html_url: string } };

export class GitHubAdapter implements LeadSourceAdapter {
  readonly source = "github" as const;
  constructor(private readonly token?: string) {}

  /** Per-round stats — a silent zero was indistinguishable from "no query" (external review v5). */
  lastStats: { queries: number; rawRepos: number; candidates: number; failedQueries: number } | null = null;

  /** One query per term — three terms ANDed together plus stars:>50 almost always found nothing. */
  buildQueries(icp: ICPProfile): string[] {
    return [...icp.technologies, ...icp.business_problems].slice(0, 3).filter(Boolean)
      .map((term) => `${term} stars:>10`);
  }

  async discover(q: DiscoveryQuery, ctx: { now: () => Date }): Promise<DiscoveryResult[]> {
    const queries = this.buildQueries(q.icp);
    this.lastStats = { queries: queries.length, rawRepos: 0, candidates: 0, failedQueries: 0 };
    if (!queries.length) return [];
    const seen = new Set<string>(q.exclude ?? []);
    const out: DiscoveryResult[] = [];
    let lastError: Error | undefined;
    for (const query of queries) {
      let json: { items?: GitHubRepo[] };
      try {
        json = await fetchJson<{ items?: GitHubRepo[] }>("GitHub search",
          `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&per_page=${Math.min(15, q.limit * 2)}`,
          { headers: { Accept: "application/vnd.github+json", "User-Agent": "ai-bd-platform", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) } });
      } catch (e) {
        this.lastStats.failedQueries++; lastError = e as Error; continue;
      }
      for (const it of json.items ?? []) {
        this.lastStats.rawRepos++;
        const isOrg = it.owner.type === "Organization";
        const website = it.homepage && /^https?:\/\//.test(it.homepage) ? it.homepage : it.owner.html_url;
        const r: DiscoveryResult = {
          company_name: it.owner.login,
          entity_type: isOrg ? "company" : "individual",
          website,
          source: "github",
          discovery_reason: `GitHub: ${it.full_name} (${it.stargazers_count}★) matches "${query}"`,
          initial_signals: [it.description ?? ""].filter(Boolean),
          discovered_at: ctx.now().toISOString(),
        };
        const key = keyOf(r);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
        this.lastStats.candidates++;
        if (out.length >= q.limit) return out;
      }
    }
    if (this.lastStats.failedQueries === queries.length && lastError) throw lastError;
    return out;
  }
}

// ---------------------------------------------------------------------------
export async function createSourceAdapters(cfg: AppConfig, llm?: LLMProvider): Promise<LeadSourceAdapter[]> {
  if (cfg.mode === "demo") {
    const { FixturePoolAdapter } = await import("./fixture-pool");
    return [new FixturePoolAdapter()];
  }
  const adapters: LeadSourceAdapter[] = [];
  if (cfg.searchApiKey) adapters.push(new TavilySearchAdapter(cfg.searchApiKey, llm));
  adapters.push(new GitHubAdapter(cfg.githubToken));
  return adapters;
}
