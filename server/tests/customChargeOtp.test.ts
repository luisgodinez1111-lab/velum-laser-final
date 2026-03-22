/**
 * VALERIA — Custom charge: validación de OTP y flujo de verificación pública
 * Cubre: formato OTP regex, respuestas a OTP inválido, expirado, correcto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("../src/db/prisma", () => ({
  prisma: {
    customCharge: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("../src/services/auditService", () => ({ createAuditLog: vi.fn() }));
vi.mock("../src/services/emailService", () => ({
  sendCustomChargeOtpEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/customChargeService", () => ({
  verifyCustomChargeOtp: vi.fn(),
}));
vi.mock("../src/services/notificationService", () => ({
  onCustomChargeCreated: vi.fn().mockResolvedValue(undefined),
  onCustomChargeAccepted: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/stripeConfigService", () => ({
  resolveStripeConfig: vi.fn().mockResolvedValue({
    source: "env",
    config: { secretKey: "sk_test_fake", webhookSecret: "" },
  }),
}));

import { verifyCustomChargeOtp } from "../src/services/customChargeService";

// Mock global fetch for Stripe API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const buildApp = async () => {
  const { verifyOtpAndCheckout } = await import("../src/controllers/customChargeController");
  const app = express();
  app.use(express.json());
  app.post("/custom-charge/:id/verify", verifyOtpAndCheckout);
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/cs_test_abc" }),
  });
});

describe("OTP regex — formato del código (6 alfanuméricos)", () => {
  const OTP_RE = /^[A-Z0-9]{6}$/i;

  it("acepta 6 caracteres mayúsculas", () => expect(OTP_RE.test("ABCD12")).toBe(true));
  it("acepta 6 caracteres mixtos (case-insensitive)", () => expect(OTP_RE.test("Ab3d9F")).toBe(true));
  it("acepta 6 dígitos numéricos", () => expect(OTP_RE.test("123456")).toBe(true));
  it("rechaza 5 caracteres (corto)", () => expect(OTP_RE.test("AB123")).toBe(false));
  it("rechaza 7 caracteres (largo)", () => expect(OTP_RE.test("ABCDEF1")).toBe(false));
  it("rechaza caracteres especiales", () => expect(OTP_RE.test("AB@123")).toBe(false));
  it("rechaza cadena vacía", () => expect(OTP_RE.test("")).toBe(false));
});

describe("verifyOtpAndCheckout — respuestas del endpoint", () => {
  it("devuelve 400 si el OTP está ausente en el body", async () => {
    const app = await buildApp();
    const res = await request(app).post("/custom-charge/chg_001/verify").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/otp/i);
  });

  it("devuelve 400 si el OTP tiene formato incorrecto (5 chars)", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/custom-charge/chg_001/verify")
      .send({ otp: "ABC12" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/otp/i);
  });

  it("devuelve 400 si el OTP expiró", async () => {
    // Controller checks "error" in result — use { error: "otp_expired" }
    vi.mocked(verifyCustomChargeOtp).mockResolvedValue({ error: "otp_expired" } as any);
    const app = await buildApp();
    const res = await request(app)
      .post("/custom-charge/chg_001/verify")
      .send({ otp: "ABC123" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expirado/i);
  });

  it("devuelve 400 si el OTP es incorrecto", async () => {
    vi.mocked(verifyCustomChargeOtp).mockResolvedValue({ error: "invalid_otp" } as any);
    const app = await buildApp();
    const res = await request(app)
      .post("/custom-charge/chg_001/verify")
      .send({ otp: "WRONG1" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/incorrecto/i);
  });

  it("devuelve 404 si el cobro no existe", async () => {
    vi.mocked(verifyCustomChargeOtp).mockResolvedValue({ error: "not_found" } as any);
    const app = await buildApp();
    const res = await request(app)
      .post("/custom-charge/chg_999/verify")
      .send({ otp: "VALID1" });
    expect(res.status).toBe(404);
  });

  it("devuelve URL de checkout cuando el OTP es correcto", async () => {
    // Controller expects { charge: { type, currency, title, amount, user: { id, email } } }
    vi.mocked(verifyCustomChargeOtp).mockResolvedValue({
      charge: {
        id: "chg_001",
        type: "ONCE",
        currency: "mxn",
        title: "Sesión láser",
        description: null,
        amount: 50000,
        interval: null,
        user: { id: "u1", email: "cliente@velum.mx", stripeCustomerId: null },
      },
    } as any);
    const app = await buildApp();
    const res = await request(app)
      .post("/custom-charge/chg_001/verify")
      .send({ otp: "VALID1" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("checkoutUrl");
    expect(res.body.checkoutUrl).toMatch(/stripe\.com/);
  });
});
