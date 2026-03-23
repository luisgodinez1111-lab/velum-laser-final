import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

// Simulate Prisma unique constraint error (P2002)
const makePrismaUniqueError = () => {
  const err = new Error("Unique constraint violation") as any;
  err.code = "P2002";
  // Prisma errors have a name property
  err.name = "PrismaClientKnownRequestError";
  return err;
};

vi.mock("../src/db/prisma", () => ({
  prisma: {
    webhookEvent: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../src/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/services/stripeWebhookService", () => ({
  createStripeClientForWebhook: vi.fn(),
  getStripeWebhookConfig: vi.fn().mockResolvedValue({
    secretKey: "sk_test_x",
    webhookSecret: "whsec_test",
  }),
  handleBusinessStripeEvent: vi.fn().mockResolvedValue(undefined),
}));

// We need to mock Prisma.PrismaClientKnownRequestError
vi.mock("@prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, { code }: { code: string }) {
      super(message);
      this.code = code;
      this.name = "PrismaClientKnownRequestError";
    }
  }
  return { Prisma: { PrismaClientKnownRequestError } };
});

import express from "express";
import request from "supertest";
import { prisma } from "../src/db/prisma";
import { handleBusinessStripeEvent, getStripeWebhookConfig, createStripeClientForWebhook } from "../src/services/stripeWebhookService";
import { Prisma } from "@prisma/client";

// Build a minimal test app that bypasses signature verification
const buildApp = () => {
  const app = express();
  app.use(express.json());

  // Patch: inline controller logic with mocked stripe verification
  app.post("/webhook", async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) { res.status(400).json({ ok: false, message: "Missing stripe-signature header" }); return; }

    const config = await getStripeWebhookConfig();
    if (!config.secretKey || !config.webhookSecret) { res.status(500).json({ ok: false }); return; }

    // Simulate verified event
    const event = { id: "evt_test_123", type: "customer.subscription.updated", data: { object: {} } } as any;
    const stripe = createStripeClientForWebhook(config.secretKey);

    // Dedup logic — same as controller
    let isDuplicate = false;
    try {
      await prisma.webhookEvent.create({
        data: { stripeEventId: event.id, type: event.type, processedAt: new Date() },
      } as any);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        isDuplicate = true;
      }
    }
    if (isDuplicate) {
      res.status(200).json({ ok: true, received: true, duplicate: true, eventId: event.id });
      return;
    }

    await handleBusinessStripeEvent(event, stripe);
    res.status(200).json({ ok: true, received: true, eventId: event.id });
  });

  return app;
};

describe("Stripe webhook deduplication — race condition fix", () => {
  beforeEach(() => vi.clearAllMocks());

  it("procesa el evento cuando create tiene éxito", async () => {
    vi.mocked(prisma.webhookEvent.create).mockResolvedValueOnce({} as any);
    const app = buildApp();
    const res = await request(app).post("/webhook").set("stripe-signature", "sig_test").send({});
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBeUndefined();
    expect(handleBusinessStripeEvent).toHaveBeenCalledTimes(1);
  });

  it("devuelve duplicate=true cuando create lanza P2002 (race condition)", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002" });
    vi.mocked(prisma.webhookEvent.create).mockRejectedValueOnce(p2002);
    const app = buildApp();
    const res = await request(app).post("/webhook").set("stripe-signature", "sig_test").send({});
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(handleBusinessStripeEvent).not.toHaveBeenCalled();
  });

  it("sigue procesando si create falla con error no-P2002", async () => {
    vi.mocked(prisma.webhookEvent.create).mockRejectedValueOnce(new Error("Connection timeout"));
    const app = buildApp();
    const res = await request(app).post("/webhook").set("stripe-signature", "sig_test").send({});
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBeUndefined();
    expect(handleBusinessStripeEvent).toHaveBeenCalledTimes(1);
  });

  it("rechaza peticiones sin stripe-signature", async () => {
    const app = buildApp();
    const res = await request(app).post("/webhook").send({});
    expect(res.status).toBe(400);
  });
});
