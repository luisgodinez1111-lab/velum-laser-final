/**
 * Tests para controllers/billingCheckoutController.ts
 * Cubre: createBillingCheckout, createBillingPortal
 * Estrategia: mock fetch global + dependencias Prisma/services
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../src/middlewares/auth";

process.env.JWT_SECRET   = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

const {
  mockUserFindUnique,
  mockFindActivePlanByCode,
  mockResolveStripeConfig,
  mockResolveBaseUrl,
  mockFetch,
} = vi.hoisted(() => ({
  mockUserFindUnique:       vi.fn(),
  mockFindActivePlanByCode: vi.fn(),
  mockResolveStripeConfig:  vi.fn().mockResolvedValue({ config: { secretKey: "sk_test_123" } }),
  mockResolveBaseUrl:       vi.fn().mockReturnValue("https://velum.test"),
  mockFetch:                vi.fn(),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: { user: { findUnique: mockUserFindUnique } },
}));
vi.mock("../src/services/stripePlanCatalogService", () => ({ findActivePlanByCode: mockFindActivePlanByCode }));
vi.mock("../src/services/stripeConfigService",      () => ({ resolveStripeConfig:  mockResolveStripeConfig }));
vi.mock("../src/utils/baseUrl",                     () => ({ resolveBaseUrl:       mockResolveBaseUrl }));
vi.mock("../src/utils/env",                         () => ({ env: { nodeEnv: "test" } }));

// Mock global fetch
vi.stubGlobal("fetch", mockFetch);

const USER_ID = "user-billing-001";

const buildApp = async () => {
  const { createBillingCheckout, createBillingPortal } =
    await import("../src/controllers/billingCheckoutController");

  const app = express();
  app.use(express.json());
  app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: USER_ID, email: "user@velum.test", role: "member" } as AuthRequest["user"];
    next();
  });

  app.post("/billing/checkout", createBillingCheckout);
  app.post("/billing/portal",   createBillingPortal);

  return app;
};

const makeFetchOk = (body: Record<string, unknown>) =>
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  });

const makeFetchError = (body: Record<string, unknown>, status = 400) =>
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  });

beforeEach(() => vi.clearAllMocks());

// ── createBillingCheckout ─────────────────────────────────────────────────────
describe("createBillingCheckout", () => {
  const plan = { planCode: "premium", stripePriceId: "price_abc", amount: 1500, interval: "month", name: "Premium" };

  it("retorna sessionId y checkoutUrl cuando todo es válido", async () => {
    mockFindActivePlanByCode.mockResolvedValue(plan);
    mockUserFindUnique
      .mockResolvedValueOnce({ id: USER_ID, email: "u@t.com", memberships: [] })  // primer findUnique
      .mockResolvedValueOnce({ appointmentDepositAvailable: false });              // segundo findUnique
    makeFetchOk({ id: "cs_test_123", url: "https://checkout.stripe.com/session" });

    const app = await buildApp();
    const res = await request(app)
      .post("/billing/checkout")
      .send({ planCode: "premium" });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe("cs_test_123");
    expect(res.body.checkoutUrl).toContain("stripe.com");
    expect(res.body.planCode).toBe("premium");
  });

  it("retorna 400 cuando planCode está vacío", async () => {
    const app = await buildApp();
    const res = await request(app).post("/billing/checkout").send({ planCode: "" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/planCode/i);
  });

  it("retorna 404 cuando el plan no existe en catálogo", async () => {
    mockFindActivePlanByCode.mockResolvedValue(null);

    const app = await buildApp();
    const res = await request(app).post("/billing/checkout").send({ planCode: "nonexistent" });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/plan/i);
  });

  it("retorna 409 cuando el usuario ya tiene membresía activa", async () => {
    mockFindActivePlanByCode.mockResolvedValue(plan);
    mockUserFindUnique.mockResolvedValueOnce({
      id: USER_ID,
      email: "u@t.com",
      memberships: [{ status: "active" }],
    });

    const app = await buildApp();
    const res = await request(app).post("/billing/checkout").send({ planCode: "premium" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/activa/i);
  });

  it("retorna 404 cuando el usuario no existe en DB", async () => {
    mockFindActivePlanByCode.mockResolvedValue(plan);
    mockUserFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await request(app).post("/billing/checkout").send({ planCode: "premium" });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/usuario/i);
  });

  it("retorna 502 cuando Stripe responde con error", async () => {
    mockFindActivePlanByCode.mockResolvedValue(plan);
    mockUserFindUnique
      .mockResolvedValueOnce({ id: USER_ID, email: "u@t.com", memberships: [] })
      .mockResolvedValueOnce({ appointmentDepositAvailable: false });
    makeFetchError({ error: { message: "Invalid API Key" } });

    const app = await buildApp();
    const res = await request(app).post("/billing/checkout").send({ planCode: "premium" });

    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/checkout/i);
  });

  it("crea un cupón cuando el usuario tiene depositCredit", async () => {
    mockFindActivePlanByCode.mockResolvedValue(plan);
    mockUserFindUnique
      .mockResolvedValueOnce({ id: USER_ID, email: "u@t.com", memberships: [] })
      .mockResolvedValueOnce({ appointmentDepositAvailable: true });

    // Primera llamada: crear cupón; segunda: crear session
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "coupon_abc" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "cs_test_456", url: "https://checkout.stripe.com/s2" }) });

    const app = await buildApp();
    const res = await request(app).post("/billing/checkout").send({ planCode: "premium" });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2); // cupón + session
  });
});

// ── createBillingPortal ───────────────────────────────────────────────────────
describe("createBillingPortal", () => {
  it("retorna URL del portal cuando el cliente tiene stripeCustomerId válido", async () => {
    mockUserFindUnique.mockResolvedValue({ stripeCustomerId: "cus_test_001" });
    makeFetchOk({ url: "https://billing.stripe.com/portal/session" });

    const app = await buildApp();
    const res = await request(app).post("/billing/portal");

    expect(res.status).toBe(200);
    expect(res.body.url).toContain("billing.stripe.com");
  });

  it("retorna 400 cuando el usuario no tiene stripeCustomerId", async () => {
    mockUserFindUnique.mockResolvedValue({ stripeCustomerId: null });

    const app = await buildApp();
    const res = await request(app).post("/billing/portal");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/suscripción/i);
  });

  it("retorna 400 cuando stripeCustomerId no empieza con cus_", async () => {
    mockUserFindUnique.mockResolvedValue({ stripeCustomerId: "invalid_id" });

    const app = await buildApp();
    const res = await request(app).post("/billing/portal");

    expect(res.status).toBe(400);
  });

  it("retorna 502 cuando Stripe falla al crear la sesión del portal", async () => {
    mockUserFindUnique.mockResolvedValue({ stripeCustomerId: "cus_test_002" });
    makeFetchError({ error: { message: "Portal error" } });

    const app = await buildApp();
    const res = await request(app).post("/billing/portal");

    expect(res.status).toBe(502);
  });
});
