/**
 * Tests para controllers/membershipController.ts
 * Cubre: getMembershipStatus, changePlan, cancelMembership
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../src/middlewares/auth";

process.env.JWT_SECRET            = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL          = "postgresql://x:x@localhost/x";
process.env.INTEGRATIONS_ENC_KEY  = "test-enc-key-for-tests-padded!!!";
process.env.STRIPE_SECRET_KEY     = "sk_test_123";
process.env.APP_URL               = "https://velum.test";

// ── Mocks hoisted ─────────────────────────────────────────────────────────────
const {
  mockMembershipFindFirst,
  mockUserFindUnique,
  mockAuditCreate,
  mockEnsureCustomer,
  mockCreateCheckoutSession,
  mockCreateCustomerPortal,
  mockReadStripePlanCatalog,
} = vi.hoisted(() => ({
  mockMembershipFindFirst: vi.fn(),
  mockUserFindUnique:      vi.fn(),
  mockAuditCreate:         vi.fn().mockResolvedValue({}),
  mockEnsureCustomer:      vi.fn().mockResolvedValue("cus_test"),
  mockCreateCheckoutSession: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session" }),
  mockCreateCustomerPortal:  vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/portal" }),
  mockReadStripePlanCatalog: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    membership: { findFirst: mockMembershipFindFirst },
    user:       { findUnique: mockUserFindUnique },
  },
}));
vi.mock("../src/utils/env", () => ({
  env: {
    appUrl: "https://velum.test",
    jwtSecret: "test-secret-32-bytes-minimum-len",
    integrationsEncKey: "test-enc-key-for-tests-padded!!!",
    stripeSecretKey: "sk_test_123",
    resendFromEmail: "test@velum.test",
    resendKeyVerification: "re-v",
    resendKeyReset: "re-r",
    resendKeyReminders: "re-rem",
    resendKeyDocuments: "re-d",
    resendKeyAdminInvite: "re-a",
    resendKeyNotifications: "re-n",
    cookieName: "access_token",
    refreshCookieName: "refresh_token",
    frontendUrl: "http://localhost:5173",
    baseUrl: "http://localhost:4000",
    databaseUrl: "postgresql://x:x@localhost/x",
    nodeEnv: "test",
  },
}));
vi.mock("../src/services/auditService", () => ({ createAuditLog: mockAuditCreate }));
vi.mock("../src/services/stripeService", () => ({
  ensureCustomer:        mockEnsureCustomer,
  createCheckoutSession: mockCreateCheckoutSession,
  createCustomerPortal:  mockCreateCustomerPortal,
}));
vi.mock("../src/services/stripePlanCatalogService", () => ({
  readStripePlanCatalog: mockReadStripePlanCatalog,
}));

// ── Helper: app con usuario autenticado mockeado ──────────────────────────────
const USER_ID = "user-123";
const buildApp = async (overrideUser?: Partial<AuthRequest["user"]>) => {
  const { getMembershipStatus, changePlan, cancelMembership } =
    await import("../src/controllers/membershipController");

  const app = express();
  app.use(express.json());

  // Middleware que inyecta req.user sin pasar por JWT real
  app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: USER_ID, email: "user@velum.test", role: "member", ...overrideUser } as AuthRequest["user"];
    next();
  });

  app.get("/membership/status", getMembershipStatus);
  app.post("/membership/change-plan", changePlan);
  app.post("/membership/cancel", cancelMembership);

  return app;
};

beforeEach(() => vi.clearAllMocks());

// ── getMembershipStatus ────────────────────────────────────────────────────────
describe("getMembershipStatus", () => {
  it("retorna interestedPlanCode cuando el usuario no tiene membresía", async () => {
    mockMembershipFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ interestedPlanCode: "premium", appointmentDepositAvailable: false });

    const app = await buildApp();
    const res = await request(app).get("/membership/status");

    expect(res.status).toBe(200);
    expect(res.body.interestedPlanCode).toBe("premium");
    expect(res.body.appointmentDepositAvailable).toBe(false);
  });

  it("retorna membresía con planDetails cuando hay coincidencia en catálogo", async () => {
    const membership = { id: "m1", userId: USER_ID, status: "active", planId: "premium" };
    mockMembershipFindFirst.mockResolvedValue(membership);
    mockUserFindUnique.mockResolvedValue({ interestedPlanCode: null, appointmentDepositAvailable: true });
    mockReadStripePlanCatalog.mockResolvedValue([
      { planCode: "premium", stripePriceId: "price_123", amount: 1500, interval: "month", name: "Premium" },
    ]);

    const app = await buildApp();
    const res = await request(app).get("/membership/status");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
    expect(res.body.planDetails).toMatchObject({ amount: 1500, interval: "month", planName: "Premium" });
    expect(res.body.appointmentDepositAvailable).toBe(true);
  });

  it("retorna membresía sin planDetails cuando no hay match en catálogo", async () => {
    const membership = { id: "m1", userId: USER_ID, status: "active", planId: "unknown" };
    mockMembershipFindFirst.mockResolvedValue(membership);
    mockUserFindUnique.mockResolvedValue({ interestedPlanCode: null, appointmentDepositAvailable: false });
    mockReadStripePlanCatalog.mockResolvedValue([]);

    const app = await buildApp();
    const res = await request(app).get("/membership/status");

    expect(res.status).toBe(200);
    expect(res.body.planDetails).toBeNull();
  });

  it("ignora error del catálogo y retorna membresía igualmente", async () => {
    const membership = { id: "m1", userId: USER_ID, status: "active", planId: "premium" };
    mockMembershipFindFirst.mockResolvedValue(membership);
    mockUserFindUnique.mockResolvedValue({ interestedPlanCode: null, appointmentDepositAvailable: false });
    mockReadStripePlanCatalog.mockRejectedValue(new Error("catálogo caído"));

    const app = await buildApp();
    const res = await request(app).get("/membership/status");

    expect(res.status).toBe(200);
    expect(res.body.planDetails).toBeNull();
    expect(res.body.status).toBe("active");
  });
});

// ── changePlan ────────────────────────────────────────────────────────────────
describe("changePlan", () => {
  it("retorna URL de checkout cuando la solicitud es válida", async () => {
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, email: "user@velum.test" });

    const app = await buildApp();
    const res = await request(app)
      .post("/membership/change-plan")
      .send({ priceId: "price_abc123" });

    expect(res.status).toBe(200);
    expect(res.body.url).toContain("stripe.com");
    expect(mockEnsureCustomer).toHaveBeenCalledWith(USER_ID, "user@velum.test");
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it("retorna 404 cuando el usuario no existe", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await request(app)
      .post("/membership/change-plan")
      .send({ priceId: "price_abc123" });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/usuario/i);
  });

  it("registra audit log tras iniciar cambio de plan", async () => {
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, email: "user@velum.test" });

    const app = await buildApp();
    await request(app).post("/membership/change-plan").send({ priceId: "price_abc" });

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "membership.change_plan.init", userId: USER_ID })
    );
  });

  it("no llama a Stripe si el usuario no existe en DB", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    await request(app).post("/membership/change-plan").send({ priceId: "price_test" });

    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });
});

// ── cancelMembership ───────────────────────────────────────────────────────────
describe("cancelMembership", () => {
  it("retorna URL del portal de Stripe cuando el cliente existe", async () => {
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, stripeCustomerId: "cus_existing" });

    const app = await buildApp();
    const res = await request(app).post("/membership/cancel");

    expect(res.status).toBe(200);
    expect(res.body.url).toContain("billing.stripe.com");
    expect(mockCreateCustomerPortal).toHaveBeenCalledWith("cus_existing");
  });

  it("retorna 400 cuando el usuario no tiene stripeCustomerId", async () => {
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, stripeCustomerId: null });

    const app = await buildApp();
    const res = await request(app).post("/membership/cancel");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/stripe/i);
  });

  it("retorna 400 cuando el usuario no existe", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await request(app).post("/membership/cancel");

    expect(res.status).toBe(400);
  });

  it("registra audit log tras iniciar cancelación", async () => {
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, stripeCustomerId: "cus_x" });

    const app = await buildApp();
    await request(app).post("/membership/cancel");

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "membership.cancel.portal", userId: USER_ID })
    );
  });
});
