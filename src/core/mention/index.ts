/**
 * Mention engine (Spec v0.3 §18, §24, §30, §31). Pure, deterministic,
 * LLM-free — same philosophy as core/scoring: the numbers come from an
 * auditable table, never from a model.
 */
import type { IntentLevel, MentionContext, Sentiment, SignalType, SourceDocument, TrackedEntity, TrackedEntityKind } from "@/core/schemas";

// ---------------------------------------------------------------------------
// Confidence (§24) — additive table, capped at 100. Prevents the "product
// named Atlas" false-positive flood: a bare keyword hit scores 25 → Ignore.
// ---------------------------------------------------------------------------

export const MENTION_POINTS = {
  exact_url: 40,
  exact_identifier: 40, // e.g. the repo "WayneChou-bot/WareTwin"
  canonical_name: 25,
  alias: 15,
  context_topic: 25, // any tracked keyword appears near the name — name + topic (50) reaches Review, never higher (v0.3 amendment, field test)
  domain_match: 25, // a THIRD-PARTY document links to / cites the entity's own domain (v0.3 amendment: self-published pages are not mentions)
} as const;

/** Hosts shared by many unrelated entities — a page there is never "the entity's own site". */
const SHARED_HOSTS = ["github.com", "gitlab.com", "bitbucket.org", "medium.com", "substack.com", "notion.site", "wordpress.com", "blogspot.com"];

/** The entity's own domain, or null when its canonical URL sits on a shared host. */
export function entityOwnDomain(entity: TrackedEntity): string | null {
  const d = entity.canonical_url ? domainOf(entity.canonical_url) : null;
  if (!d) return null;
  return SHARED_HOSTS.some((h) => d === h || d.endsWith(`.${h}`)) ? null : d;
}

/**
 * Self-published: the document lives on the entity's own site (or, for a
 * shared-host entity such as a GitHub repo, under its own canonical URL).
 * A vendor talking about itself is not a public mention (field test: AWS's
 * marketing and certification pages filled the signal list at 75).
 */
export function isSelfPublished(doc: Pick<SourceDocument, "url">, entity: TrackedEntity): boolean {
  const own = entityOwnDomain(entity);
  const docDomain = domainOf(doc.url);
  if (own && docDomain && (docDomain === own || docDomain.endsWith(`.${own}`))) return true;
  return !!entity.canonical_url && !own && doc.url.toLowerCase().startsWith(entity.canonical_url.toLowerCase());
}

export type MentionBand = "confirmed" | "likely" | "review" | "ignore";
export function mentionBand(score: number): MentionBand {
  return score >= 90 ? "confirmed" : score >= 70 ? "likely" : score >= 50 ? "review" : "ignore";
}

export interface MentionMatch {
  score: number;
  band: MentionBand;
  matched: Array<keyof typeof MENTION_POINTS>;
}

const norm = (s: string) => s.toLowerCase();
const domainOf = (url: string): string | null => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
};

export function mentionConfidence(doc: Pick<SourceDocument, "url" | "title" | "content">, entity: TrackedEntity): MentionMatch {
  const text = norm(`${doc.title}\n${doc.content}`);
  const matched: Array<keyof typeof MENTION_POINTS> = [];

  if (entity.canonical_url && (doc.url.startsWith(entity.canonical_url) || text.includes(norm(entity.canonical_url)))) matched.push("exact_url");
  if (entity.identifiers.some((id) => id && text.includes(norm(id)))) matched.push("exact_identifier");
  if (text.includes(norm(entity.canonical_name))) matched.push("canonical_name");
  if (entity.aliases.some((a) => a && text.includes(norm(a)))) matched.push("alias");
  if (entity.keywords.some((k) => k && text.includes(norm(k)))) matched.push("context_topic");
  const own = entityOwnDomain(entity);
  if (own && !isSelfPublished(doc, entity) && text.includes(own)) matched.push("domain_match");

  const score = Math.min(100, matched.reduce((sum, k) => sum + MENTION_POINTS[k], 0));
  return { score, band: mentionBand(score), matched };
}

export const signalTypeFor = (kind: TrackedEntityKind): SignalType =>
  kind === "repository" ? "repository_mention" : kind === "company" ? "company_mention" : kind === "technology" ? "technology_signal" : "product_mention";

// ---------------------------------------------------------------------------
// Language detection (§18) — script-range heuristic. Original text is always
// kept; translation is display-only (§39, §40).
// ---------------------------------------------------------------------------

export function detectLanguage(text: string): string {
  const sample = text.slice(0, 2000);
  const count = (re: RegExp) => (sample.match(re) ?? []).length;
  const kana = count(/[぀-ヿ]/g);
  const han = count(/[一-鿿]/g);
  const hangul = count(/[가-힯]/g);
  const cyrillic = count(/[Ѐ-ӿ]/g);
  const letters = count(/[a-z]/gi) + kana + han + hangul + cyrillic;
  if (letters === 0) return "en";
  if (kana / letters > 0.05) return "ja"; // kana is unambiguous — Japanese even with heavy kanji
  if (hangul / letters > 0.2) return "ko";
  if (han / letters > 0.2) return "zh";
  if (cyrillic / letters > 0.3) return "ru";
  return "en";
}

// ---------------------------------------------------------------------------
// Context / sentiment / intent (§30, §31) — keyword heuristics over the
// snippet around the match. Sentiment ≠ intent: "looks great" is positive
// with no intent; "we are evaluating" is neutral with high intent.
// ---------------------------------------------------------------------------

const RULES: Array<{ re: RegExp; context: MentionContext; sentiment: Sentiment; intent: IntentLevel }> = [
  { re: /\b(evaluat|assess|trial|pilot|proof of concept|poc\b)|評估|導入評估|検討/i, context: "evaluation", sentiment: "neutral", intent: "high" },
  { re: /\b(adopted|migrated to|now using|in production with|deployed)\b|已導入|採用/i, context: "adoption", sentiment: "positive", intent: "medium" },
  { re: /\b(vs\.?|versus|compared? (to|with)|alternative)\b|比較|相比/i, context: "comparison", sentiment: "neutral", intent: "medium" },
  { re: /\b(recommend|worth (a look|trying)|check(ing)? (it )?out)|推薦|值得/i, context: "recommendation", sentiment: "positive", intent: "low" },
  { re: /\b(did not support|doesn'?t support|failed|lacked|disappoint|but it)\b|不支援|失敗|可惜/i, context: "criticism", sentiment: "negative", intent: "low" },
  { re: /\?|how (do|can|to)|怎麼|如何|嗎[?？]?/i, context: "question", sentiment: "neutral", intent: "low" },
  { re: /\b(example of|based on|similar to|such as|reference)\b|例如|參考/i, context: "technical_reference", sentiment: "neutral", intent: "none" },
];

export function classifyMentionContext(snippet: string): { context: MentionContext; sentiment: Sentiment; intent: IntentLevel } {
  for (const r of RULES) if (r.re.test(snippet)) return { context: r.context, sentiment: r.sentiment, intent: r.intent };
  return { context: "neutral", sentiment: "neutral", intent: "none" };
}

/** Business relevance from confidence band + intent (§28: mention ≠ lead). */
export function businessRelevance(band: MentionBand, intent: IntentLevel): "low" | "medium" | "high" {
  if (band === "ignore") return "low";
  if (intent === "high") return "high";
  if (band === "confirmed" || intent === "medium") return "medium";
  return band === "likely" ? "medium" : "low";
}

/** A short original-language snippet around the strongest name hit (§39). */
export function snippetAround(doc: Pick<SourceDocument, "content" | "title">, entity: TrackedEntity, radius = 140): string {
  const names = [entity.canonical_name, ...entity.aliases, ...entity.identifiers].filter(Boolean);
  const lower = doc.content.toLowerCase();
  for (const n of names) {
    const i = lower.indexOf(n.toLowerCase());
    if (i >= 0) {
      const start = Math.max(0, i - radius);
      const end = Math.min(doc.content.length, i + n.length + radius);
      return `${start > 0 ? "…" : ""}${doc.content.slice(start, end).replace(/\s+/g, " ").trim()}${end < doc.content.length ? "…" : ""}`;
    }
  }
  return doc.title;
}
