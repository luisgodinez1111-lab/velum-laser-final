import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

vi.mock("../src/db/prisma", () => ({
  prisma: {
    auditLog: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockResolvedValue([
        { id: "log1", action: "login",  createdAt: new Date("2026-03-01T12:00:00Z") },
        { id: "log2", action: "logout", createdAt: new Date("2026-03-01T11:00:00Z") },
      ]),
    },
  },
}));

vi.mock("../src/middlewares/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

import express from "express";
import request from "supertest";
import { listAuditLogsV1 } from "../src/controllers/v1AuditController";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.get("/api/v1/audit-logs", (req, _res, next) => {
    (req as any).user = { id: "admin1", role: "admin" };
    next();
  }, listAuditLogsV1);
  return app;
};

describe("GET /api/v1/audit-logs — paginación", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna logs, total, page, limit y pages", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/v1/audit-logs?page=1&limit=10");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("logs");
    expect(res.body).toHaveProperty("total", 2);
    expect(res.body).toHaveProperty("page", 1);
    expect(res.body).toHaveProperty("limit", 10);
    expect(res.body).toHaveProperty("pages", 1);
  });

  it("los logs tienen shape correcta", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/v1/audit-logs");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs[0]).toHaveProperty("id");
    expect(res.body.logs[0]).toHaveProperty("action");
  });

  it("sin ?include=relations no incluye joins de usuario", async () => {
    const { prisma } = await import("../src/db/prisma");
    const app = buildApp();
    await request(app).get("/api/v1/audit-logs");
    const call = vi.mocked(prisma.auditLog.findMany).mock.calls[0][0] as any;
    // When include=relations is absent, findMany should be called without include
    expect(call.include).toBeUndefined();
  });

  it("con ?include=relations incluye actorUser, targetUser, user", async () => {
    const { prisma } = await import("../src/db/prisma");
    const app = buildApp();
    await request(app).get("/api/v1/audit-logs?include=relations");
    const call = vi.mocked(prisma.auditLog.findMany).mock.calls[0][0] as any;
    expect(call.include).toBeDefined();
    expect(call.include).toHaveProperty("actorUser");
    expect(call.include).toHaveProperty("targetUser");
    expect(call.include).toHaveProperty("user");
  });

  it("orderBy usa tie-break (createdAt desc, id desc)", async () => {
    const { prisma } = await import("../src/db/prisma");
    const app = buildApp();
    await request(app).get("/api/v1/audit-logs");
    const call = vi.mocked(prisma.auditLog.findMany).mock.calls[0][0] as any;
    expect(Array.isArray(call.orderBy)).toBe(true);
    expect(call.orderBy[0]).toEqual({ createdAt: "desc" });
    expect(call.orderBy[1]).toEqual({ id: "desc" });
  });
});
