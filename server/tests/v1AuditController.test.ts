/**
 * Tests para controllers/v1AuditController.ts
 * Cubre: listAuditLogsV1 — paginación, filtros, include relations
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../src/middlewares/auth";

process.env.JWT_SECRET   = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

const { mockAuditLogCount, mockAuditLogFindMany } = vi.hoisted(() => ({
  mockAuditLogCount:    vi.fn().mockResolvedValue(0),
  mockAuditLogFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: { auditLog: { count: mockAuditLogCount, findMany: mockAuditLogFindMany } },
}));
vi.mock("../src/utils/env", () => ({ env: { nodeEnv: "test" } }));

const buildApp = async () => {
  const { listAuditLogsV1 } = await import("../src/controllers/v1AuditController");
  const app = express();
  app.use(express.json());
  app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: "admin-1", email: "admin@velum.test", role: "admin" } as AuthRequest["user"];
    next();
  });
  app.get("/audit", listAuditLogsV1);
  return app;
};

beforeEach(() => vi.clearAllMocks());

describe("listAuditLogsV1", () => {
  it("retorna estructura paginada con logs", async () => {
    const logs = [{ id: "a1", action: "user.login", createdAt: new Date() }];
    mockAuditLogCount.mockResolvedValue(1);
    mockAuditLogFindMany.mockResolvedValue(logs);

    const app = await buildApp();
    const res = await request(app).get("/audit");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
  });

  it("filtra por action cuando se pasa como query", async () => {
    mockAuditLogCount.mockResolvedValue(0);
    mockAuditLogFindMany.mockResolvedValue([]);

    const app = await buildApp();
    await request(app).get("/audit?action=user.login");

    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ action: "user.login" }) })
    );
  });

  it("filtra por actorUserId", async () => {
    mockAuditLogCount.mockResolvedValue(0);
    mockAuditLogFindMany.mockResolvedValue([]);

    const app = await buildApp();
    await request(app).get("/audit?actorUserId=user-123");

    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ actorUserId: "user-123" }) })
    );
  });

  it("no incluye relations por defecto", async () => {
    mockAuditLogCount.mockResolvedValue(0);
    mockAuditLogFindMany.mockResolvedValue([]);

    const app = await buildApp();
    await request(app).get("/audit");

    const call = mockAuditLogFindMany.mock.calls[0][0];
    expect(call.include).toBeUndefined();
  });

  it("incluye relations cuando include=relations", async () => {
    mockAuditLogCount.mockResolvedValue(0);
    mockAuditLogFindMany.mockResolvedValue([]);

    const app = await buildApp();
    await request(app).get("/audit?include=relations");

    const call = mockAuditLogFindMany.mock.calls[0][0];
    expect(call.include).toBeDefined();
    expect(call.include).toHaveProperty("actorUser");
  });

  it("calcula pages correctamente", async () => {
    mockAuditLogCount.mockResolvedValue(75);
    mockAuditLogFindMany.mockResolvedValue([]);

    const app = await buildApp();
    const res = await request(app).get("/audit?limit=25");

    expect(res.body.pages).toBe(3); // ceil(75/25)
  });
});
