import { describe, expect, it } from "vitest";
import { MockDeliveryAdapter, outreachFooter } from "@/adapters/delivery";
import dataset from "../../fixtures/demo/dataset.json";

describe("DeliveryAdapter (S3, S12.1)", () => {
  it("mock adapter returns a simulated receipt with a thread key", async () => {
    const draft = dataset.drafts[0];
    const lead = dataset.leads.find((l) => l.id === draft.lead_id)!;
    const r = await new MockDeliveryAdapter().send(draft as never, lead as never, { address: "x@y.z" }, { now: () => new Date("2026-08-10T00:00:00Z"), newId: (p) => `${p}_t` });
    expect(r.simulated).toBe(true);
    expect(r.thread_key).toContain(lead.id);
    expect(r.error).toBeNull();
  });
  it("footer discloses AI assistance and offers opt-out (§46)", () => {
    const f = outreachFooter("bd@example.com");
    expect(f).toMatch(/AI assistance/);
    expect(f).toMatch(/unsubscribe/i);
  });
});
