/**
 * Tests para controllers/userAdminController.ts
 * Cubre: listUsers, getUserById, getMemberHistory, updateUserRole
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
  mockUserCount,
  mockUserFindMany,
  mockUserFindUnique,
  mockUserUpdate,
  mockSessionFindMany,
  mockAppointmentFindMany,
  mockPaymentFindMany,
  mockAuditCreate,
  mockRevokeAllRefreshTokens,
  mockInvalidateAdminIdCache,
  mockReadStripePlanCatalog,
} = vi.hoisted(() => ({
  mockUserCount:                vi.fn().mockResolvedValue(0),
  mockUserFindMany:             vi.fn().mockResolvedValue([]),
  mockUserFindUnique:           vi.fn(),
  mockUserUpdate:               vi.fn(),
  mockSessionFindMany:          vi.fn().mockResolvedValue([]),
  mockAppointmentFindMany:      vi.fn().mockResolvedValue([]),
  mockPaymentFindMany:          vi.fn().mockResolvedValue([]),
  mockAuditCreate:              vi.fn().mockResolvedValue({}),
  mockRevokeAllRefreshTokens:   vi.fn().mockResolvedValue({}),
  mockInvalidateAdminIdCache:   vi.fn(),
  mockReadStripePlanCatalog:    vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    user:             { count: mockUserCount, findMany: mockUserFindMany, findUnique: mockUserFindUnique, update: mockUserUpdate },
    sessionTreatment: { findMany: mockSessionFindMany },
    appointment:      { findMany: mockAppointmentFindMany },
    payment:          { findMany: mockPaymentFindMany },
  },
}));
vi.mock("../src/services/auditService",             () => ({ createAuditLog: mockAuditCreate }));
vi.mock("../src/services/stripePlanCatalogService", () => ({ readStripePlanCatalog: mockReadStripePlanCatalog }));
vi.mock("../src/services/notificationService",      () => ({
  onNewMember: vi.fn().mockResolvedValue({}),
  invalidateAdminIdCache: mockInvalidateAdminIdCache,
}));
vi.mock("../src/services/emailService",             () => ({ sendPatientWelcomeEmail: vi.fn().mockResolvedValue({}) }));
vi.mock("../src/utils/auth",                        () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-pw"),
  generateTempPassword: vi.fn().mockReturnValue("TempPass1!"),
  revokeAllRefreshTokens: mockRevokeAllRefreshTokens,
}));
vi.mock("../src/utils/env",     () => ({ env: { nodeEnv: "test" } }));
vi.mock("../src/services/csvExportService", () => ({ escapeCsvField: vi.fn((v: unknown) => String(v)) }));
vi.mock("../src/utils/resolveClinicId",     () => ({ resolveClinicId: vi.fn().mockResolvedValue("clinic-1") }));

const ADMIN_ID = "admin-999";

const buildApp = async () => {
  const { listUsers, getUserById, getMemberHistory, updateUserRole } =
    await import("../src/controllers/userAdminController");

  const app = express();
  app.use(express.json());
  app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: ADMIN_ID, email: "admin@velum.test", role: "admin" } as AuthRequest["user"];
    next();
  });

  app.get("/users",                listUsers);
  app.get("/users/:userId",        getUserById);
  app.get("/users/:userId/history", getMemberHistory);
  app.put("/users/:userId/role",   updateUserRole);

  return app;
};

beforeEach(() => vi.clearAllMocks());

// ── listUsers ──────────────────────────────────────────────────────────────────
describe("listUsers", () => {
  it("retorna estructura paginada con datos", async () => {
    const users = [{ id: "u1", email: "a@t.com", memberships: [], profile: null, documents: [], medicalIntake: null }];
    mockUserCount.mockResolvedValue(1);
    mockUserFindMany.mockResolvedValue(users);

    const app = await buildApp();
    const res = await request(app).get("/users");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
  });

  it("aplica filtro de búsqueda por texto", async () => {
    mockUserCount.mockResolvedValue(0);
    mockUserFindMany.mockResolvedValue([]);

    const app = await buildApp();
    await request(app).get("/users?search=maria");

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });

  it("no incluye usuarios con deletedAt cuando no se filtra", async () => {
    mockUserCount.mockResolvedValue(0);
    mockUserFindMany.mockResolvedValue([]);

    const app = await buildApp();
    await request(app).get("/users");

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) })
    );
  });

  it("enriquece membresía con catalogEntry cuando hay match", async () => {
    const membership = { id: "m1", planId: "premium", status: "active" };
    const users = [{ id: "u1", email: "a@t.com", memberships: [membership], profile: null, documents: [], medicalIntake: null }];
    mockUserCount.mockResolvedValue(1);
    mockUserFindMany.mockResolvedValue(users);
    mockReadStripePlanCatalog.mockResolvedValue([
      { planCode: "premium", stripePriceId: "price_x", amount: 1500, interval: "month", name: "Premium" },
    ]);

    const app = await buildApp();
    const res = await request(app).get("/users");

    expect(res.body.data[0].memberships[0].catalogEntry).toMatchObject({ planCode: "premium" });
  });
});

// ── getUserById ────────────────────────────────────────────────────────────────
describe("getUserById", () => {
  it("retorna el usuario cuando existe", async () => {
    const user = { id: "u1", email: "a@t.com", memberships: [], profile: null, documents: [], medicalIntake: null };
    mockUserFindUnique.mockResolvedValue(user);

    const app = await buildApp();
    const res = await request(app).get("/users/u1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("u1");
  });

  it("retorna 404 cuando el usuario no existe", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await request(app).get("/users/no-existe");

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/no encontrado/i);
  });

  it("enriquece la membresía con catalogEntry", async () => {
    const membership = { id: "m1", planId: "gold", status: "active" };
    const user = { id: "u1", email: "a@t.com", memberships: [membership], profile: null, documents: [], medicalIntake: null };
    mockUserFindUnique.mockResolvedValue(user);
    mockReadStripePlanCatalog.mockResolvedValue([
      { planCode: "gold", stripePriceId: "price_g", amount: 2000, interval: "month", name: "Gold" },
    ]);

    const app = await buildApp();
    const res = await request(app).get("/users/u1");

    expect(res.body.memberships[0].catalogEntry).toMatchObject({ planCode: "gold" });
  });
});

// ── getMemberHistory ───────────────────────────────────────────────────────────
describe("getMemberHistory", () => {
  it("retorna sessions, appointments y payments del usuario", async () => {
    mockSessionFindMany.mockResolvedValue([{ id: "s1" }]);
    mockAppointmentFindMany.mockResolvedValue([{ id: "a1" }]);
    mockPaymentFindMany.mockResolvedValue([{ id: "p1" }]);

    const app = await buildApp();
    const res = await request(app).get("/users/u1/history");

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.appointments).toHaveLength(1);
    expect(res.body.payments).toHaveLength(1);
  });

  it("retorna arrays vacíos cuando no hay historial", async () => {
    mockSessionFindMany.mockResolvedValue([]);
    mockAppointmentFindMany.mockResolvedValue([]);
    mockPaymentFindMany.mockResolvedValue([]);
    const app = await buildApp();
    const res = await request(app).get("/users/u1/history");

    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
    expect(res.body.appointments).toEqual([]);
    expect(res.body.payments).toEqual([]);
  });
});

// ── updateUserRole ─────────────────────────────────────────────────────────────
describe("updateUserRole", () => {
  it("actualiza el rol del usuario correctamente", async () => {
    const target = { id: "u2", email: "u@t.com", role: "member" };
    const updated = { ...target, role: "staff" };
    mockUserFindUnique.mockResolvedValue(target);
    mockUserUpdate.mockResolvedValue(updated);

    const app = await buildApp();
    const res = await request(app)
      .put("/users/u2/role")
      .send({ role: "staff" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("staff");
    expect(mockUserUpdate).toHaveBeenCalledTimes(1);
  });

  it("retorna 404 cuando el usuario no existe", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const app = await buildApp();
    const res = await request(app)
      .put("/users/no-existe/role")
      .send({ role: "staff" });

    expect(res.status).toBe(404);
  });

  it("retorna 409 cuando el admin intenta cambiar su propio rol", async () => {
    const target = { id: ADMIN_ID, email: "admin@velum.test", role: "admin" };
    mockUserFindUnique.mockResolvedValue(target);

    const app = await buildApp();
    const res = await request(app)
      .put(`/users/${ADMIN_ID}/role`)
      .send({ role: "member" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/propio rol/i);
  });

  it("retorna el mismo registro si el rol ya es el mismo", async () => {
    const target = { id: "u3", email: "u@t.com", role: "member" };
    mockUserFindUnique.mockResolvedValue(target);

    const app = await buildApp();
    const res = await request(app)
      .put("/users/u3/role")
      .send({ role: "member" });

    expect(res.status).toBe(200);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("revoca tokens y registra audit log tras cambio exitoso", async () => {
    const target = { id: "u4", email: "u@t.com", role: "member" };
    mockUserFindUnique.mockResolvedValue(target);
    mockUserUpdate.mockResolvedValue({ ...target, role: "staff" });

    const app = await buildApp();
    await request(app).put("/users/u4/role").send({ role: "staff" });

    expect(mockRevokeAllRefreshTokens).toHaveBeenCalledWith("u4");
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.role.update" })
    );
  });

  it("retorna 403 si un no-system intenta asignar rol system", async () => {
    const target = { id: "u5", email: "u@t.com", role: "member" };
    mockUserFindUnique.mockResolvedValue(target);

    const app = await buildApp();
    const res = await request(app)
      .put("/users/u5/role")
      .send({ role: "system" });

    expect(res.status).toBe(403);
  });
});
