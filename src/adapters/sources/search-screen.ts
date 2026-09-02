/**
 * Search-result screening (§12 fix, external review v4 / field test).
 *
 * A web search hit is a PAGE, not a company: without screening, an IBM
 * think-piece titled "What Is Digital Transformation?" becomes a "lead" with
 * that title as its name. The LLM reads the untrusted results and extracts
 * only organizations genuinely present in them — as the page's owner or
 * named in its content — so a page title is never a company.
 */
import { z } from "zod";
import type { LLMProvider } from "@/adapters/llm/types";
import { Url, type ICPProfile } from "@/core/schemas";

export interface RawSearchResult {
  title: string;
  url: string;
  content: string;
  /** the search query that produced this hit */
  query: string;
}

export const ScreenedCompany = z.object({
  company_name: z.string().min(1).max(120).describe("Official organization name, never a page or article title"),
  website: Url.optional().describe("The organization's own site, only when clearly derivable from the material"),
  reason: z.string().min(1).max(300).describe("Why this organization plausibly matches the ICP, grounded in the material"),
  source_url: Url.describe("URL of the search result this organization was found in"),
});
export type ScreenedCompany = z.infer<typeof ScreenedCompany>;

const ScreenOutput = z.object({ companies: z.array(ScreenedCompany).max(40) });

export async function screenSearchResults(
  llm: LLMProvider,
  icp: ICPProfile,
  results: RawSearchResult[],
  limit: number,
): Promise<ScreenedCompany[]> {
  if (!results.length) return [];
  const { data } = await llm.generateStructured({
    task: "discovery.screen_search",
    system:
      "You are screening web-search results to build a B2B prospect candidate list. " +
      "From the untrusted search results, extract ORGANIZATIONS that could plausibly match the ICP — either the organization that owns the page, or organizations named in the content. " +
      "A page title is NEVER an organization: skip articles, guides, job listings, directories, and news pieces themselves (though companies mentioned INSIDE them count). " +
      "Skip job boards, media outlets, encyclopedias, universities, and government bodies as candidates. " +
      "Use official organization names. Give a website only when the material makes it clear. " +
      "If nothing qualifies, return an empty list — an empty list is a correct answer.",
    prompt: JSON.stringify({
      icp: {
        industries: icp.industries,
        technologies: icp.technologies,
        target_roles: icp.target_roles,
        business_problems: icp.business_problems,
        positive_signals: icp.positive_signals,
        negative_signals: icp.negative_signals,
      },
      max_candidates: limit,
    }),
    // The provider fences untrusted content itself (§44) — pass it raw.
    untrusted: results
      .map((r, i) => `[result ${i + 1}] query: "${r.query}"\ntitle: ${r.title}\nurl: ${r.url}\n${r.content.slice(0, 400)}`)
      .join("\n\n"),
    schema: ScreenOutput,
  });
  // Dedupe by name (the model may find the same org in several results).
  const seen = new Set<string>();
  const out: ScreenedCompany[] = [];
  for (const c of data.companies) {
    const key = c.company_name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
