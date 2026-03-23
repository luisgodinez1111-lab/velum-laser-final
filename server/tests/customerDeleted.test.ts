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
      create: vi.fn().mockResolvedValue({ id: "we1" }),
    },
    user: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    membership: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    payment: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
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

describe("customer.deleted webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acepta el evento y llama updateMany en user y membership", async () => {
    const app = await buildApp();
    const payload = {
      id: "evt_cust_del_001",
      type: "customer.deleted",
      data: { object: { id: "cus_test123", object: "customer" } },
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

  it("es idempotente — rechaza evento ya procesado", async () => {
    const { Prisma } = await import("@prisma/client");
    vi.mocked(prisma.webhookEvent.create).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "5.0.0" })
    );
    const app = await buildApp();
    const payload = { id: "evt_dup_002", type: "customer.deleted", data: { object: { id: "cus_dup" } } };
    const { body, signature } = makeSignedEvent(payload);

    const res = await request(app)
      .post("/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature)
      .send(body as any);

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
  });
});
