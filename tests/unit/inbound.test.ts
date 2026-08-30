import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ResendInboundSource, SimulatedInboundSource } from "@/adapters/inbound";

const ctx = { now: () => new Date("2026-08-10T00:00:00Z"), newId: (p: string) => `${p}_1` };
const secret = "whsec_" + Buffer.from("test-secret").toString("base64");

function sign(body: string, id = "msg_1", ts = "1700000000") {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` };
}

describe("inbound sources (S4.4, S12.1)", () => {
  it("rejects an invalid signature with 401", () => {
    const src = new ResendInboundSource(secret);
    const r = src.parse({ rawBody: "{}", headers: { "svix-id": "a", "svix-timestamp": "b", "svix-signature": "v1,bad" } }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });
  it("accepts a valid signature and extracts the thread key", () => {
    const src = new ResendInboundSource(secret);
    const body = JSON.stringify({ type: "email.received", data: { email_id: "em_1", from: "a@b.c", subject: "Re: hi", text: "Sounds good", headers: { "X-BD-Thread-Key": "thr_lead_001_draft_001" } } });
    const r = src.parse({ rawBody: body, headers: sign(body) }, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.thread_key).toBe("thr_lead_001_draft_001");
      expect(r.event.raw_ref).toBe("em_1");
    }
  });
  it("simulated source builds a valid event", () => {
    const r = new SimulatedInboundSource().parse({ rawBody: JSON.stringify({ lead_id: "lead_001", subject: "s", body_text: "b" }) }, ctx);
    expect(r.ok).toBe(true);
  });
});
