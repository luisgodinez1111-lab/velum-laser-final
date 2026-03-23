import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

vi.mock("../src/db/prisma", () => ({
  prisma: {
    membership: { findMany: vi.fn().mockResolvedValue([]) },
    payment: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

import express from "express";
import request from "supertest";
import { getPaymentReconciliationReport } from "../src/controllers/v1PaymentController";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.get("/api/v1/payments/reconciliation", (req, _res, next) => {
    (req as any).user = { id: "admin1", role: "admin" };
    next();
  }, getPaymentReconciliationReport);
  return app;
};

describe("GET /api/v1/payments/reconciliation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna las 4 métricas de reconciliación en summary", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/v1/payments/reconciliation");
    expect(res.status).toBe(200);
    expect(res.body.summary).toHaveProperty("activeMembershipsWithNoRecentPayment");
    expect(res.body.summary).toHaveProperty("paidPaymentsWithInactiveMembership");
    expect(res.body.summary).toHaveProperty("failedPaymentsLast30d");
    expect(res.body.summary).toHaveProperty("paidPaymentsWithNoMembership");
  });

  it("todos los valores son numéricos", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/v1/payments/reconciliation");
    expect(typeof res.body.summary.activeMembershipsWithNoRecentPayment).toBe("number");
    expect(typeof res.body.summary.paidPaymentsWithInactiveMembership).toBe("number");
    expect(typeof res.body.summary.failedPaymentsLast30d).toBe("number");
    expect(typeof res.body.summary.paidPaymentsWithNoMembership).toBe("number");
  });

  it("incluye generatedAt ISO en la respuesta", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/v1/payments/reconciliation");
    expect(res.body).toHaveProperty("generatedAt");
    expect(new Date(res.body.generatedAt).toISOString()).toBe(res.body.generatedAt);
  });
});
