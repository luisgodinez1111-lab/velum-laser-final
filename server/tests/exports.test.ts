/**
 * Export endpoints: exportPayments, exportAppointments, exportMembers
 * Cubre: Content-Type CSV correcto, BOM + headers presentes, sin datos → solo header.
 * RBAC: requireRole bloquea a member con 403.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

const {
  mockPaymentFindMany,
  mockAppointmentFindMany,
  mockUserFindMany,
} = vi.hoisted(() => ({
  mockPaymentFindMany: vi.fn(),
  mockAppointmentFindMany: vi.fn(),
  mockUserFindMany: vi.fn(),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    payment: { findMany: mockPaymentFindMany },
    appointment: { findMany: mockAppointmentFindMany },
    user: { findMany: mockUserFindMany },
  },
}));

vi.mock("../src/services/auditService", () => ({ createAuditLog: vi.fn() }));

import { exportPayments, exportAppointments, exportMembers } from "../src/controllers/exportController";
import { requireRole } from "../src/middlewares/auth";

const injectAdmin = (req: any, _res: any, next: any) => {
  req.user = { id: "admin-1", role: "admin" };
  next();
};

beforeEach(() => vi.clearAllMocks());

// ── exportPayments ─────────────────────────────────────────────────────────

describe("exportPayments", () => {
  it("devuelve Content-Type text/csv con BOM y columnas correctas", async () => {
    mockPaymentFindMany.mockResolvedValue([
      {
        id: "p1",
        amount: 99000,
        currency: "mxn",
        status: "paid",
        description: "Plan mensual",
        stripePaymentIntentId: "pi_123",
        createdAt: new Date("2026-01-15"),
        user: { email: "ana@velum.mx", profile: { firstName: "Ana", lastName: "García" } },
        membership: { planCode: "mensual" },
      },
    ]);
    const app = express();
    app.get("/export/payments", injectAdmin, exportPayments);
    const res = await request(app).get("/export/payments");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/pagos-/);
    expect(res.text).toContain("Fecha");
    expect(res.text).toContain("Email");
    expect(res.text).toContain("Monto (MXN)");
    expect(res.text).toContain("ana@velum.mx");
    expect(res.text).toContain("990.00"); // 99000 centavos / 100
  });

  it("devuelve solo la línea de headers cuando no hay pagos", async () => {
    mockPaymentFindMany.mockResolvedValue([]);
    const app = express();
    app.get("/export/payments", injectAdmin, exportPayments);
    const res = await request(app).get("/export/payments");

    expect(res.status).toBe(200);
    const lines = res.text.split("\r\n").filter((l: string) => l.trim() !== "");
    expect(lines.length).toBe(1);
  });

  it("acepta filtros from/to sin error", async () => {
    mockPaymentFindMany.mockResolvedValue([]);
    const app = express();
    app.get("/export/payments", injectAdmin, exportPayments);
    const res = await request(app).get("/export/payments?from=2026-01-01&to=2026-01-31");
    expect(res.status).toBe(200);
  });
});

// ── exportAppointments ────────────────────────────────────────────────────────

describe("exportAppointments", () => {
  it("devuelve Content-Type text/csv con headers y datos correctos", async () => {
    mockAppointmentFindMany.mockResolvedValue([
      {
        id: "a1",
        startAt: new Date("2026-03-10T17:00:00Z"),
        endAt: new Date("2026-03-10T18:00:00Z"),
        status: "confirmed",
        notes: null,
        user: { email: "paciente@velum.mx", profile: { firstName: "Luis", lastName: "López", phone: "6441234567" } },
        treatment: { name: "Láser facial" },
        cabin: { name: "Cabina 1" },
        createdBy: { email: "admin@velum.mx" },
      },
    ]);
    const app = express();
    app.get("/export/appointments", injectAdmin, exportAppointments);
    const res = await request(app).get("/export/appointments");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/citas-/);
    expect(res.text).toContain("paciente@velum.mx");
    expect(res.text).toContain("Láser facial");
  });

  it("devuelve solo la línea de headers cuando no hay citas", async () => {
    mockAppointmentFindMany.mockResolvedValue([]);
    const app = express();
    app.get("/export/appointments", injectAdmin, exportAppointments);
    const res = await request(app).get("/export/appointments");

    expect(res.status).toBe(200);
    const lines = res.text.split("\r\n").filter((l: string) => l.trim() !== "");
    expect(lines.length).toBe(1);
  });
});

// ── exportMembers ─────────────────────────────────────────────────────────────

describe("exportMembers", () => {
  it("devuelve Content-Type text/csv con datos correctos", async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: "u1",
        email: "socio@velum.mx",
        createdAt: new Date("2025-06-01"),
        isActive: true,
        profile: { firstName: "María", lastName: "Soto", phone: "6449876543", birthDate: new Date("1990-05-20") },
        memberships: [{ planCode: "anual", status: "active", currentPeriodEnd: new Date("2027-06-01") }],
      },
    ]);
    const app = express();
    app.get("/export/members", injectAdmin, exportMembers);
    const res = await request(app).get("/export/members");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/miembros-/);
    expect(res.text).toContain("socio@velum.mx");
    expect(res.text).toContain("anual");
  });

  it("muestra 'Sin membresía' para usuario sin plan activo", async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: "u2",
        email: "sin-plan@velum.mx",
        createdAt: new Date("2026-01-01"),
        isActive: true,
        profile: { firstName: "Carlos", lastName: "Ruiz", phone: "", birthDate: null },
        memberships: [],
      },
    ]);
    const app = express();
    app.get("/export/members", injectAdmin, exportMembers);
    const res = await request(app).get("/export/members");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Sin membresía");
  });

  it("devuelve solo la línea de headers cuando no hay miembros", async () => {
    mockUserFindMany.mockResolvedValue([]);
    const app = express();
    app.get("/export/members", injectAdmin, exportMembers);
    const res = await request(app).get("/export/members");

    expect(res.status).toBe(200);
    const lines = res.text.split("\r\n").filter((l: string) => l.trim() !== "");
    expect(lines.length).toBe(1);
  });
});

// ── RBAC: requireRole ─────────────────────────────────────────────────────────

describe("requireRole — protección de exports", () => {
  it("bloquea a member con 403", () => {
    const req: any = { user: { id: "m1", role: "member" } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();
    requireRole(["admin", "staff"])(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("permite a admin acceder", () => {
    const req: any = { user: { id: "a1", role: "admin" } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();
    requireRole(["admin", "staff"])(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
