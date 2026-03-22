import { describe, it, expect, vi } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.STRIPE_SECRET_KEY = "sk_test_123";

// Mock the webhook service — provides credentials and stubs business logic
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

// Mock Prisma
vi.mock("../src/db/prisma", () => ({
  prisma: {
    webhookEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "we1" }),
    },
  },
}));

import express from "express";
import request from "supertest";
import Stripe from "stripe";

const buildApp = async () => {
  const { stripeWebhookController } = await import("../src/controllers/stripeWebhookController");
  const app = express();
  // type: "*/*" ensures raw body is parsed regardless of Content-Type header (test environment)
  app.post("/webhook", express.raw({ type: "*/*" }), stripeWebhookController);
  return app;
};

const makeSignedEvent = (payload: object) => {
  const stripe = new Stripe("sk_test_fake");
  const body = JSON.stringify(payload);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: "whsec_test",
  });
  return { body, signature };
};

describe("stripe webhook — firma e idempotencia", () => {
  it("rechaza firma inválida con 400", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "bad_sig")
      .send(Buffer.from(JSON.stringify({ id: "evt_bad", type: "test" })));
    expect(res.status).toBe(400);
  });

  it("acepta evento con firma válida y retorna ok:true y received:true", async () => {
    const { prisma } = await import("../src/db/prisma");
    vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValueOnce(null);

    const app = await buildApp();
    const payload = { id: "evt_valid_001", type: "invoice.payment_succeeded", data: { object: {} } };
    const { body, signature } = makeSignedEvent(payload);

    const res = await request(app)
      .post("/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature)
      .send(body as any);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.received).toBe(true);
  });

  it("responde idempotente si el evento ya fue procesado (duplicate:true)", async () => {
    const { prisma } = await import("../src/db/prisma");
    vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValueOnce({ id: "we_existing" } as any);

    const app = await buildApp();
    const payload = { id: "evt_dup_001", type: "invoice.payment_failed", data: { object: {} } };
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
