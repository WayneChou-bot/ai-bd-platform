import { describe, expect, it } from "vitest";
import { htmlToText, validatePublicUrl } from "@/adapters/sources/fetch";
import { CSVAdapter } from "@/adapters/sources";
import { FixturePoolAdapter, rankSeeds } from "@/adapters/sources/fixture-pool";
import dataset from "../../fixtures/demo/dataset.json";
import type { ICPProfile } from "@/core/schemas";

const icp = dataset.icp as ICPProfile;
const ctx = { now: () => new Date("2026-08-25T00:00:00Z") };

describe("URL validation (§43)", () => {
  it("accepts public http(s)", () => { expect(validatePublicUrl("https://example.com/a").hostname).toBe("example.com"); });
  it("rejects non-http, loopback and private ranges", () => {
    for (const u of ["ftp://x.com", "file:///etc/passwd", "http://localhost:3000", "http://127.0.0.1", "http://10.0.0.5", "http://192.168.1.1", "http://169.254.169.254/latest/meta-data", "http://[::1]/"]) {
      expect(() => validatePublicUrl(u), u).toThrow();
    }
  });
});

describe("htmlToText", () => {
  it("strips scripts/styles/tags and decodes entities", () => {
    const t = htmlToText("<html><script>alert(1)</script><style>p{}</style><h1>Hi &amp; bye</h1><p>one</p><p>two</p></html>");
    expect(t).toBe("Hi & bye\none\ntwo");
  });
});

describe("source adapters", () => {
  it("CSV adapter parses and skips excluded", async () => {
    const csv = "company_name,website,entity_type,reason\nAcme,https://acme.io,,From list\nSolo Dev,https://solo.dev,individual,GitHub star\nBad,not-a-url,,";
    const out = await new CSVAdapter(csv).discover({ icp, limit: 10, exclude: new Set(["acme.io"]) }, ctx);
    expect(out.map((r) => r.company_name)).toEqual(["Solo Dev", "Bad"]);
    expect(out[0].entity_type).toBe("individual");
    expect(out[1].website).toBeUndefined();
  });
  it("fixture pool ranks ICP-relevant seeds first and honours exclusions", async () => {
    const ranked = rankSeeds(icp);
    expect(ranked[0].score).toBeGreaterThan(ranked.at(-1)!.score);
    const out = await new FixturePoolAdapter().discover({ icp, limit: 5, exclude: new Set(["acme-ai.example.com"]) }, ctx);
    expect(out).toHaveLength(5);
    expect(out.some((r) => r.company_name === "Acme AI")).toBe(false);
  });
});
