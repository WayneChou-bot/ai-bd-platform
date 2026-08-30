import { afterEach, describe, expect, it, vi } from "vitest";
import { addressOnly, bodyText, buildMessage, encodeHeader, fromBase64url, stripQuoted, base64url } from "@/adapters/gmail/mime";
import { GmailDeliveryAdapter } from "@/adapters/gmail/delivery";
import { GmailPollingSource } from "@/adapters/gmail/inbound";
import type { TokenProvider } from "@/adapters/gmail/auth";
import { InMemoryRepository } from "@/lib/repository";
import dataset from "../../fixtures/demo/dataset.json";

const tp: TokenProvider = { mailbox: "me@gmail.com", accessToken: async () => "tok" };
const ctx = { now: () => new Date("2026-08-26T00:00:00Z"), newId: (p: string) => `${p}_t` };

describe("gmail mime", () => {
  it("builds an RFC822 message with custom headers and UTF-8 subject", () => {
    const raw = buildMessage({ from: "me@gmail.com", to: "you@x.y", subject: "關於文件 docs", text: "hi\n中文", headers: { "X-BD-Thread-Key": "thr_1" }, replyTo: "sales@x.y" });
    expect(raw).toContain("From: me@gmail.com");
    expect(raw).toContain("Reply-To: sales@x.y");
    expect(raw).toContain("X-BD-Thread-Key: thr_1");
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(encodeHeader("plain")).toBe("plain");
    expect(fromBase64url(base64url("中文 ok"))).toBe("中文 ok");
  });
  it("strips quoted replies and extracts plain text", () => {
    expect(stripQuoted("Sounds good, Thursday works.\n\nOn Tue, Aug 25, 2026 at 9:00 AM Wayne <me@gmail.com> wrote:\n> original\n> text")).toBe("Sounds good, Thursday works.");
    const m = { id: "m1", threadId: "t1", payload: { mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: base64url("<p>html</p>") } }, { mimeType: "text/plain", body: { data: base64url("plain body\n> quoted") } }] } };
    expect(bodyText(m)).toBe("plain body");
    expect(addressOnly("Sarah Chen <sarah@acme.com>")).toBe("sarah@acme.com");
  });
});

describe("GmailDeliveryAdapter", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends via messages/send and stores the Gmail threadId on the receipt", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, body: String(init?.body ?? "") }); return new Response(JSON.stringify({ id: "msg_1", threadId: "thr_gmail_1" }), { status: 200 }); }));
    const lead = dataset.leads[0]; const draft = dataset.drafts[0];
    const r = await new GmailDeliveryAdapter(tp, { fromName: "Wayne" }).send(draft as never, lead as never, { address: "you@gmail.com" }, ctx);
    expect(r.provider).toBe("gmail");
    expect(r.provider_thread_id).toBe("thr_gmail_1");
    expect(r.error).toBeNull();
    expect(calls[0].url).toContain("/messages/send");
    const raw = fromBase64url(JSON.parse(calls[0].body).raw);
    expect(raw).toContain("From: Wayne <me@gmail.com>");
    expect(raw).toContain("To: you@gmail.com");
    const body = Buffer.from(raw.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf8");
    expect(body).toContain("AI assistance"); // §46 footer
  });
  it("returns an error receipt instead of throwing when Gmail rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const r = await new GmailDeliveryAdapter(tp).send(dataset.drafts[0] as never, dataset.leads[0] as never, { address: "a@b.c" }, ctx);
    expect(r.error).toMatch(/429/);
  });
});

describe("GmailPollingSource", () => {
  it("matches a reply to the lead by Gmail threadId and builds an InboundEvent", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const lead = (await repo.leads()).find((l) => l.thread_key)!;
    await repo.addReceipt({ id: "rcpt_g", draft_id: "d", lead_id: lead.id, provider: "gmail", message_id: "m0", provider_thread_id: "thr_gmail_9", thread_key: lead.thread_key!, simulated: false, sent_at: "2026-08-26T00:00:00.000Z", error: null });
    const src = new GmailPollingSource(tp);
    const msg = { id: "m9", threadId: "thr_gmail_9", internalDate: String(Date.UTC(2026, 7, 26, 1)), payload: { headers: [{ name: "From", value: "Sarah <sarah@acme.com>" }, { name: "Subject", value: "Re: hi" }], mimeType: "text/plain", body: { data: base64url("Yes, let's talk next week.") } } };
    const ev = await src.toEvent(repo, msg, ctx);
    expect(ev.lead_id).toBe(lead.id);
    expect(ev.thread_key).toBe(lead.thread_key);
    expect(ev.raw_ref).toBe("m9");
    expect(ev.body_text).toBe("Yes, let's talk next week.");
    expect(ev.source).toBe("gmail");
  });
  it("leaves unrelated mail unmatched", async () => {
    const repo = InMemoryRepository.fromDataset(dataset);
    const ev = await new GmailPollingSource(tp).toEvent(repo, { id: "x", threadId: "nope", payload: { headers: [{ name: "From", value: "spam@x.y" }, { name: "Subject", value: "Buy now" }] } }, ctx);
    expect(ev.lead_id).toBeNull();
  });
});
