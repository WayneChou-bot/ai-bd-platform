/**
 * Mention source adapters (Spec v0.3 §13–§16, §44). Same rule as lead
 * sources: Search API / official API / HTTP fetch only — browser automation
 * is not a data acquisition layer. All adapters return the uniform
 * SourceDocument; downstream code never knows how a page was fetched (§12).
 */
import { fetchJson } from "@/adapters/http/fetch-json";
import { SourceDocument } from "@/core/schemas";
import { detectLanguage } from "@/core/mention";
import type { AppConfig } from "@/lib/config";
import fixturePool from "../../../fixtures/demo/mentions.json";

export interface MentionSourceAdapter {
  readonly name: string;
  search(query: string, ctx: { now: () => Date }): Promise<SourceDocument[]>;
}

// ---------------------------------------------------------------------------
/** DEMO: a hand-written public-web pool. Signals are still computed by the
 *  real engine — the fixture holds documents, never conclusions. */
export class FixtureMentionAdapter implements MentionSourceAdapter {
  readonly name = "fixture-pool";
  async search(_query: string, ctx: { now: () => Date }): Promise<SourceDocument[]> {
    return (fixturePool.documents as Array<Record<string, unknown>>).map((d) =>
      SourceDocument.parse({ ...d, language: detectLanguage(`${d.title}\n${d.content}`), retrieved_at: ctx.now().toISOString() }),
    );
  }
}

// ---------------------------------------------------------------------------
/** LIVE: Tavily web search — one call per query, results become documents. */
export class TavilyMentionAdapter implements MentionSourceAdapter {
  readonly name = "tavily";
  constructor(private readonly apiKey: string) {}
  async search(query: string, ctx: { now: () => Date }): Promise<SourceDocument[]> {
    const json = await fetchJson<{ results?: Array<{ title: string; url: string; content: string }> }>("Tavily search", "https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ query, max_results: 8, search_depth: "basic" }),
    });
    const out: SourceDocument[] = [];
    for (const r of json.results ?? []) {
      let host: string;
      try { host = new URL(r.url).hostname.replace(/^www\./, ""); } catch { continue; }
      const source_type = host === "github.com" ? "github" : host === "youtube.com" ? "youtube" : host === "reddit.com" ? "reddit" : "blog";
      out.push(SourceDocument.parse({
        url: r.url, title: r.title, content: r.content, source_type,
        language: detectLanguage(`${r.title}\n${r.content}`), retrieved_at: ctx.now().toISOString(),
      }));
    }
    return out;
  }
}

/** Fetching priority (§44): search API first; fixture pool in demo. Browser
 *  automation deliberately absent. */
export function createMentionAdapters(cfg: AppConfig): MentionSourceAdapter[] {
  if (cfg.mode === "demo") return [new FixtureMentionAdapter()];
  return cfg.searchApiKey ? [new TavilyMentionAdapter(cfg.searchApiKey)] : [];
}
