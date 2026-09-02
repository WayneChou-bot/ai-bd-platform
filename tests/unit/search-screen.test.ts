/**
 * Search discovery screening (§12 fix — field test caught article titles and
 * job listings becoming "companies", and a project discovering itself).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockLLMProvider } from "@/adapters/llm";
import { TavilySearchAdapter } from "@/adapters/sources";
import type { ICPProfile } from "@/core/schemas";

const icp: ICPProfile = {
  id: "icp_test", project_id: "proj_test", source: "ai_suggested",
  industries: ["Technology"], company_size: { min: 11, max: 500 }, regions: ["Global"],
  technologies: ["cloud"], target_roles: ["CTO"],
  business_problems: ["cloud adoption"],
  positive_signals: ["Hiring for cloud-related positions"],
  negative_signals: [], target_entity: "company", created_at: new Date().toISOString(),
};

const tavilyResponse = {
  results: [
    // Article page — its TITLE must never become a company name.
    { title: "What Is Digital Transformation?", url: "https://www.ibm.com/topics/digital-transformation", content: "Acme Robotics and Northwind Cloud are adopting cloud platforms…" },
    // Job-board listing — aggregator domain, must be dropped before the LLM.
    { title: "Cloud Computing Jobs in Lexington, SC (NOW HIRING)", url: "https://www.ziprecruiter.com/Jobs/Cloud-Computing", content: "Apply now!" },
    // The project's own domain — a product must never discover itself.
    { title: "Cloud computing jobs", url: "https://aws.amazon.com/careers/", content: "Work at AWS." },
  ],
};

const ctx = { now: () => new Date() };
const stubFetch = () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(tavilyResponse), { status: 200 })));
};
afterEach(() => vi.unstubAllGlobals());

describe("Tavily discovery screening", () => {
  it("sends only non-aggregator, non-self results to the LLM and returns extracted organizations", async () => {
    stubFetch();
    let untrustedSeen = "";
    const llm = new MockLLMProvider().register("discovery.screen_search", ({ untrusted }) => {
      untrustedSeen = untrusted ?? "";
      return {
        companies: [
          { company_name: "Acme Robotics", website: "https://acmerobotics.example", reason: "named as adopting cloud platforms", source_url: "https://www.ibm.com/topics/digital-transformation" },
          { company_name: "Acme Robotics", website: "https://acmerobotics.example", reason: "duplicate", source_url: "https://www.ibm.com/topics/digital-transformation" },
          { company_name: "AWS", website: "https://aws.amazon.com", reason: "self", source_url: "https://aws.amazon.com/careers/" },
        ],
      };
    });
    const adapter = new TavilySearchAdapter("key", llm);
    const out = await adapter.discover({ icp, limit: 10, selfDomains: ["amazon.com"] }, ctx);

    // Aggregator and self-domain pages never even reach the LLM.
    expect(untrustedSeen).toContain("ibm.com");
    expect(untrustedSeen).not.toContain("ziprecruiter");
    expect(untrustedSeen).not.toContain("aws.amazon.com");

    // Extracted org — deduped, self-domain candidate dropped, reason traceable.
    expect(out.map((o) => o.company_name)).toEqual(["Acme Robotics"]);
    expect(out[0].discovery_reason).toContain("LLM-screened");
    expect(out[0].discovery_reason).toContain("ibm.com");
  });

  it("never turns a page title into a company when the LLM finds nothing", async () => {
    stubFetch();
    const llm = new MockLLMProvider().register("discovery.screen_search", () => ({ companies: [] }));
    const adapter = new TavilySearchAdapter("key", llm);
    const out = await adapter.discover({ icp, limit: 10 }, ctx);
    expect(out).toEqual([]);
  });

  it("falls back to the title heuristic without an LLM, honestly labelled as unscreened", async () => {
    stubFetch();
    const adapter = new TavilySearchAdapter("key");
    const out = await adapter.discover({ icp, limit: 10, selfDomains: ["amazon.com"] }, ctx);
    expect(out).toHaveLength(1); // ziprecruiter + self domain still filtered
    expect(out[0].website).toBe("https://ibm.com");
    expect(out[0].discovery_reason).toContain("Unscreened");
  });
});
