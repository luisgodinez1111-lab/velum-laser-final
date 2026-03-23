import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.STRIPE_SECRET_KEY = "sk_test_123";

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
  };
});

vi.mock("../src/db/prisma", () => ({
  prisma: {
    webhookEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "we1" }),
    },
    payment: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

import express from "express";
import request from "supertest";
import Stripe from "stripe";
import { prisma } from "../src/db/prisma";

const buildApp = async () => {
  const { stripeWebhookController } = await import("../src/controllers/stripeWebhookController");
  const app = express();
  app.post("/webhook", express.raw({ type: "*/*" }), stripeWebhookController);
  return app;
};

const makeSignedEvent = (payload: object) => {
  const stripe = new Stripe("sk_test_fake");
  const body = JSON.stringify(payload);
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_test" });
  return { body, signature };
};

describe("charge.refunded webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acepta el evento y marca el pago como refunded", async () => {
    const app = await buildApp();
    const payload = {
      id: "evt_refund_001",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_test",
          object: "charge",
          amount_refunded: 150000,
          payment_intent: "pi_test_abc",
        },
      },
    };
    const { body, signature } = makeSignedEvent(payload);

    const res = await request(app)
      .post("/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature)
      .send(body as any);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("procesa sin paymentIntentId sin lanzar error", async () => {
    const app = await buildApp();
    const payload = {
      id: "evt_refund_002",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_no_pi",
          object: "charge",
          amount_refunded: 50000,
          payment_intent: null,
        },
      },
    };
    const { body, signature } = makeSignedEvent(payload);

    const res = await request(app)
      .post("/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature)
      .send(body as any);

    expect(res.status).toBe(200);
  });
});
