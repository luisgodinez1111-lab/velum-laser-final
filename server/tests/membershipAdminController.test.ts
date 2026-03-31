/**
 * Tests para controllers/membershipAdminController.ts
 * Cubre: listMemberships, updateMembershipStatus, adminActivateMembership
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
  mockMembershipCount,
  mockMembershipFindMany,
  mockMembershipUpdateMany,
  mockMembershipFindFirst,
  mockMembershipUpdate,
  mockAuditCreate,
} = vi.hoisted(() => ({
  mockMembershipCount:      vi.fn().mockResolvedValue(0),
  mockMembershipFindMany:   vi.fn().mockResolvedValue([]),
  mockMembershipUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
  mockMembershipFindFirst:  vi.fn(),
  mockMembershipUpdate:     vi.fn(),
  mockAuditCreate:          vi.fn().mockResolvedValue({}),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    membership: {
      count:      mockMembershipCount,
      findMany:   mockMembershipFindMany,
      updateMany: mockMembershipUpdateMany,
      findFirst:  mockMembershipFindFirst,
      update:     mockMembershipUpdate,
    },
  },
}));
vi.mock("../src/utils/env", () => ({
  env: { appUrl: "https://velum.test", nodeEnv: "test" },
}));
vi.mock("../src/services/auditService", () => ({ createAuditLog: mockAuditCreate }));

// ── Helpers ───────────────────────────────────────────────────────────────────
const ADMIN_ID = "admin-001";

const buildApp = async () => {
  const { listMemberships, updateMembershipStatus, adminActivateMembership } =
    await import("../src/controllers/membershipAdminController");

  const app = express();
  app.use(express.json());

  app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: ADMIN_ID, email: "admin@velum.test", role: "admin" } as AuthRequest["user"];
    next();
  });

  app.get("/admin/memberships", listMemberships);
  app.put("/admin/memberships/:userId", updateMembershipStatus);
  app.post("/admin/memberships/:userId/activate", adminActivateMembership);

  return app;
};

beforeEach(() => vi.clearAllMocks());

// ── listMemberships ────────────────────────────────────────────────────────────
describe("listMemberships", () => {
  it("retorna estructura paginada con datos", async () => {
    const memberships = [
      { id: "m1", userId: "u1", status: "active", user: { email: "a@b.com" } },
      { id: "m2", userId: "u2", status: "inactive", user: { email: "c@d.com" } },
    ];
    mockMembershipCount.mockResolvedValue(2);
    mockMembershipFindMany.mockResolvedValue(memberships);

    const app = await buildApp();
    const res = await request(app).get("/admin/memberships");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
  });

  it("respeta parámetros de paginación", async () => {
    mockMembershipCount.mockResolvedValue(100);
    mockMembershipFindMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await request(app).get("/admin/memberships?page=3&limit=10");

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(3);
    expect(res.body.limit).toBe(10);
    expect(mockMembershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 })
    );
  });

  it("devuelve lista vacía cuando no hay membresías", async () => {
    mockMembershipCount.mockResolvedValue(0);
    mockMembershipFindMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await request(app).get("/admin/memberships");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.pages).toBe(0);
  });

  it("calcula pages correctamente", async () => {
    mockMembershipCount.mockResolvedValue(55);
    mockMembershipFindMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await request(app).get("/admin/memberships?limit=10");

    expect(res.body.pages).toBe(6); // ceil(55/10)
  });
});

// ── updateMembershipStatus ────────────────────────────────────────────────────
describe("updateMembershipStatus", () => {
  const TARGET_USER = "user-target-001";

  it("actualiza status y retorna la membresía actualizada", async () => {
    const updated = { id: "m1", userId: TARGET_USER, status: "inactive" };
    mockMembershipUpdateMany.mockResolvedValue({ count: 1 });
    mockMembershipFindFirst.mockResolvedValue(updated);

    const app = await buildApp();
    const res = await request(app)
      .put(`/admin/memberships/${TARGET_USER}`)
      .send({ status: "inactive" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("inactive");
    expect(mockMembershipUpdateMany).toHaveBeenCalledWith({
      where: { userId: TARGET_USER },
      data: { status: "inactive" },
    });
  });

  it("retorna 404 cuando no existe membresía para ese usuario", async () => {
    mockMembershipUpdateMany.mockResolvedValue({ count: 0 });

    const app = await buildApp();
    const res = await request(app)
      .put(`/admin/memberships/${TARGET_USER}`)
      .send({ status: "active" });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/no encontrada/i);
  });

  it("registra audit log tras actualización", async () => {
    mockMembershipUpdateMany.mockResolvedValue({ count: 1 });
    mockMembershipFindFirst.mockResolvedValue({ id: "m1", userId: TARGET_USER, status: "paused" });

    const app = await buildApp();
    await request(app)
      .put(`/admin/memberships/${TARGET_USER}`)
      .send({ status: "paused" });

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "membership.update",
        userId: ADMIN_ID,
        targetUserId: TARGET_USER,
      })
    );
  });

  it("acepta todos los status válidos", async () => {
    const validStatuses = ["active", "inactive", "past_due", "canceled", "paused"];
    const app = await buildApp();

    for (const status of validStatuses) {
      mockMembershipUpdateMany.mockResolvedValue({ count: 1 });
      mockMembershipFindFirst.mockResolvedValue({ id: "m1", userId: TARGET_USER, status });

      const res = await request(app)
        .put(`/admin/memberships/${TARGET_USER}`)
        .send({ status });

      expect(res.status).toBe(200);
    }
  });
});

// ── adminActivateMembership ───────────────────────────────────────────────────
describe("adminActivateMembership", () => {
  const TARGET_USER = "user-activate-001";

  it("activa membresía con plan y status provistos", async () => {
    const existing = { id: "m-existing", userId: TARGET_USER };
    const updated  = { id: "m-existing", userId: TARGET_USER, status: "active", planCode: "premium", planId: "premium", source: "admin" };
    mockMembershipFindFirst.mockResolvedValue(existing);
    mockMembershipUpdate.mockResolvedValue(updated);

    const app = await buildApp();
    const res = await request(app)
      .post(`/admin/memberships/${TARGET_USER}/activate`)
      .send({ planCode: "premium", status: "active" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/actualizada/i);
    expect(res.body.membership.status).toBe("active");
    expect(mockMembershipUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m-existing" },
        data: expect.objectContaining({ status: "active", source: "admin" }),
      })
    );
  });

  it("retorna 404 cuando no existe membresía para ese usuario", async () => {
    mockMembershipFindFirst.mockResolvedValue(null);

    const app = await buildApp();
    const res = await request(app)
      .post(`/admin/memberships/${TARGET_USER}/activate`)
      .send({ planCode: "premium", status: "active" });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/no encontrada/i);
  });

  it("retorna 400 con status inválido", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post(`/admin/memberships/${TARGET_USER}/activate`)
      .send({ planCode: "premium", status: "INVALID_STATUS" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/inválido/i);
  });

  it("usa 'active' como status por defecto cuando no se provee", async () => {
    const existing = { id: "m2", userId: TARGET_USER };
    const updated  = { id: "m2", userId: TARGET_USER, status: "active", source: "admin" };
    mockMembershipFindFirst.mockResolvedValue(existing);
    mockMembershipUpdate.mockResolvedValue(updated);

    const app = await buildApp();
    const res = await request(app)
      .post(`/admin/memberships/${TARGET_USER}/activate`)
      .send({ planCode: "basic" });

    expect(res.status).toBe(200);
    expect(mockMembershipUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "active" }),
      })
    );
  });

  it("registra audit log tras activación", async () => {
    mockMembershipFindFirst.mockResolvedValue({ id: "m3", userId: TARGET_USER });
    mockMembershipUpdate.mockResolvedValue({ id: "m3", status: "active" });

    const app = await buildApp();
    await request(app)
      .post(`/admin/memberships/${TARGET_USER}/activate`)
      .send({ planCode: "gold", status: "active" });

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.patient.membership_activate",
        userId: ADMIN_ID,
        targetUserId: TARGET_USER,
      })
    );
  });

  it("retorna 500 cuando falla la DB", async () => {
    mockMembershipFindFirst.mockRejectedValue(new Error("DB connection failed"));

    const app = await buildApp();
    const res = await request(app)
      .post(`/admin/memberships/${TARGET_USER}/activate`)
      .send({ planCode: "premium", status: "active" });

    expect(res.status).toBe(500);
  });
});
