import { describe, it, expect, vi } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.STRIPE_SECRET_KEY = "sk_test_123";

// Mock Prisma
vi.mock("../src/db/prisma", () => ({
  prisma: {
    webhookEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "we1" }),
    },
    membership: { findFirst: vi.fn(), updateMany: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    payment: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "p1" }),
    },
    marketingAttribution: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "ma1" }),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("../src/services/metaService", () => ({
  sendMetaEvent: vi.fn().mockResolvedValue({ status: "skipped" }),
}));

vi.mock("../src/services/auditService", () => ({
  createAuditLog: vi.fn(),
}));

import express from "express";
import request from "supertest";
import Stripe from "stripe";

const buildApp = async () => {
  const { handleWebhook } = await import("../src/controllers/stripeController");
  const app = express();
  app.post("/webhook", express.raw({ type: "application/json" }), handleWebhook);
  return app;
};

const makeSignedEvent = (payload: object, secret: string) => {
  const stripe = new Stripe("sk_test_fake");
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret,
  });
  return { body, signature };
};

describe("stripe webhook — idempotencia y firma", () => {
  it("rechaza firma inválida con 400", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "bad_sig")
      .send(JSON.stringify({ id: "evt_bad", type: "test" }));
    expect(res.status).toBe(400);
  });

  it("acepta evento con firma válida y retorna received:true", async () => {
    const { prisma } = await import("../src/db/prisma");
    vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValueOnce(null);

    const app = await buildApp();
    const payload = { id: "evt_valid_001", type: "invoice.created", data: { object: {} } };
    const { body, signature } = makeSignedEvent(payload, "whsec_test");

    const res = await request(app)
      .post("/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it("responde idempotente si el evento ya fue procesado", async () => {
    const { prisma } = await import("../src/db/prisma");
    vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValueOnce({ id: "we_existing" } as any);

    const app = await buildApp();
    const payload = { id: "evt_dup_001", type: "invoice.paid", data: { object: {} } };
    const { body, signature } = makeSignedEvent(payload, "whsec_test");

    const res = await request(app)
      .post("/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.idempotent).toBe(true);
  });
});
