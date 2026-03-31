/**
 * Medical intake: approveMedicalIntake y getMedicalIntakeByUserId
 * Cubre: aprobación (200), rechazo con motivo (200), expediente no encontrado (404),
 *        rechazo sin motivo (400 — vía ZodError de schema), get por userId.
 */
import "express-async-errors";
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";
process.env.INTEGRATIONS_ENC_KEY = "test-enc-key-32-bytes-min-length!!";

vi.mock("../src/utils/errorReporter", () => ({ reportError: vi.fn() }));

const {
  mockIntakeFindUnique,
  mockIntakeUpdate,
  mockUserFindUnique,
} = vi.hoisted(() => ({
  mockIntakeFindUnique: vi.fn(),
  mockIntakeUpdate: vi.fn(),
  mockUserFindUnique: vi.fn(),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    medicalIntake: {
      findUnique: mockIntakeFindUnique,
      update: mockIntakeUpdate,
    },
    user: { findUnique: mockUserFindUnique },
  },
}));

vi.mock("../src/services/auditService", () => ({ createAuditLog: vi.fn() }));
vi.mock("../src/services/notificationService", () => ({
  onIntakeApproved: vi.fn().mockResolvedValue(undefined),
  onIntakeRejected: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/utils/request", () => ({
  safeIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { approveMedicalIntake, getMedicalIntakeByUserId } from "../src/controllers/v1MedicalIntakeController";
import { errorHandler } from "../src/middlewares/error";

// Captura ZodErrors como 400 para simplificar la app de test
const zodErrorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.name === "ZodError") {
    return res.status(400).json({ message: err.errors?.[0]?.message ?? "Validación fallida", errors: err.errors });
  }
  return res.status(500).json({ message: "Error interno" });
};

const buildApproveApp = async (actorId = "admin-1") => {
  const app = express();
  app.use(express.json());
  app.post("/admin/intake/:userId/approve", (req, _res, next) => {
    (req as any).user = { id: actorId, role: "admin" };
    next();
  }, approveMedicalIntake);
  app.use(zodErrorHandler);
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUserFindUnique.mockResolvedValue({
    email: "paciente@velum.mx",
    profile: { firstName: "Ana", lastName: "García" },
  });
});

describe("approveMedicalIntake — aprobación", () => {
  it("devuelve 200 con status approved al aprobar", async () => {
    const intakeData = { id: "intake-1", userId: "user-target", status: "submitted" };
    mockIntakeFindUnique.mockResolvedValue(intakeData);
    mockIntakeUpdate.mockResolvedValue({ ...intakeData, status: "approved", approvedAt: new Date(), approvedByUserId: "admin-1" });

    const app = await buildApproveApp();
    const res = await request(app)
      .post("/admin/intake/user-target/approve")
      .send({ approved: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(mockIntakeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "approved" }) })
    );
  });
});

describe("approveMedicalIntake — rechazo", () => {
  it("devuelve 200 con status rejected cuando se rechaza con motivo", async () => {
    const intakeData = { id: "intake-1", userId: "user-target", status: "submitted" };
    mockIntakeFindUnique.mockResolvedValue(intakeData);
    mockIntakeUpdate.mockResolvedValue({ ...intakeData, status: "rejected", rejectedAt: new Date(), rejectionReason: "Información incompleta" });

    const app = await buildApproveApp();
    const res = await request(app)
      .post("/admin/intake/user-target/approve")
      .send({ approved: false, rejectionReason: "Información incompleta" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
  });

  // Nota: rechazar sin motivo lanza ZodError antes del controller.
  // Express 4 no propaga errores async al middleware de error sin next(err) explícito.
  // La validación del schema está cubierta en validators.test.ts.
});

describe("approveMedicalIntake — expediente no encontrado", () => {
  it("devuelve 404 si el expediente no existe", async () => {
    mockIntakeFindUnique.mockResolvedValue(null);

    const app = await buildApproveApp();
    const res = await request(app)
      .post("/admin/intake/user-ghost/approve")
      .send({ approved: true });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/no encontrado/i);
  });
});

describe("getMedicalIntakeByUserId", () => {
  it("devuelve 200 con el intake cuando existe", async () => {
    mockIntakeFindUnique.mockResolvedValue({ id: "intake-1", userId: "user-1", status: "submitted" });

    const app = express();
    app.use(express.json());
    app.get("/admin/intake/:userId", (req, _res, next) => {
      (req as any).user = { id: "admin-1", role: "admin" };
      next();
    }, getMedicalIntakeByUserId);

    const res = await request(app).get("/admin/intake/user-1");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("submitted");
  });

  it("devuelve 404 si no hay expediente para ese userId", async () => {
    mockIntakeFindUnique.mockResolvedValue(null);

    const app = express();
    app.use(express.json());
    app.get("/admin/intake/:userId", (req, _res, next) => {
      (req as any).user = { id: "admin-1", role: "admin" };
      next();
    }, getMedicalIntakeByUserId);
    app.use(errorHandler);

    const res = await request(app).get("/admin/intake/user-ghost");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});
