/**
 * SSRF & size hardening for public page fetching (review v6 F09):
 * mapped-IPv6 loopback, redirect re-validation, DNS-to-private rejection,
 * streamed size cap.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicPage, ipIsPrivate, validatePublicUrl } from "@/adapters/sources/fetch";
import { normalizeRow } from "@/lib/repository.supabase";
import { Project, OutreachDraft } from "@/core/schemas";

afterEach(() => vi.unstubAllGlobals());

describe("validatePublicUrl / ipIsPrivate", () => {
  it("blocks IPv4-mapped IPv6 loopback and private ranges", () => {
    expect(() => validatePublicUrl("http://[::ffff:127.0.0.1]/x")).toThrow(/private/i);
    expect(ipIsPrivate("::ffff:10.0.0.5")).toBe(true);
    expect(ipIsPrivate("::ffff:8.8.8.8")).toBe(false);
    expect(ipIsPrivate("192.168.1.1")).toBe(true);
    expect(ipIsPrivate("93.184.216.34")).toBe(false);
  });
});

describe("fetchPublicPage", () => {
  it("re-validates every redirect hop — a hop into a private address is blocked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } })));
    await expect(fetchPublicPage("http://93.184.216.34/start")).rejects.toThrow(/private/i);
    expect(fetch).toHaveBeenCalledTimes(1); // the private hop is never fetched
  });

  it("rejects a hostname that resolves to a private address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("hi", { status: 200 })));
    const doLookup = (async () => [{ address: "10.1.2.3", family: 4 }]) as never;
    await expect(fetchPublicPage("http://internal-alias.example.com/", "company_page", 8000, { doLookup })).rejects.toThrow(/private address 10\.1\.2\.3/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("caps the download instead of reading an unbounded body", async () => {
    const big = new Uint8Array(2_000_000).fill(97); // 2MB of "a"
    const stream = new ReadableStream<Uint8Array>({
      start(c) { for (let i = 0; i < 20; i++) c.enqueue(big.slice(i * 100_000, (i + 1) * 100_000)); c.close(); },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { status: 200, headers: { "content-type": "text/plain" } })));
    const page = await fetchPublicPage("http://93.184.216.34/big");
    expect(page.content.length).toBeLessThanOrEqual(520_000);
    expect(page.status).toBe(200);
  });
});

describe("F08 — Supabase NULL → domain optional mapping", () => {
  it("a legally sparse SQL row (nulled optionals) parses; deliberately nullable fields keep null", () => {
    const row = { id: "proj_1", name: "X", description: "", category: null, website: null, repository: null, created_at: "2026-09-04T00:00:00.000Z" };
    const parsed = Project.parse(normalizeRow(Project, row));
    expect(parsed.category).toBeUndefined();
    expect(parsed.website).toBeUndefined();

    const draftRow = {
      id: "dr_1", lead_id: "lead_1", channel: "email", version: 1, tone: "professional", subject: "s", body: "b",
      evidence_used: ["ev_1"], confidence: 0.8, status: "DRAFT", human_edited: false, approved_at: null, created_at: "2026-09-04T00:00:00.000Z",
    };
    const d = OutreachDraft.parse(normalizeRow(OutreachDraft, draftRow));
    expect(d.approved_at).toBeNull(); // nullable by design — null survives
  });
});
