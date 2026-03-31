/**
 * Tests para controllers/v1PaymentController.ts
 * Cubre: getMyPayments, listPaymentsAdmin, getPaymentReconciliationReport, exportPaymentsCSV
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../src/middlewares/auth";

process.env.JWT_SECRET           = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL         = "postgresql://x:x@localhost/x";
process.env.INTEGRATIONS_ENC_KEY = "test-enc-key-for-tests-padded!!!";

// ── Mocks hoisted ─────────────────────────────────────────────────────────────
const {
  mockPaymentCount,
  mockPaymentFindMany,
  mockMembershipFindMany,
} = vi.hoisted(() => ({
  mockPaymentCount:    vi.fn().mockResolvedValue(0),
  mockPaymentFindMany: vi.fn().mockResolvedValue([]),
  mockMembershipFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    payment:    { count: mockPaymentCount, findMany: mockPaymentFindMany },
    membership: { findMany: mockMembershipFindMany },
  },
}));
vi.mock("../src/utils/env", () => ({ env: { nodeEnv: "test" } }));

// ── Helpers ───────────────────────────────────────────────────────────────────
const USER_ID  = "user-pay-001";
const ADMIN_ID = "admin-pay-001";

const makePayment = (id: string, overrides = {}) => ({
  id,
  userId: USER_ID,
  amount: 150000,
  currency: "mxn",
  status: "paid",
  createdAt: new Date("2026-03-15T10:00:00Z"),
  paidAt: new Date("2026-03-15T10:00:00Z"),
  membershipId: null,
  stripeSubscriptionId: null,
  ...overrides,
});

const buildApp = async (role: "member" | "admin" = "admin") => {
  const { getMyPayments, listPaymentsAdmin, getPaymentReconciliationReport, exportPaymentsCSV } =
    await import("../src/controllers/v1PaymentController");

  const app = express();
  app.use(express.json());

  const userId = role === "admin" ? ADMIN_ID : USER_ID;
  app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: userId, email: `${role}@velum.test`, role } as AuthRequest["user"];
    next();
  });

  app.get("/payments/mine", getMyPayments);
  app.get("/payments/admin", listPaymentsAdmin);
  app.get("/payments/reconciliation", getPaymentReconciliationReport);
  app.get("/payments/export-csv", exportPaymentsCSV);

  return app;
};

beforeEach(() => vi.clearAllMocks());

// ── getMyPayments ─────────────────────────────────────────────────────────────
describe("getMyPayments", () => {
  it("retorna pagos del usuario autenticado con estructura correcta", async () => {
    const payments = [makePayment("p1"), makePayment("p2")];
    mockPaymentCount.mockResolvedValue(2);
    mockPaymentFindMany.mockResolvedValue(payments);

    const app = await buildApp("member");
    const res = await request(app).get("/payments/mine");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(50);
  });

  it("filtra solo por el userId del usuario autenticado", async () => {
    mockPaymentCount.mockResolvedValue(0);
    mockPaymentFindMany.mockResolvedValue([]);

    const app = await buildApp("member");
    await request(app).get("/payments/mine");

    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } })
    );
  });

  it("respeta page y limit de la query", async () => {
    mockPaymentCount.mockResolvedValue(100);
    mockPaymentFindMany.mockResolvedValue([]);

    const app = await buildApp("member");
    const res = await request(app).get("/payments/mine?page=2&limit=10");

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(10);
    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
  });

  it("limite máximo es 100", async () => {
    mockPaymentCount.mockResolvedValue(0);
    mockPaymentFindMany.mockResolvedValue([]);

    const app = await buildApp("member");
    await request(app).get("/payments/mine?limit=9999");

    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });
});

// ── listPaymentsAdmin ─────────────────────────────────────────────────────────
describe("listPaymentsAdmin", () => {
  it("retorna lista paginada de pagos para admin", async () => {
    const payments = [
      { ...makePayment("p1"), user: { id: USER_ID, email: "u@t.com" }, membership: null },
    ];
    mockPaymentCount.mockResolvedValue(1);
    mockPaymentFindMany.mockResolvedValue(payments);

    const app = await buildApp("admin");
    const res = await request(app).get("/payments/admin");

    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
  });

  it("filtra por userId cuando se pasa como query param", async () => {
    mockPaymentCount.mockResolvedValue(0);
    mockPaymentFindMany.mockResolvedValue([]);

    const app = await buildApp("admin");
    await request(app).get("/payments/admin?userId=specific-user");

    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "specific-user" }),
      })
    );
  });

  it("filtra por status cuando se pasa como query param", async () => {
    mockPaymentCount.mockResolvedValue(0);
    mockPaymentFindMany.mockResolvedValue([]);

    const app = await buildApp("admin");
    await request(app).get("/payments/admin?status=failed");

    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "failed" }),
      })
    );
  });

  it("calcula pages correctamente", async () => {
    mockPaymentCount.mockResolvedValue(45);
    mockPaymentFindMany.mockResolvedValue([]);

    const app = await buildApp("admin");
    const res = await request(app).get("/payments/admin?limit=10");

    expect(res.body.pages).toBe(5); // ceil(45/10)
  });

  it("limita el máximo a 200 resultados por página", async () => {
    mockPaymentCount.mockResolvedValue(0);
    mockPaymentFindMany.mockResolvedValue([]);

    const app = await buildApp("admin");
    await request(app).get("/payments/admin?limit=9999");

    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 })
    );
  });
});

// ── getPaymentReconciliationReport ────────────────────────────────────────────
describe("getPaymentReconciliationReport", () => {
  it("retorna estructura de reporte de reconciliación", async () => {
    mockMembershipFindMany.mockResolvedValue([]);
    mockPaymentFindMany.mockResolvedValue([]);
    mockPaymentCount.mockResolvedValue(0);

    const app = await buildApp("admin");
    const res = await request(app).get("/payments/reconciliation");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("generatedAt");
    expect(res.body).toHaveProperty("summary");
    expect(res.body).toHaveProperty("details");
    expect(res.body.summary).toHaveProperty("failedPaymentsLast30d");
    expect(res.body.summary).toHaveProperty("paidPaymentsWithNoMembership");
  });

  it("incluye conteos correctos en summary", async () => {
    // mockPaymentCount es llamado DOS veces (failed + noMembership)
    mockMembershipFindMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    mockPaymentFindMany.mockResolvedValue([{ id: "p1" }]);
    mockPaymentCount
      .mockResolvedValueOnce(7)  // failedPaymentsLast30d
      .mockResolvedValueOnce(3); // paidPaymentsWithNoMembership

    const app = await buildApp("admin");
    const res = await request(app).get("/payments/reconciliation");

    expect(res.body.summary.activeMembershipsWithNoRecentPayment).toBe(2);
    expect(res.body.summary.paidPaymentsWithInactiveMembership).toBe(1);
    expect(res.body.summary.failedPaymentsLast30d).toBe(7);
    expect(res.body.summary.paidPaymentsWithNoMembership).toBe(3);
  });

  it("generatedAt es una ISO string válida", async () => {
    mockMembershipFindMany.mockResolvedValue([]);
    mockPaymentFindMany.mockResolvedValue([]);
    mockPaymentCount.mockResolvedValue(0);

    const app = await buildApp("admin");
    const res = await request(app).get("/payments/reconciliation");

    expect(() => new Date(res.body.generatedAt)).not.toThrow();
    expect(new Date(res.body.generatedAt).getTime()).toBeGreaterThan(0);
  });
});

// ── exportPaymentsCSV ─────────────────────────────────────────────────────────
describe("exportPaymentsCSV", () => {
  it("retorna Content-Type text/csv", async () => {
    mockPaymentFindMany.mockResolvedValue([]); // batch vacío

    const app = await buildApp("admin");
    const res = await request(app).get("/payments/export-csv");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
  });

  it("incluye Content-Disposition con nombre de archivo", async () => {
    mockPaymentFindMany.mockResolvedValue([]);

    const app = await buildApp("admin");
    const res = await request(app).get("/payments/export-csv");

    expect(res.headers["content-disposition"]).toMatch(/attachment.*pagos.*\.csv/i);
  });

  it("incluye header row con las columnas esperadas", async () => {
    mockPaymentFindMany.mockResolvedValue([]);

    const app = await buildApp("admin");
    const res = await request(app).get("/payments/export-csv");

    const text = res.text;
    expect(text).toContain("Fecha");
    expect(text).toContain("Email");
    expect(text).toContain("Monto");
    expect(text).toContain("Estado");
  });

  it("exporta datos de pagos correctamente en filas CSV", async () => {
    const payment = {
      id: "p1",
      amount: 150000,
      currency: "mxn",
      status: "paid",
      createdAt: new Date("2026-03-15T10:00:00Z"),
      paidAt: new Date("2026-03-15T10:00:00Z"),
      user: {
        email: "test@velum.mx",
        profile: { firstName: "Ana", lastName: "García" },
      },
    };
    // Primer batch tiene el pago, segundo batch vacío para terminar el while
    mockPaymentFindMany
      .mockResolvedValueOnce([payment])
      .mockResolvedValueOnce([]);

    const app = await buildApp("admin");
    const res = await request(app).get("/payments/export-csv");

    expect(res.text).toContain("test@velum.mx");
    expect(res.text).toContain("Ana");
    expect(res.text).toContain("1500.00");
    expect(res.text).toContain("2026-03-15");
  });
});
