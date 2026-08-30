import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/inbound/route";

describe("POST /api/inbound", () => {
  it("is disabled (404) in DEMO mode", async () => {
    process.env.APP_MODE = "demo";
    const res = await POST(new Request("http://localhost/api/inbound", { method: "POST", body: "{}" }));
    expect(res.status).toBe(404);
  });
});
