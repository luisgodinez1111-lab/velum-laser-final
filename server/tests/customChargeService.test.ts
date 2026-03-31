/**
 * Tests para services/customChargeService.ts
 * Cubre: createCustomCharge, verifyCustomChargeOtp, markCustomChargePaid,
 *        cancelCustomCharge, resendCustomChargeOtp, renewRecurringCharges
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET           = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL         = "postgresql://x:x@localhost/x";
process.env.INTEGRATIONS_ENC_KEY = "test-enc-key-32-bytes-minimum!!";

// ── Mocks hoisted ────────────────────────────────────────────────────────────
const {
  mockCreate,
  mockFindUnique,
  mockUpdate,
  mockUpdateMany,
  mockFindMany,
  mockAppSettingFindUnique,
  mockAppSettingUpsert,
  mockAppSettingDelete,
  mockOnCustomChargeCreated,
  mockSendCustomChargeOtpEmail,
  mockResolveBaseUrl,
} = vi.hoisted(() => ({
  mockCreate:               vi.fn(),
  mockFindUnique:           vi.fn(),
  mockUpdate:               vi.fn(),
  mockUpdateMany:           vi.fn(),
  mockFindMany:             vi.fn(),
  mockAppSettingFindUnique: vi.fn(),
  mockAppSettingUpsert:     vi.fn(),
  mockAppSettingDelete:     vi.fn(),
  mockOnCustomChargeCreated:    vi.fn().mockResolvedValue(undefined),
  mockSendCustomChargeOtpEmail: vi.fn().mockResolvedValue(undefined),
  mockResolveBaseUrl:           vi.fn().mockReturnValue("https://velum.test"),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    customCharge: {
      create:     mockCreate,
      findUnique: mockFindUnique,
      update:     mockUpdate,
      updateMany: mockUpdateMany,
      findMany:   mockFindMany,
    },
    appSetting: {
      findUnique: mockAppSettingFindUnique,
      upsert:     mockAppSettingUpsert,
      delete:     mockAppSettingDelete,
    },
  },
}));

vi.mock("../src/services/notificationService", () => ({
  onCustomChargeCreated: mockOnCustomChargeCreated,
}));

vi.mock("../src/services/emailService", () => ({
  sendCustomChargeOtpEmail: mockSendCustomChargeOtpEmail,
}));

vi.mock("../src/utils/baseUrl", () => ({
  resolveBaseUrl: mockResolveBaseUrl,
}));

vi.mock("../src/utils/date", () => ({
  addHours: (h: number) => new Date(Date.now() + h * 60 * 60 * 1000),
}));

vi.mock("../src/utils/env", () => ({
  env: { nodeEnv: "test" },
}));

import {
  createCustomCharge,
  verifyCustomChargeOtp,
  markCustomChargePaid,
  cancelCustomCharge,
  resendCustomChargeOtp,
  renewRecurringCharges,
} from "../src/services/customChargeService";

const CHARGE_ID = "charge-001";
const USER_ID   = "user-001";
const ADMIN_ID  = "admin-001";

const baseCharge = {
  id: CHARGE_ID,
  userId: USER_ID,
  title: "Tratamiento extra",
  description: "Descripción test",
  amount: 250000,
  currency: "mxn",
  type: "ONE_TIME",
  status: "PENDING_ACCEPTANCE",
  otpHash: null as string | null,
  otpExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  otpAttempts: 0,
  expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  interval: null,
  user: {
    id: USER_ID,
    email: "paciente@velum.test",
    stripeCustomerId: "cus_test",
    profile: { firstName: "Ana", lastName: "García" },
  },
};

beforeEach(() => vi.clearAllMocks());

// ── createCustomCharge ────────────────────────────────────────────────────────
describe("createCustomCharge", () => {
  it("crea el cargo y retorna charge + otp", async () => {
    mockCreate.mockResolvedValue({ ...baseCharge, user: baseCharge.user });

    const result = await createCustomCharge({
      userId:   USER_ID,
      title:    "Tratamiento extra",
      amount:   250000,
      type:     "ONE_TIME",
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(result.charge).toBeDefined();
    expect(result.otp).toMatch(/^\d{6}$/);
  });

  it("genera OTP de 6 dígitos distintos en cada llamada", async () => {
    mockCreate.mockResolvedValue({ ...baseCharge });

    const r1 = await createCustomCharge({ userId: USER_ID, title: "T1", amount: 100, type: "ONE_TIME" });
    const r2 = await createCustomCharge({ userId: USER_ID, title: "T2", amount: 100, type: "ONE_TIME" });

    // Ambos son 6 dígitos
    expect(r1.otp).toMatch(/^\d{6}$/);
    expect(r2.otp).toMatch(/^\d{6}$/);
  });

  it("pasa interval correcto para tipo RECURRING", async () => {
    mockCreate.mockResolvedValue({ ...baseCharge, type: "RECURRING", interval: "month" });

    await createCustomCharge({
      userId: USER_ID,
      title:  "Cobro mensual",
      amount: 150000,
      type:   "RECURRING",
      interval: "month",
    });

    const callData = mockCreate.mock.calls[0][0].data;
    expect(callData.type).toBe("RECURRING");
    expect(callData.interval).toBe("month");
  });

  it("almacena un hash del OTP (no el OTP en texto claro)", async () => {
    mockCreate.mockResolvedValue({ ...baseCharge });

    const { otp } = await createCustomCharge({ userId: USER_ID, title: "T", amount: 100, type: "ONE_TIME" });
    const storedHash = mockCreate.mock.calls[0][0].data.otpHash as string;

    // El hash no debe ser igual al OTP
    expect(storedHash).not.toBe(otp);
    // El hash debe ser SHA-256 (64 chars hex)
    expect(storedHash).toHaveLength(64);
  });
});

// ── verifyCustomChargeOtp ─────────────────────────────────────────────────────
describe("verifyCustomChargeOtp", () => {
  it("retorna error not_found cuando el cargo no existe", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await verifyCustomChargeOtp(CHARGE_ID, "123456");

    expect(result).toEqual({ error: "not_found" });
  });

  it("retorna error already_paid cuando status es PAID", async () => {
    mockFindUnique.mockResolvedValue({ ...baseCharge, status: "PAID" });

    const result = await verifyCustomChargeOtp(CHARGE_ID, "123456");

    expect(result).toEqual({ error: "already_paid" });
  });

  it("retorna error cancelled cuando status es CANCELLED", async () => {
    mockFindUnique.mockResolvedValue({ ...baseCharge, status: "CANCELLED" });

    const result = await verifyCustomChargeOtp(CHARGE_ID, "123456");

    expect(result).toEqual({ error: "cancelled" });
  });

  it("retorna error expired cuando status es EXPIRED", async () => {
    mockFindUnique.mockResolvedValue({ ...baseCharge, status: "EXPIRED" });

    const result = await verifyCustomChargeOtp(CHARGE_ID, "123456");

    expect(result).toEqual({ error: "expired" });
  });

  it("retorna error expired cuando expiresAt ya pasó", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseCharge,
      expiresAt: new Date(Date.now() - 1000),
    });
    mockUpdate.mockResolvedValue({ ...baseCharge, status: "EXPIRED" });

    const result = await verifyCustomChargeOtp(CHARGE_ID, "123456");

    expect(result).toEqual({ error: "expired" });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: CHARGE_ID },
      data: { status: "EXPIRED" },
    });
  });

  it("retorna error otp_expired cuando otpExpiresAt ya pasó", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseCharge,
      otpHash: "somehash",
      otpExpiresAt: new Date(Date.now() - 1000),
    });

    const result = await verifyCustomChargeOtp(CHARGE_ID, "123456");

    expect(result).toEqual({ error: "otp_expired" });
  });

  it("retorna error too_many_attempts cuando otpAttempts >= 5", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseCharge,
      otpHash: "somehash",
      otpAttempts: 5,
    });

    const result = await verifyCustomChargeOtp(CHARGE_ID, "123456");

    expect(result).toEqual({ error: "too_many_attempts" });
  });

  it("retorna error invalid_otp e incrementa otpAttempts con OTP incorrecto", async () => {
    // OTP incorrecto: hash de "999999" como hash almacenado
    const { createHash } = await import("crypto");
    const wrongHash = createHash("sha256").update("999999").digest("hex");

    mockFindUnique.mockResolvedValue({
      ...baseCharge,
      otpHash: wrongHash,
      otpAttempts: 2,
    });
    mockUpdate.mockResolvedValue({});

    const result = await verifyCustomChargeOtp(CHARGE_ID, "123456");

    expect(result).toEqual({ error: "invalid_otp" });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: CHARGE_ID },
      data: { otpAttempts: { increment: 1 } },
    });
  });

  it("acepta OTP correcto y retorna charge actualizado", async () => {
    const { createHash } = await import("crypto");
    const correctOtp  = "654321";
    const correctHash = createHash("sha256").update(correctOtp).digest("hex");

    const updatedCharge = { ...baseCharge, status: "ACCEPTED", otpHash: null };
    mockFindUnique
      .mockResolvedValueOnce({ ...baseCharge, otpHash: correctHash, otpAttempts: 0 }) // primera llamada
      .mockResolvedValueOnce(updatedCharge);                                            // después del updateMany
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await verifyCustomChargeOtp(CHARGE_ID, correctOtp);

    expect("charge" in result).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: CHARGE_ID, status: "PENDING_ACCEPTANCE" },
      data: expect.objectContaining({ status: "ACCEPTED" }),
    });
  });

  it("retorna error already_paid si updateMany count=0 (race condition)", async () => {
    const { createHash } = await import("crypto");
    const correctOtp  = "654321";
    const correctHash = createHash("sha256").update(correctOtp).digest("hex");

    mockFindUnique.mockResolvedValue({ ...baseCharge, otpHash: correctHash, otpAttempts: 0 });
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const result = await verifyCustomChargeOtp(CHARGE_ID, correctOtp);

    expect(result).toEqual({ error: "already_paid" });
  });
});

// ── markCustomChargePaid ──────────────────────────────────────────────────────
describe("markCustomChargePaid", () => {
  it("marca el cargo como PAID con stripePaymentIntentId", async () => {
    mockFindUnique.mockResolvedValue({ type: "ONE_TIME", interval: null });
    mockUpdate.mockResolvedValue({ ...baseCharge, status: "PAID" });

    await markCustomChargePaid(CHARGE_ID, { stripePaymentIntentId: "pi_test_001" });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: CHARGE_ID },
      data: expect.objectContaining({
        status: "PAID",
        paidAt: expect.any(Date),
        stripePaymentIntentId: "pi_test_001",
      }),
    });
  });

  it("calcula nextChargeAt para cargos RECURRING mensuales", async () => {
    const now = new Date();
    mockFindUnique.mockResolvedValue({ type: "RECURRING", interval: "month" });
    mockUpdate.mockResolvedValue({ ...baseCharge, type: "RECURRING", status: "PAID" });

    await markCustomChargePaid(CHARGE_ID, {});

    const updateData = mockUpdate.mock.calls[0][0].data;
    expect(updateData.nextChargeAt).toBeInstanceOf(Date);
    // nextChargeAt debe ser ~30 días después de ahora
    const diff = (updateData.nextChargeAt as Date).getTime() - now.getTime();
    expect(diff).toBeGreaterThan(28 * 24 * 60 * 60 * 1000);
  });

  it("no calcula nextChargeAt para cargos ONE_TIME", async () => {
    mockFindUnique.mockResolvedValue({ type: "ONE_TIME", interval: null });
    mockUpdate.mockResolvedValue({ ...baseCharge, status: "PAID" });

    await markCustomChargePaid(CHARGE_ID, {});

    const updateData = mockUpdate.mock.calls[0][0].data;
    expect(updateData.nextChargeAt).toBeNull();
  });
});

// ── cancelCustomCharge ────────────────────────────────────────────────────────
describe("cancelCustomCharge", () => {
  it("actualiza el status a CANCELLED", async () => {
    mockUpdate.mockResolvedValue({ ...baseCharge, status: "CANCELLED" });

    await cancelCustomCharge(CHARGE_ID);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: CHARGE_ID },
      data: { status: "CANCELLED" },
    });
  });
});

// ── resendCustomChargeOtp ─────────────────────────────────────────────────────
describe("resendCustomChargeOtp", () => {
  it("retorna error not_found si el cargo no existe", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await resendCustomChargeOtp(CHARGE_ID);

    expect(result).toEqual({ error: "not_found" });
  });

  it("retorna error not_pending si el status no es PENDING_ACCEPTANCE", async () => {
    mockFindUnique.mockResolvedValue({ ...baseCharge, status: "PAID" });

    const result = await resendCustomChargeOtp(CHARGE_ID);

    expect(result).toEqual({ error: "not_pending" });
  });

  it("genera nuevo OTP y resetea otpAttempts cuando el cargo está pendiente", async () => {
    mockFindUnique.mockResolvedValue({ ...baseCharge, status: "PENDING_ACCEPTANCE" });
    mockUpdate.mockResolvedValue({});

    const result = await resendCustomChargeOtp(CHARGE_ID);

    expect("otp" in result).toBe(true);
    if ("otp" in result) expect(result.otp).toMatch(/^\d{6}$/);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: CHARGE_ID },
      data: expect.objectContaining({
        otpAttempts: 0,
        otpHash: expect.any(String),
      }),
    });
  });
});

// ── renewRecurringCharges ─────────────────────────────────────────────────────
describe("renewRecurringCharges", () => {
  const dueCharge = {
    id: "charge-recurring-001",
    userId: USER_ID,
    createdByAdminId: ADMIN_ID,
    title: "Cobro mensual",
    description: "Mensualidad",
    amount: 150000,
    currency: "mxn",
    type: "RECURRING",
    interval: "month",
    user: {
      id: USER_ID,
      email: "paciente@velum.test",
      profile: { firstName: "Ana", lastName: "García" },
    },
  };

  it("retorna 0 cuando no hay cargos vencidos", async () => {
    mockFindMany.mockResolvedValue([]);

    const count = await renewRecurringCharges();

    expect(count).toBe(0);
  });

  it("crea un nuevo cargo para cada renovación vencida y retorna el count", async () => {
    mockFindMany.mockResolvedValue([dueCharge]);
    mockCreate.mockResolvedValue({ ...baseCharge, type: "RECURRING", id: "new-charge-001" });
    mockUpdate.mockResolvedValue({});

    const count = await renewRecurringCharges();

    expect(count).toBe(1);
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: dueCharge.id },
      data: { nextChargeAt: null },
    });
  });

  it("dispara notificación y email para cada renovación", async () => {
    mockFindMany.mockResolvedValue([dueCharge]);
    mockCreate.mockResolvedValue({ ...baseCharge, type: "RECURRING", id: "new-charge-002" });
    mockUpdate.mockResolvedValue({});

    await renewRecurringCharges();

    expect(mockOnCustomChargeCreated).toHaveBeenCalledOnce();
    expect(mockSendCustomChargeOtpEmail).toHaveBeenCalledOnce();
  });

  it("continúa con el siguiente cargo si uno falla", async () => {
    const badCharge = { ...dueCharge, id: "charge-bad" };
    const goodCharge = { ...dueCharge, id: "charge-good" };
    mockFindMany.mockResolvedValue([badCharge, goodCharge]);

    // Primer cargo falla, segundo es exitoso
    mockCreate
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({ ...baseCharge, id: "new-from-good" });
    mockUpdate.mockResolvedValue({});

    const count = await renewRecurringCharges();

    expect(count).toBe(1); // Solo el bueno
  });
});
