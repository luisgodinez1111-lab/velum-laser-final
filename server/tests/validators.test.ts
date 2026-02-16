import { describe, expect, it } from "vitest";
import { leadCreateSchema } from "../src/validators/leads";

describe("leadCreateSchema", () => {
  it("requires consent=true", () => {
    const parsed = leadCreateSchema.safeParse({
      name: "Ana",
      email: "ana@example.com",
      phone: "6141234567",
      consent: false
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts valid payload with attribution fields", () => {
    const parsed = leadCreateSchema.safeParse({
      name: "Ana",
      email: "ana@example.com",
      phone: "6141234567",
      consent: true,
      utm_source: "meta",
      utm_campaign: "velum_launch",
      fbp: "fb.1.123",
      fbc: "fb.1.abc"
    });

    expect(parsed.success).toBe(true);
  });
});
