/**
 * strictify/stripNulls: LLM-facing schemas must satisfy OpenAI's strict
 * structured-output subset — every property required, no format:uri — while
 * the ORIGINAL domain schema still validates the round-tripped data.
 */
import { describe, expect, it } from "vitest";
import { zodSchema } from "ai";
import { z } from "zod";
import { strictify, stripNulls } from "@/adapters/llm/strict-schema";
import { ResearchResult } from "@/core/schemas";

const json = (s: z.ZodType) => zodSchema(s).jsonSchema as Record<string, unknown>;

describe("strictify (§43 quality: strict mode stays ON)", () => {
  it("lists defaulted fields in required (the polarity case)", () => {
    const evidence = z.object({ claim: z.string(), polarity: z.enum(["positive", "negative"]).default("positive") });
    const strict = json(strictify(evidence));
    expect(strict.required).toContain("polarity");
    expect(strict.required).toContain("claim");
  });

  it("optional fields become required-but-nullable instead of missing from required", () => {
    const s = json(strictify(z.object({ industry: z.string().optional() })));
    expect(s.required).toContain("industry");
    expect(JSON.stringify((s.properties as Record<string, unknown>).industry)).toContain("null");
  });

  it("the whole ResearchResult schema emits no format:uri and every evidence key is required", () => {
    const s = JSON.stringify(json(strictify(ResearchResult)));
    expect(s).not.toContain('"format":"uri"');
    const props = json(strictify(ResearchResult)).properties as Record<string, { items?: { required?: string[]; properties?: Record<string, unknown> } }>;
    const ev = props.evidence.items!;
    expect(ev.required).toEqual(expect.arrayContaining(Object.keys(ev.properties!)));
  });

  it("round-trip: model output with nulls re-validates against the ORIGINAL schema", () => {
    const domain = z.object({
      claim: z.string(),
      industry: z.string().optional(),
      polarity: z.enum(["positive", "negative"]).default("positive"),
    });
    const modelOutput = { claim: "hires knowledge engineers", industry: null, polarity: "negative" };
    const parsed = domain.parse(stripNulls(modelOutput));
    expect(parsed.industry).toBeUndefined();
    expect(parsed.polarity).toBe("negative");
    // and a reply that omits a required field still fails the domain gate
    expect(() => domain.parse(stripNulls({ industry: null, polarity: null }))).toThrow();
  });
});
