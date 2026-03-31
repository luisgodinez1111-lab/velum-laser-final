/**
 * Tests para controllers/intakeAdminController.ts
 * Cubre: adminUpdatePatientIntake — update, 404, 413 firma grande, audit log
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../src/middlewares/auth";

process.env.JWT_SECRET           = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL         = "postgresql://x:x@localhost/x";
process.env.INTEGRATIONS_ENC_KEY = "test-enc-key-for-tests-padded!!!";

const {
  mockIntakeFindUnique,
  mockIntakeUpdate,
  mockAuditCreate,
  mockDecrypt,
} = vi.hoisted(() => ({
  mockIntakeFindUnique: vi.fn(),
  mockIntakeUpdate:     vi.fn(),
  mockAuditCreate:      vi.fn().mockResolvedValue({}),
  mockDecrypt:          vi.fn((v: string) => v), // pass-through por defecto
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    medicalIntake: { findUnique: mockIntakeFindUnique, update: mockIntakeUpdate },
  },
}));
vi.mock("../src/services/auditService", () => ({ createAuditLog: mockAuditCreate }));
vi.mock("../src/utils/crypto", () => ({
  decrypt: mockDecrypt,
  encrypt: vi.fn((v: string) => `enc1:${v}`),
  generateOtp: vi.fn().mockReturnValue("123456"),
}));
vi.mock("../src/utils/env", () => ({ env: { nodeEnv: "test" } }));

const ADMIN_ID  = "admin-001";
const TARGET_ID = "patient-001";

const buildApp = async () => {
  const { adminUpdatePatientIntake } = await import("../src/controllers/intakeAdminController");
  const app = express();
  app.use(express.json({ limit: "10mb" })); // necesario para test de firma grande
  app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: ADMIN_ID, email: "admin@velum.test", role: "admin" } as AuthRequest["user"];
    next();
  });
  app.put("/admin/intake/:userId", adminUpdatePatientIntake);
  return app;
};

beforeEach(() => vi.clearAllMocks());

describe("adminUpdatePatientIntake", () => {
  const existingIntake = {
    id: "int-1",
    userId: TARGET_ID,
    status: "pending",
    consentAccepted: false,
    phototype: null,
    signatureImageData: null,
  };

  it("actualiza el expediente y retorna el registro actualizado", async () => {
    const updated = { ...existingIntake, phototype: "II", status: "pending" };
    mockIntakeFindUnique.mockResolvedValue(existingIntake);
    mockIntakeUpdate.mockResolvedValue(updated);

    const app = await buildApp();
    const res = await request(app)
      .put(`/admin/intake/${TARGET_ID}`)
      .send({ phototype: "II" });

    expect(res.status).toBe(200);
    expect(res.body.phototype).toBe("II");
    expect(mockIntakeUpdate).toHaveBeenCalledTimes(1);
  });

  it("retorna 404 cuando el expediente no existe", async () => {
    mockIntakeFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await request(app)
      .put(`/admin/intake/${TARGET_ID}`)
      .send({ phototype: "I" });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/no encontrado/i);
    expect(mockIntakeUpdate).not.toHaveBeenCalled();
  });

  it("retorna 413 cuando la firma es demasiado grande", async () => {
    mockIntakeFindUnique.mockResolvedValue(existingIntake);

    const bigSignature = "A".repeat(3_100_000); // > 3MB
    const app = await buildApp();
    const res = await request(app)
      .put(`/admin/intake/${TARGET_ID}`)
      .send({ signatureImageData: bigSignature });

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/demasiado grande/i);
    expect(mockIntakeUpdate).not.toHaveBeenCalled();
  });

  it("cambia status a 'submitted' cuando consentAccepted=true y phototype", async () => {
    mockIntakeFindUnique.mockResolvedValue(existingIntake);
    mockIntakeUpdate.mockResolvedValue({ ...existingIntake, status: "submitted" });

    const app = await buildApp();
    await request(app)
      .put(`/admin/intake/${TARGET_ID}`)
      .send({ consentAccepted: true, phototype: "III" });

    expect(mockIntakeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "submitted" }),
      })
    );
  });

  it("registra audit log tras la actualización", async () => {
    const updated = { ...existingIntake };
    mockIntakeFindUnique.mockResolvedValue(existingIntake);
    mockIntakeUpdate.mockResolvedValue(updated);

    const app = await buildApp();
    await request(app)
      .put(`/admin/intake/${TARGET_ID}`)
      .send({ phototype: "I" });

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.patient.intake_update",
        userId: ADMIN_ID,
        targetUserId: TARGET_ID,
      })
    );
  });

  it("retorna 500 cuando falla la DB", async () => {
    mockIntakeFindUnique.mockRejectedValue(new Error("DB error"));

    const app = await buildApp();
    const res = await request(app)
      .put(`/admin/intake/${TARGET_ID}`)
      .send({ phototype: "II" });

    expect(res.status).toBe(500);
  });
});
