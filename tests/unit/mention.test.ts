/**
 * Mention engine (Spec v0.3 §18, §24, §30, §31): deterministic confidence,
 * the Atlas false-positive guard, language detection, sentiment ≠ intent.
 */
import { describe, expect, it } from "vitest";
import {
  businessRelevance, classifyMentionContext, detectLanguage, isSelfPublished, mentionBand, mentionConfidence, snippetAround,
} from "@/core/mention";
import type { TrackedEntity } from "@/core/schemas";

const waretwin: TrackedEntity = {
  id: "ent_001", project_id: "proj_001", canonical_name: "WareTwin", entity_type: "product",
  aliases: ["Ware Twin"], canonical_url: "https://github.com/WayneChou-bot/WareTwin",
  identifiers: ["WayneChou-bot/WareTwin"], keywords: ["warehouse digital twin", "AGV simulation"],
  created_at: "2026-08-30T00:00:00.000Z",
};

const doc = (title: string, content: string, url = "https://blog.example.com/post") => ({ url, title, content });

describe("mentionConfidence (§24)", () => {
  it("scores an exact repo + name + topic mention as confirmed", () => {
    const m = mentionConfidence(doc("Warehouse digital twin tools", "We evaluated WayneChou-bot/WareTwin — WareTwin handles AGV simulation well."), waretwin);
    expect(m.matched).toContain("exact_identifier");
    expect(m.matched).toContain("canonical_name");
    expect(m.matched).toContain("context_topic");
    expect(m.score).toBeGreaterThanOrEqual(85);
  });

  it("Atlas guard: a bare common-word hit lands in ignore", () => {
    const atlas: TrackedEntity = { ...waretwin, canonical_name: "Atlas", aliases: [], identifiers: [], keywords: ["warehouse simulation"], canonical_url: undefined };
    const m = mentionConfidence(doc("World Atlas 2026", "The new atlas covers every country in maps."), atlas);
    expect(m.score).toBe(25); // canonical_name only
    expect(m.band).toBe("ignore");
  });

  it("name + topic (50) lands exactly on the review line — a human looks, nothing is auto-promoted; a stronger anchor (URL/repo/domain) is still required for Likely", () => {
    const atlas: TrackedEntity = { ...waretwin, canonical_name: "Atlas", aliases: [], identifiers: [], keywords: ["warehouse simulation"], canonical_url: undefined };
    const m = mentionConfidence(doc("Atlas for warehouse simulation", "Atlas is a warehouse simulation product."), atlas);
    expect(m.score).toBe(50);
    expect(m.band).toBe("review");
  });

  it("bands follow the documented thresholds", () => {
    expect(mentionBand(90)).toBe("confirmed");
    expect(mentionBand(89)).toBe("likely");
    expect(mentionBand(70)).toBe("likely");
    expect(mentionBand(69)).toBe("review");
    expect(mentionBand(50)).toBe("review");
    expect(mentionBand(49)).toBe("ignore");
  });

  it("self-published pages are not mentions; a third-party page citing the entity's domain earns domain_match", () => {
    const aws: TrackedEntity = { ...waretwin, canonical_name: "AWS", aliases: [], identifiers: [], keywords: ["machine learning"], canonical_url: "https://aws.amazon.com/tw/" };
    // AWS's own marketing page — used to score 75 (name + topic + domain) and flood the list
    const own = doc("What is Machine Learning?", "AWS puts machine learning in the hands of every developer.", "https://aws.amazon.com/what-is/machine-learning/");
    expect(isSelfPublished(own, aws)).toBe(true);
    expect(mentionConfidence(own, aws).matched).not.toContain("domain_match");
    // a third-party blog that links to aws.amazon.com
    const third = doc("Our ML stack", "We moved training to AWS (https://aws.amazon.com/sagemaker) for machine learning.", "https://blog.example.com/ml-stack");
    expect(isSelfPublished(third, aws)).toBe(false);
    const m = mentionConfidence(third, aws);
    expect(m.matched).toEqual(expect.arrayContaining(["canonical_name", "context_topic", "domain_match"]));
    expect(m.score).toBe(75);
    // a GitHub-hosted entity: only its own repo pages are self-published, not all of github.com
    expect(isSelfPublished(doc("x", "y", "https://github.com/WayneChou-bot/WareTwin/wiki/Home"), waretwin)).toBe(true);
    expect(isSelfPublished(doc("x", "y", "https://github.com/someone-else/awesome-list"), waretwin)).toBe(false);
  });

  it("caps at 100 when everything matches", () => {
    const m = mentionConfidence(doc("WareTwin", "WareTwin Ware Twin WayneChou-bot/WareTwin warehouse digital twin", "https://github.com/WayneChou-bot/WareTwin/wiki"), waretwin);
    expect(m.score).toBe(100);
    expect(m.band).toBe("confirmed");
  });
});

describe("detectLanguage (§18)", () => {
  it("detects Japanese via kana even with kanji", () => { expect(detectLanguage("スマート倉庫のデジタルツイン評価")).toBe("ja"); });
  it("detects Chinese", () => { expect(detectLanguage("倉庫數位孿生工具比較，值得參考")).toBe("zh"); });
  it("defaults to English", () => { expect(detectLanguage("Warehouse digital twin tools")).toBe("en"); });
});

describe("sentiment ≠ intent (§31)", () => {
  it("praise carries no intent", () => {
    const c = classifyMentionContext("WareTwin looks great, really well designed. Recommend checking it out.");
    expect(c.sentiment).toBe("positive");
    expect(["none", "low"]).toContain(c.intent);
  });
  it("evaluation is neutral sentiment but high intent", () => {
    const c = classifyMentionContext("We are currently evaluating WareTwin for our warehouse rollout.");
    expect(c.context).toBe("evaluation");
    expect(c.sentiment).toBe("neutral");
    expect(c.intent).toBe("high");
  });
  it("criticism is negative with low intent", () => {
    const c = classifyMentionContext("We tested it but it did not support our AGV fleet size.");
    expect(c.context).toBe("criticism");
    expect(c.sentiment).toBe("negative");
  });
});

describe("businessRelevance (§28)", () => {
  it("high intent → high; ignore band → low", () => {
    expect(businessRelevance("likely", "high")).toBe("high");
    expect(businessRelevance("ignore", "high")).toBe("low");
    expect(businessRelevance("confirmed", "none")).toBe("medium");
  });
});

describe("snippetAround (§39 original text preserved)", () => {
  it("returns the original-language window around the hit", () => {
    const s = snippetAround({ title: "t", content: "前文。我們正在評估 WareTwin 是否適合導入倉庫。後文。" }, waretwin, 12);
    expect(s).toContain("WareTwin");
    expect(s).toContain("評估");
  });
});
