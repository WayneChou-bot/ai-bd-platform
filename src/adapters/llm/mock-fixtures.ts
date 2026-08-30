/**
 * Deterministic resolvers for MockLLMProvider (DEMO mode).
 * They are heuristics over the structured prompt — no randomness — so the
 * fixture generator and the running demo produce identical output.
 */
import { MockLLMProvider } from "./index";
import { icpSuggestHeuristic, productUnderstandingHeuristic } from "./mock-product";
import { seedByName, seedWebsite } from "@/adapters/sources/fixture-pool";

type QualPrompt = {
  lead: { name: string; entity_type: string; industry?: string };
  score: { total: number; classification: string; withheld: boolean; breakdown: Record<string, number> };
  evidence: Array<{ id: string; claim: string; polarity: string; confidence: number }>;
};

type OutreachPrompt = {
  product: { name: string; description: string };
  prospect: { name: string; entity_type: string };
  tone: string;
  evidence: Array<{ id: string; claim: string; category?: string }>;
};

const CATEGORY_HOOK: Record<string, string> = {
  hiring: "your recent hiring",
  content: "your recent post",
  technology: "your documentation setup",
  product_launch: "your recent launch",
  funding: "your recent funding",
  company_profile: "your team",
};

const lower = (s: string) => s.toLowerCase();

export function classifyReplyHeuristic(text: string): { outcome: string; confidence: number; rationale: string; quoted_signal: string } {
  const t = lower(text);
  const pick = (re: RegExp) => {
    const m = text.match(re);
    return m ? m[0] : text.slice(0, 80);
  };
  if (/(remove me|unsubscribe|not interested|do not contact)/.test(t))
    return { outcome: "negative_reply", confidence: 0.96, rationale: "Explicit opt-out or refusal.", quoted_signal: pick(/[^.]*(remove me|unsubscribe|not interested)[^.]*\.?/i) };
  if (/(schedule|set up|slots|demo on|call for next week|20 minutes|30-min|thursday|next week\?)/.test(t) && /(call|demo|slots|minutes|chat|intro)/.test(t))
    return { outcome: "meeting_requested", confidence: 0.92, rationale: "Prospect proposes a meeting or asks for time slots.", quoted_signal: pick(/[^.]*(schedule|slots|demo|minutes|call)[^.]*\.?/i) };
  if (/(not the right time|committed to another vendor|check back|not a priority)/.test(t))
    return { outcome: "negative_reply", confidence: 0.88, rationale: "Prospect declines for now.", quoted_signal: pick(/[^.]*(not the right time|another vendor|not a priority)[^.]*\.?/i) };
  if (/(interested|design partner|happy to try|evaluating|share pricing|demo video|happy to have a call)/.test(t))
    return { outcome: "interested", confidence: 0.86, rationale: "Prospect expresses interest or asks for materials.", quoted_signal: pick(/[^.]*(interested|design partner|happy to try|evaluating|pricing|demo video)[^.]*\.?/i) };
  if (/(forwarding|forwarded|they'll reach out)/.test(t))
    return { outcome: "positive_reply", confidence: 0.74, rationale: "Reply is courteous and routes to another team.", quoted_signal: pick(/[^.]*forward[^.]*\.?/i) };
  if (/(thanks|thank you)/.test(t))
    return { outcome: "positive_reply", confidence: 0.62, rationale: "Polite acknowledgement without clear next step.", quoted_signal: pick(/[^.]*thank[^.]*\.?/i) };
  return { outcome: "unclassified", confidence: 0.4, rationale: "No clear signal detected.", quoted_signal: text.slice(0, 80) };
}

export function draftOutreachHeuristic(p: OutreachPrompt): { subject: string; body: string; evidence_used: string[]; confidence: number } {
  const ev = p.evidence.slice(0, 3);
  const first = p.prospect.entity_type === "individual" ? p.prospect.name.split(" ")[0] : `${p.prospect.name} team`;
  const observed = ev.map((e) =>
    e.claim
      .replace(/^(Hiring|Published|Announced|Maintains|Post|Blog post|Engineering post|Open role)/, (m) => m.toLowerCase())
      .replace(/\btheir\b/g, "your")
      .replace(/^hiring/, "you're hiring")
      .replace(/^published/, "you published")
      .replace(/^announced/, "you announced")
      .replace(/^maintains/, "you maintain"),
  );
  const lines = [
    `Hi ${first},`,
    ``,
    `I noticed a few things recently: ${observed[0]}${observed[1] ? `, and ${observed[1]}` : ""}${observed[2] ? `. I also saw that ${observed[2]}` : ""}.`,
    ``,
    `We're building ${p.product.name} — ${p.product.description.split(".")[0].toLowerCase()}. Teams use it to turn scattered Markdown, tickets and posts into role-specific, interconnected pages that stay current.`,
    ``,
    `If keeping documentation useful across roles is on your radar, I'd be glad to show you a 15-minute walkthrough on your own repository. No pressure either way.`,
    ``,
    `Best,`,
    `Wayne`,
  ];
  const hook = CATEGORY_HOOK[ev[0]?.category ?? ""] ?? "your documentation";
  const who = p.prospect.entity_type === "individual" ? p.prospect.name.split(" — ")[0] : p.prospect.name;
  return {
    subject: `A note on ${hook} at ${who}`,
    body: lines.join("\n"),
    evidence_used: ev.map((e) => e.id),
    confidence: Math.min(0.95, 0.6 + ev.length * 0.1),
  };
}

export function qualificationRationaleHeuristic(p: QualPrompt): { rationale: string; risks: string[] } {
  const pos = p.evidence.filter((e) => e.polarity === "positive");
  const neg = p.evidence.filter((e) => e.polarity === "negative");
  const b = p.score.breakdown;
  const risks: string[] = [];
  if (p.score.withheld) return { rationale: `Only ${p.evidence.length} evidence item(s) found for ${p.lead.name}; not enough to score responsibly.`, risks: ["Insufficient evidence"] };
  if (neg.length) {
    return {
      rationale: `${p.lead.name} surfaced on keyword signals, but ${neg[0].claim.toLowerCase()}, which contradicts the ICP.`,
      risks: ["Matches ICP exclusion criteria"],
    };
  }
  if (b.intent_signal < 60) risks.push("No clear buying signal");
  if (b.role_relevance < 60) risks.push("Decision maker / relevant role not identified");
  if (b.data_confidence < 70) risks.push("Low data confidence");
  if (!pos.some((e) => /budget|funding|pilot/i.test(e.claim))) risks.push("No confirmed budget signal");
  const top = pos.slice().sort((a, c) => c.confidence - a.confidence).slice(0, 2).map((e) => e.claim.toLowerCase());
  const label = p.score.classification.replace("_", " ").toLowerCase();
  return {
    rationale: `${p.lead.name} is ${label} (${p.score.total}/100): ${top.join("; ")}.`,
    risks,
  };
}

/** DEMO research: evidence comes from the seed universe; unknown companies get a thin, low-confidence profile (§41 → score withheld). */
export function researchHeuristic(p: { company: string; website?: string; now: string }) {
  const seed = seedByName(p.company);
  const nowMs = new Date(p.now).getTime();
  if (!seed) {
    return {
      overview: `${p.company}: no public profile available in demo sources.`,
      products: [], technologies: [], recent_activity: [], potential_pain_points: [],
      evidence: [{
        type: "company_page", category: "company_profile", claim: `Company page reachable at ${p.website ?? "unknown"}`,
        source_url: p.website ?? "https://example.com", observed_at: p.now, confidence: 0.3, supports: "product_fit", polarity: "positive",
      }],
    };
  }
  const site = seedWebsite(seed);
  return {
    overview: `${seed.name} — ${seed.industry}, ${seed.size} employees, ${seed.location}. ${seed.reason}.`,
    industry: seed.industry,
    size_estimate: seed.size,
    location: seed.location,
    products: [],
    technologies: seed.evidence.filter((e) => e.category === "technology").map((e) => e.claim),
    recent_activity: seed.evidence.filter((e) => e.daysAgo <= 14).map((e) => e.claim),
    potential_pain_points: seed.evidence.filter((e) => e.supports === "problem_evidence" && !e.negative).map((e) => e.claim),
    evidence: seed.evidence.map((e) => ({
      type: e.type, category: e.category, claim: e.claim, source_url: `${site}${e.path}`,
      observed_at: new Date(nowMs - e.daysAgo * 86_400_000).toISOString(), confidence: e.conf, supports: e.supports,
      polarity: e.negative ? "negative" : "positive",
    })),
  };
}

export function createDemoMockProvider(): MockLLMProvider {
  return new MockLLMProvider()
    .register("qualification.rationale", ({ prompt }) => qualificationRationaleHeuristic(JSON.parse(prompt) as QualPrompt))
    .register("outreach.draft", ({ prompt }) => draftOutreachHeuristic(JSON.parse(prompt) as OutreachPrompt))
    .register("reply.classify", ({ untrusted }) => classifyReplyHeuristic(untrusted ?? ""))
    .register("product.understand", ({ prompt }) => productUnderstandingHeuristic(JSON.parse(prompt)))
    .register("icp.suggest", ({ prompt }) => icpSuggestHeuristic(JSON.parse(prompt)))
    .register("research.enrich", ({ prompt }) => researchHeuristic(JSON.parse(prompt) as { company: string; website?: string; now: string }));
}
