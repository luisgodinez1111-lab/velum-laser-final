import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.STRIPE_SECRET_KEY = "sk_test_123";

const buildApp = async () => {
  const { handleWebhook } = await import("../src/controllers/stripeController");
  const app = express();
  app.post("/stripe/webhook", express.raw({ type: "application/json" }), handleWebhook);
  return app;
};

describe("stripe webhook", () => {
  it("rejects invalid signature", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/stripe/webhook")
      .set("stripe-signature", "invalid")
      .send({ test: true });

    expect(res.status).toBe(400);
  });
});
