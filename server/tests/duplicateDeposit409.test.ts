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
      // El anti-duplicado ahora se basa en el flag appointmentDepositAvailable
      // del User (los depósitos NO crean Payment); cada test define el valor.
      findUnique: vi.fn(),
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

  it("retorna 409 si el usuario ya tiene un depósito disponible sin usar", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      email: "test@velum.mx",
      clinicId: null,
      appointmentDepositAvailable: true,
    });

    const app = await buildApp();
    const res = await request(app)
      .post("/deposit")
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/depósito/i);
  });

  it("no retorna 409 si el usuario no tiene depósito disponible", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      email: "test@velum.mx",
      clinicId: null,
      appointmentDepositAvailable: false,
    });

    const app = await buildApp();
    const res = await request(app)
      .post("/deposit")
      .send(validBody);

    // Falla en la llamada a Stripe (fake) — solo verificamos que NO sea 409.
    expect(res.status).not.toBe(409);
  });
});
