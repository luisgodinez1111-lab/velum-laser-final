/**
 * VALERIA — Auth middleware
 * Cubre: sin token, usuario inactivo, token previo al cambio de contraseña,
 * token válido activo, requireRole con rol incorrecto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

// ── Mock Prisma ─────────────────────────────────────────────────────────────
const { mockFindUnique } = vi.hoisted(() => ({ mockFindUnique: vi.fn() }));
vi.mock("../src/db/prisma", () => ({
  prisma: { user: { findUnique: mockFindUnique } },
}));

import { signToken } from "../src/utils/auth";
import { requireAuth, requireRole } from "../src/middlewares/auth";

const OK = (_req: any, res: any) => res.status(200).json({ ok: true });

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.get("/protected", requireAuth, OK);
  app.get("/admin-only", requireAuth, requireRole(["admin"]), OK);
  return app;
};

beforeEach(() => vi.clearAllMocks());

describe("requireAuth", () => {
  it("rechaza petición sin token con 401", async () => {
    const app = buildApp();
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("rechaza token con firma inválida con 401", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer token.invalido.aqui");
    expect(res.status).toBe(401);
  });

  it("rechaza token de usuario inactivo con 401", async () => {
    mockFindUnique.mockResolvedValue({ isActive: false, passwordChangedAt: null });
    const token = signToken({ sub: "u1", role: "member" });
    const app = buildApp();
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("rechaza token emitido antes del último cambio de contraseña", async () => {
    // Sign token 1 hour in the past so its iat is before the password change
    const oneHourAgo = Date.now() - 3600 * 1000;
    vi.setSystemTime(oneHourAgo);
    const token = signToken({ sub: "u1", role: "member" });
    vi.useRealTimers();

    // Password changed 30 min ago (after token was issued)
    const changedAt = new Date(Date.now() - 1800 * 1000);
    mockFindUnique.mockResolvedValue({ isActive: true, passwordChangedAt: changedAt });

    const app = buildApp();
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expirada|expirado/i);
  });

  it("permite token válido de usuario activo sin cambio de contraseña", async () => {
    mockFindUnique.mockResolvedValue({ isActive: true, passwordChangedAt: null });
    const token = signToken({ sub: "u_active", role: "member" });
    const app = buildApp();
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("permite token válido de usuario con password cambiado ANTES del iat", async () => {
    // Password changed 2h ago, token issued 1h ago → token is newer → OK
    const changedAt = new Date(Date.now() - 7200 * 1000); // 2h ago
    mockFindUnique.mockResolvedValue({ isActive: true, passwordChangedAt: changedAt });
    const token = signToken({ sub: "u_ok", role: "admin" });
    const app = buildApp();
    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("requireRole", () => {
  it("bloquea a member intentando acceder a ruta de admin (403)", async () => {
    mockFindUnique.mockResolvedValue({ isActive: true, passwordChangedAt: null });
    const token = signToken({ sub: "u_member", role: "member" });
    const app = buildApp();
    const res = await request(app)
      .get("/admin-only")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("permite a admin acceder a ruta de admin (200)", async () => {
    mockFindUnique.mockResolvedValue({ isActive: true, passwordChangedAt: null });
    const token = signToken({ sub: "u_admin", role: "admin" });
    const app = buildApp();
    const res = await request(app)
      .get("/admin-only")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
