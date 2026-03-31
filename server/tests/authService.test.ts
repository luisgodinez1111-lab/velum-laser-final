/**
 * Tests para services/authService.ts
 * Cubre: createEmailVerification, consumeEmailVerification,
 *        createPasswordReset, consumePasswordReset,
 *        createConsentOtp, consumeConsentOtp
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET            = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL          = "postgresql://x:x@localhost/x";
process.env.INTEGRATIONS_ENC_KEY  = "test-enc-key-32-bytes-minimum!!";

// ── Mock Prisma ──────────────────────────────────────────────────────────────
const {
  mockEmailVerifDeleteMany,
  mockEmailVerifCreate,
  mockEmailVerifFindUnique,
  mockEmailVerifDelete,
  mockUserUpdate,
  mockPasswordResetDeleteMany,
  mockPasswordResetCreate,
  mockPasswordResetFindUnique,
  mockPasswordResetDelete,
  mockConsentOtpDeleteMany,
  mockConsentOtpCreate,
  mockConsentOtpFindUnique,
  mockConsentOtpDelete,
} = vi.hoisted(() => ({
  mockEmailVerifDeleteMany:   vi.fn().mockResolvedValue({ count: 0 }),
  mockEmailVerifCreate:       vi.fn(),
  mockEmailVerifFindUnique:   vi.fn(),
  mockEmailVerifDelete:       vi.fn().mockResolvedValue({}),
  mockUserUpdate:             vi.fn().mockResolvedValue({}),
  mockPasswordResetDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  mockPasswordResetCreate:    vi.fn(),
  mockPasswordResetFindUnique: vi.fn(),
  mockPasswordResetDelete:    vi.fn().mockResolvedValue({}),
  mockConsentOtpDeleteMany:   vi.fn().mockResolvedValue({ count: 0 }),
  mockConsentOtpCreate:       vi.fn(),
  mockConsentOtpFindUnique:   vi.fn(),
  mockConsentOtpDelete:       vi.fn().mockResolvedValue({}),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    emailVerificationToken: {
      deleteMany:  mockEmailVerifDeleteMany,
      create:      mockEmailVerifCreate,
      findUnique:  mockEmailVerifFindUnique,
      delete:      mockEmailVerifDelete,
    },
    user: { update: mockUserUpdate },
    passwordResetToken: {
      deleteMany:  mockPasswordResetDeleteMany,
      create:      mockPasswordResetCreate,
      findUnique:  mockPasswordResetFindUnique,
      delete:      mockPasswordResetDelete,
    },
    consentOtpToken: {
      deleteMany:  mockConsentOtpDeleteMany,
      create:      mockConsentOtpCreate,
      findUnique:  mockConsentOtpFindUnique,
      delete:      mockConsentOtpDelete,
    },
  },
}));

import {
  createEmailVerification,
  consumeEmailVerification,
  createPasswordReset,
  consumePasswordReset,
  createConsentOtp,
  consumeConsentOtp,
} from "../src/services/authService";

beforeEach(() => vi.clearAllMocks());

// ── createEmailVerification ──────────────────────────────────────────────────

describe("createEmailVerification", () => {
  it("elimina tokens anteriores del usuario antes de crear uno nuevo", async () => {
    mockEmailVerifCreate.mockResolvedValue({ id: "tok-1", userId: "u1", token: "u1|123456", expiresAt: new Date() });

    await createEmailVerification("u1");

    expect(mockEmailVerifDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(mockEmailVerifCreate).toHaveBeenCalledTimes(1);
  });

  it("retorna el record creado con el otp expuesto", async () => {
    const future = new Date(Date.now() + 24 * 3600_000);
    mockEmailVerifCreate.mockResolvedValue({ id: "tok-1", userId: "u1", token: "u1|654321", expiresAt: future });

    const result = await createEmailVerification("u1");

    expect(result).toHaveProperty("otp");
    expect(result.otp).toMatch(/^\d{6}$/);
    expect(result).toHaveProperty("id", "tok-1");
  });

  it("el token creado sigue el formato userId|otp", async () => {
    let capturedData: Record<string, unknown> = {};
    mockEmailVerifCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return Promise.resolve({ id: "tok-1", ...data });
    });

    const result = await createEmailVerification("user-abc");
    const [tokenUserId, tokenOtp] = (capturedData.token as string).split("|");

    expect(tokenUserId).toBe("user-abc");
    expect(tokenOtp).toBe(result.otp);
  });
});

// ── consumeEmailVerification ─────────────────────────────────────────────────

describe("consumeEmailVerification", () => {
  it("retorna null cuando no existe el token en DB", async () => {
    mockEmailVerifFindUnique.mockResolvedValue(null);

    const result = await consumeEmailVerification("u1", "123456");

    expect(result).toBeNull();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("retorna null cuando el token ha expirado", async () => {
    const past = new Date(Date.now() - 1000);
    mockEmailVerifFindUnique.mockResolvedValue({ id: "t1", userId: "u1", token: "u1|123456", expiresAt: past });

    const result = await consumeEmailVerification("u1", "123456");

    expect(result).toBeNull();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("marca el email como verificado y elimina el token cuando es válido", async () => {
    const future = new Date(Date.now() + 3_600_000);
    const record = { id: "t1", userId: "u1", token: "u1|123456", expiresAt: future };
    mockEmailVerifFindUnique.mockResolvedValue(record);

    const result = await consumeEmailVerification("u1", "123456");

    expect(result).toEqual(record);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" }, data: { emailVerifiedAt: expect.any(Date) } })
    );
    expect(mockEmailVerifDelete).toHaveBeenCalledWith({ where: { token: "u1|123456" } });
  });

  it("busca por token combinado userId|otp", async () => {
    mockEmailVerifFindUnique.mockResolvedValue(null);

    await consumeEmailVerification("usr-xyz", "999888");

    expect(mockEmailVerifFindUnique).toHaveBeenCalledWith({ where: { token: "usr-xyz|999888" } });
  });
});

// ── createPasswordReset ──────────────────────────────────────────────────────

describe("createPasswordReset", () => {
  it("elimina resets anteriores y crea uno nuevo", async () => {
    mockPasswordResetCreate.mockResolvedValue({ id: "pr-1", userId: "u1", token: "hex-token", expiresAt: new Date() });

    await createPasswordReset("u1");

    expect(mockPasswordResetDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(mockPasswordResetCreate).toHaveBeenCalledTimes(1);
  });

  it("retorna un token hexadecimal de 64 chars", async () => {
    let capturedData: Record<string, unknown> = {};
    mockPasswordResetCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return Promise.resolve({ id: "pr-1", ...data });
    });

    const result = await createPasswordReset("u1");

    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(capturedData.token).toBe(result.token);
  });

  it("el token expira en ~2 horas", async () => {
    let capturedData: Record<string, unknown> = {};
    mockPasswordResetCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return Promise.resolve({ id: "pr-1", ...data });
    });

    await createPasswordReset("u1");

    const expiresAt = capturedData.expiresAt as Date;
    const diffMs = expiresAt.getTime() - Date.now();
    const diffHours = diffMs / (1000 * 3600);
    expect(diffHours).toBeGreaterThan(1.9);
    expect(diffHours).toBeLessThan(2.1);
  });
});

// ── consumePasswordReset ─────────────────────────────────────────────────────

describe("consumePasswordReset", () => {
  it("retorna null cuando el token no existe", async () => {
    mockPasswordResetFindUnique.mockResolvedValue(null);
    expect(await consumePasswordReset("invalid-token")).toBeNull();
  });

  it("retorna null cuando el token expiró", async () => {
    const past = new Date(Date.now() - 1000);
    mockPasswordResetFindUnique.mockResolvedValue({ id: "r1", userId: "u1", token: "tok", expiresAt: past });
    expect(await consumePasswordReset("tok")).toBeNull();
  });

  it("elimina el token y retorna el record cuando es válido", async () => {
    const future = new Date(Date.now() + 3_600_000);
    const record = { id: "r1", userId: "u1", token: "valid-tok", expiresAt: future };
    mockPasswordResetFindUnique.mockResolvedValue(record);

    const result = await consumePasswordReset("valid-tok");

    expect(result).toEqual(record);
    expect(mockPasswordResetDelete).toHaveBeenCalledWith({ where: { token: "valid-tok" } });
  });
});

// ── createConsentOtp ─────────────────────────────────────────────────────────

describe("createConsentOtp", () => {
  it("elimina OTPs anteriores y crea uno nuevo", async () => {
    mockConsentOtpCreate.mockResolvedValue({ id: "co-1", userId: "u1", token: "u1|123456", expiresAt: new Date() });

    await createConsentOtp("u1");

    expect(mockConsentOtpDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(mockConsentOtpCreate).toHaveBeenCalledTimes(1);
  });

  it("retorna otp de 6 dígitos", async () => {
    mockConsentOtpCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "co-1", ...data })
    );

    const result = await createConsentOtp("u1");

    expect(result.otp).toMatch(/^\d{6}$/);
  });

  it("el token expira en ~1 hora", async () => {
    let capturedData: Record<string, unknown> = {};
    mockConsentOtpCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      capturedData = data;
      return Promise.resolve({ id: "co-1", ...data });
    });

    await createConsentOtp("u1");

    const expiresAt = capturedData.expiresAt as Date;
    const diffHours = (expiresAt.getTime() - Date.now()) / (1000 * 3600);
    expect(diffHours).toBeGreaterThan(0.9);
    expect(diffHours).toBeLessThan(1.1);
  });
});

// ── consumeConsentOtp ────────────────────────────────────────────────────────

describe("consumeConsentOtp", () => {
  it("retorna null cuando el token no existe", async () => {
    mockConsentOtpFindUnique.mockResolvedValue(null);
    expect(await consumeConsentOtp("u1", "123456")).toBeNull();
  });

  it("retorna null cuando expiró", async () => {
    const past = new Date(Date.now() - 1);
    mockConsentOtpFindUnique.mockResolvedValue({ id: "c1", expiresAt: past });
    expect(await consumeConsentOtp("u1", "123456")).toBeNull();
  });

  it("elimina el token y retorna el record cuando es válido", async () => {
    const future = new Date(Date.now() + 3_600_000);
    const record = { id: "c1", userId: "u1", token: "u1|654321", expiresAt: future };
    mockConsentOtpFindUnique.mockResolvedValue(record);

    const result = await consumeConsentOtp("u1", "654321");

    expect(result).toEqual(record);
    expect(mockConsentOtpDelete).toHaveBeenCalledWith({ where: { token: "u1|654321" } });
  });
});
