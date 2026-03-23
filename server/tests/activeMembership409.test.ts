import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";

vi.mock("../src/services/stripePlanCatalogService", () => ({
  findActivePlanByCode: vi.fn().mockResolvedValue({
    planCode: "mensual",
    name: "Plan Mensual",
    stripePriceId: "price_test",
    amount: 990,
    interval: "month",
    active: true,
  }),
  readStripePlanCatalog: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/services/stripeConfigService", () => ({
  resolveStripeConfig: vi.fn().mockResolvedValue({
    config: { secretKey: "sk_test_fake", publishableKey: "", webhookSecret: "" },
    source: "env",
  }),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import express from "express";
import request from "supertest";
import { prisma } from "../src/db/prisma";

const buildApp = async () => {
  const { createBillingCheckout } = await import("../src/controllers/billingCheckoutController");
  const app = express();
  app.use(express.json());
  app.post("/billing/checkout", (req, res, next) => {
    (req as any).user = { id: "user-1", email: "test@velum.mx", role: "member" };
    next();
  }, createBillingCheckout);
  return app;
};

describe("POST /billing/checkout — membresía activa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna 409 si el usuario ya tiene membresía activa", async () => {
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({
        id: "user-1",
        email: "test@velum.mx",
        stripeCustomerId: "cus_test123",
        memberships: [{ status: "active", stripeSubscriptionId: "sub_test" }],
      })
      .mockResolvedValueOnce({ id: "user-1", appointmentDepositAvailable: false });

    const app = await buildApp();
    const res = await request(app)
      .post("/billing/checkout")
      .send({ planCode: "mensual" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/activ/i);
  });

  it("no retorna 409 si no hay membresía activa", async () => {
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({
        id: "user-1",
        email: "test@velum.mx",
        stripeCustomerId: "cus_test123",
        memberships: [{ status: "canceled" }],
      })
      .mockResolvedValueOnce({ id: "user-1", appointmentDepositAvailable: false });

    const app = await buildApp();
    const res = await request(app)
      .post("/billing/checkout")
      .send({ planCode: "mensual" });

    // Will fail at Stripe API call (sk_test_fake) — but not 409
    expect(res.status).not.toBe(409);
  });
});
