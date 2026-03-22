import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.STRIPE_SECRET_KEY = "sk_test_123";

// Mock service — getStripeWebhookConfig reads env vars when DB has no config
vi.mock("../src/services/stripeWebhookService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/stripeWebhookService")>();
  return {
    ...actual,
    getStripeWebhookConfig: vi.fn().mockResolvedValue({
      secretKey: "sk_test_123",
      webhookSecret: "whsec_test",
      publishableKey: "",
      source: "env" as const,
    }),
    handleBusinessStripeEvent: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../src/db/prisma", () => ({
  prisma: {
    webhookEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "we1" }),
    },
  },
}));

const buildApp = async () => {
  const { stripeWebhookController } = await import("../src/controllers/stripeWebhookController");
  const app = express();
  app.post("/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookController);
  return app;
};

describe("stripe webhook", () => {
  it("rejects invalid signature", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/stripe/webhook")
      .set("stripe-signature", "invalid")
      .send(Buffer.from(JSON.stringify({ test: true })));

    expect(res.status).toBe(400);
  });
});
