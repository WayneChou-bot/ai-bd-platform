/**
 * One failing source must not discard the others' candidates; the failure
 * is reported, and only an all-sources failure fails the run (field test:
 * a bare "fetch failed" wiped a whole discovery round).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { createDiscoveryAgent, type SourceFailure } from "@/agents/discovery";
import { ManualAdapter, type LeadSourceAdapter } from "@/adapters/sources";
import { fetchJson, UpstreamError } from "@/adapters/http/fetch-json";
import type { ICPProfile } from "@/core/schemas";

const icp: ICPProfile = {
  id: "icp_t", project_id: "proj_t", source: "manual", target_entity: "company",
  industries: ["Logistics"], regions: [], technologies: [], target_roles: ["COO"],
  business_problems: [], positive_signals: ["hiring"], negative_signals: [], created_at: new Date().toISOString(),
};
const ctx = { llm: undefined as never, now: () => new Date(), newId: (p: string) => `${p}_1` };
const ok = new ManualAdapter([{ company_name: "Acme Logistics", entity_type: "company", website: "https://acme.example", source: "manual", discovery_reason: "manual", initial_signals: [], discovered_at: new Date().toISOString() }]);
const broken: LeadSourceAdapter = { source: "github", async discover() { throw new Error("GitHub search: request failed (ENOTFOUND — getaddrinfo ENOTFOUND api.github.com)"); } };

afterEach(() => vi.unstubAllGlobals());

describe("discovery resilience", () => {
  it("keeps the healthy source's candidates and reports the failed one", async () => {
    const failures: SourceFailure[] = [];
    const agent = createDiscoveryAgent([ok, broken], (f) => failures.push(f));
    const out = await agent.run({ icp, limit: 10 }, ctx);
    expect(out.map((o) => o.company_name)).toEqual(["Acme Logistics"]);
    expect(failures).toEqual([{ source: "github", error: expect.stringContaining("ENOTFOUND") }]);
  });

  it("fails the run only when every source fails, naming each", async () => {
    const agent = createDiscoveryAgent([broken, broken]);
    await expect(agent.run({ icp, limit: 10 }, ctx)).rejects.toThrow(/github: .*ENOTFOUND.* \| github: /);
  });
});

describe("fetchJson", () => {
  it("names the service and the network cause instead of a bare 'fetch failed'", async () => {
    const err = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET", message: "socket hang up" } });
    vi.stubGlobal("fetch", vi.fn(async () => { throw err; }));
    await expect(fetchJson("Tavily search", "https://api.tavily.com/search", {}, { retries: 1 })).rejects.toThrow("Tavily search: request failed (ECONNRESET — socket hang up)");
    expect(fetch).toHaveBeenCalledTimes(2); // one retry on a transient network error
  });

  it("does not retry a 4xx and reports the status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad key", { status: 401 })));
    await expect(fetchJson("Tavily search", "https://api.tavily.com/search")).rejects.toThrow(UpstreamError);
    await expect(fetchJson("Tavily search", "https://api.tavily.com/search")).rejects.toThrow("HTTP 401 — bad key");
    expect(fetch).toHaveBeenCalledTimes(2); // one call per invocation, no retry
  });
});
