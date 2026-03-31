/**
 * Admin user deletion: deleteUser con verificación OTP
 * Cubre: auto-eliminación (400), OTP ausente (400), OTP no solicitado (400),
 *        OTP incorrecto (400), usuario no encontrado (404), eliminación exitosa (200).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";

const {
  mockUserFindUnique,
  mockDeleteOtpFindUnique,
  mockDeleteOtpDelete,
  mockDeleteOtpDeleteMany,
  mockUserUpdate,
  mockCustomChargeFindMany,
  mockAppointmentUpdateMany,
} = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockDeleteOtpFindUnique: vi.fn(),
  mockDeleteOtpDelete: vi.fn().mockResolvedValue({}),
  mockDeleteOtpDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  mockUserUpdate: vi.fn().mockResolvedValue({}),
  mockCustomChargeFindMany: vi.fn().mockResolvedValue([]),
  mockAppointmentUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique, update: mockUserUpdate },
    deleteOtp: {
      findUnique: mockDeleteOtpFindUnique,
      delete: mockDeleteOtpDelete,
      deleteMany: mockDeleteOtpDeleteMany,
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    membership: { findUnique: vi.fn().mockResolvedValue(null) },
    customCharge: { findMany: mockCustomChargeFindMany },
    appointment: { updateMany: mockAppointmentUpdateMany },
    sessionTreatment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

vi.mock("../src/services/auditService", () => ({ createAuditLog: vi.fn() }));
vi.mock("../src/services/notificationService", () => ({
  invalidateAdminIdCache: vi.fn(),
  onNewMember: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/adminAccessService", () => ({
  PERMISSIONS_CATALOG: [],
  readAccessStore: vi.fn().mockResolvedValue({}),
  getEffectivePermissions: vi.fn().mockReturnValue([]),
  setUserPermissions: vi.fn().mockResolvedValue(undefined),
  defaultPermissionsByRole: vi.fn().mockReturnValue([]),
}));
vi.mock("../src/services/whatsappMetaService", () => ({
  sendWhatsappOtpCode: vi.fn(),
  getEffectiveWhatsappMetaConfig: vi.fn(),
  normalizePhone: vi.fn(),
}));
vi.mock("../src/services/emailService", () => ({
  sendDeleteUserOtpEmail: vi.fn().mockResolvedValue(undefined),
  sendAdminInvitationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/stripeService", () => ({
  stripe: { subscriptions: { cancel: vi.fn().mockResolvedValue({}) } },
}));
vi.mock("../src/utils/auth", () => ({
  revokeAllRefreshTokens: vi.fn().mockResolvedValue(undefined),
  hashPassword: vi.fn().mockResolvedValue("hashed"),
  validatePasswordStrength: vi.fn().mockReturnValue(null),
  generateTempPassword: vi.fn().mockReturnValue("Temp1234!"),
}));
vi.mock("../src/utils/totp", () => ({
  generateTotpSecret: vi.fn().mockReturnValue("secret"),
  verifyTotpCode: vi.fn().mockReturnValue(true),
  getTotpUri: vi.fn().mockReturnValue("otpauth://totp/test"),
}));

const buildApp = async (actorId = "admin-1") => {
  const { deleteUser } = await import("../src/controllers/adminAccessController");
  const app = express();
  app.use(express.json());
  app.delete("/admin/users/:userId", (req, res, next) => {
    (req as any).user = { id: actorId, role: "admin" };
    next();
  }, deleteUser);
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCustomChargeFindMany.mockResolvedValue([]);
  mockDeleteOtpDeleteMany.mockResolvedValue({ count: 0 });
  mockDeleteOtpDelete.mockResolvedValue({});
  mockAppointmentUpdateMany.mockResolvedValue({ count: 0 });
});

describe("DELETE /admin/users/:userId — deleteUser", () => {
  it("devuelve 400 si el admin intenta eliminarse a sí mismo", async () => {
    const app = await buildApp("admin-1");
    const res = await request(app)
      .delete("/admin/users/admin-1")
      .send({ otp: "123456" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/propia cuenta/i);
  });

  it("devuelve 400 si no se envía OTP", async () => {
    const app = await buildApp("admin-1");
    const res = await request(app)
      .delete("/admin/users/user-target")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/otp/i);
  });

  it("devuelve 400 si no hay OTP activo registrado", async () => {
    mockDeleteOtpFindUnique.mockResolvedValue(null);
    const app = await buildApp("admin-1");
    const res = await request(app)
      .delete("/admin/users/user-target")
      .send({ otp: "123456" });
    expect(res.status).toBe(400);
  });

  it("devuelve 400 si el OTP es incorrecto", async () => {
    const hash = await bcrypt.hash("CORRECTO", 10);
    mockDeleteOtpFindUnique.mockResolvedValue({
      actorUserId: "admin-1",
      targetUserId: "user-target",
      otpHash: hash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
    });
    const app = await buildApp("admin-1");
    const res = await request(app)
      .delete("/admin/users/user-target")
      .send({ otp: "INCORRECTO" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/incorrecto/i);
  });

  it("devuelve 404 si el usuario target no existe con OTP válido", async () => {
    const otp = "123456";
    const hash = await bcrypt.hash(otp, 10);
    mockDeleteOtpFindUnique.mockResolvedValue({
      actorUserId: "admin-1",
      targetUserId: "user-ghost",
      otpHash: hash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
    });
    mockUserFindUnique.mockResolvedValue(null);
    const app = await buildApp("admin-1");
    const res = await request(app)
      .delete("/admin/users/user-ghost")
      .send({ otp });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/no encontrado/i);
  });

  it("devuelve 200 y hace soft-delete cuando el OTP es correcto", async () => {
    const otp = "999888";
    const hash = await bcrypt.hash(otp, 10);
    mockDeleteOtpFindUnique.mockResolvedValue({
      actorUserId: "admin-1",
      targetUserId: "user-target",
      otpHash: hash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
    });
    mockUserFindUnique.mockResolvedValue({
      id: "user-target",
      email: "paciente@velum.mx",
      role: "member",
    });
    mockUserUpdate.mockResolvedValue({ id: "user-target", deletedAt: new Date(), isActive: false });
    const app = await buildApp("admin-1");
    const res = await request(app)
      .delete("/admin/users/user-target")
      .send({ otp });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/eliminado/i);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-target" } })
    );
  });
});
