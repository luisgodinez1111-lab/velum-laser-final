import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";

vi.mock("../src/services/stripeConfigService", () => ({
  resolveStripeConfig: vi.fn().mockResolvedValue({
    config: { secretKey: "sk_test_fake", publishableKey: "", webhookSecret: "" },
    source: "env",
  }),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({ email: "test@velum.mx", clinicId: null }),
    },
    payment: {
      findFirst: vi.fn(),
    },
  },
}));

import express from "express";
import request from "supertest";
import { prisma } from "../src/db/prisma";

const buildApp = async () => {
  const { createAppointmentDepositCheckout } = await import("../src/controllers/appointmentDepositController");
  const app = express();
  app.use(express.json());
  app.post("/deposit", (req, res, next) => {
    (req as any).user = { id: "user-1", email: "test@velum.mx", role: "member" };
    next();
  }, createAppointmentDepositCheckout);
  return app;
};

const validBody = {
  startAt: "2026-04-01T10:00:00",
  endAt: "2026-04-01T11:00:00",
  reason: "Depilación",
};

describe("POST /deposit — depósito duplicado", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna 409 si ya existe un depósito reciente para el mismo usuario", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue({
      id: "pay-1",
      userId: "user-1",
      status: "pending",
      createdAt: new Date(),
    });

    const app = await buildApp();
    const res = await request(app)
      .post("/deposit")
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/depósito/i);
  });

  it("no retorna 409 si no hay depósito reciente", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null);

    const app = await buildApp();
    const res = await request(app)
      .post("/deposit")
      .send(validBody);

    // Will fail at Stripe API call — just verify not 409
    expect(res.status).not.toBe(409);
  });
});
