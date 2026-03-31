/**
 * Tests para controllers/v1SessionController.ts
 * Cubre: createSessionTreatment, listMySessions, adminListSessions, addSessionFeedback
 */
import "express-async-errors"; // parche global para que Express reenvíe async throws al error middleware
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../src/middlewares/auth";

process.env.JWT_SECRET   = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

const {
  mockAppointmentFindUnique,
  mockSessionCreate,
  mockSessionFindMany,
  mockSessionCount,
  mockSessionFindUnique,
  mockSessionUpdate,
  mockAppointmentUpdate,
  mockTransaction,
  mockCreateAuditLog,
} = vi.hoisted(() => ({
  mockAppointmentFindUnique: vi.fn(),
  mockSessionCreate:         vi.fn(),
  mockSessionFindMany:       vi.fn(),
  mockSessionCount:          vi.fn(),
  mockSessionFindUnique:     vi.fn(),
  mockSessionUpdate:         vi.fn(),
  mockAppointmentUpdate:     vi.fn(),
  mockTransaction:           vi.fn(),
  mockCreateAuditLog:        vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    appointment: {
      findUnique: mockAppointmentFindUnique,
      update:     mockAppointmentUpdate,
    },
    sessionTreatment: {
      create:     mockSessionCreate,
      findMany:   mockSessionFindMany,
      count:      mockSessionCount,
      findUnique: mockSessionFindUnique,
      update:     mockSessionUpdate,
    },
    $transaction: mockTransaction,
  },
}));

vi.mock("../src/services/auditService", () => ({
  createAuditLog: mockCreateAuditLog,
}));

vi.mock("../src/utils/env", () => ({
  env: { nodeEnv: "test" },
}));

const STAFF_ID   = "staff-001";
const MEMBER_ID  = "member-001";
const SESSION_ID = "session-001";
const APPT_ID    = "appt-001";

type Role = "staff" | "admin" | "member";

const buildApp = async (role: Role = "staff", userId: string = STAFF_ID) => {
  const {
    createSessionTreatment,
    listMySessions,
    adminListSessions,
    addSessionFeedback,
  } = await import("../src/controllers/v1SessionController");
  const { errorHandler } = await import("../src/middlewares/error");

  const app = express();
  app.use(express.json());
  app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: userId, role } as AuthRequest["user"];
    next();
  });

  app.post("/sessions",          createSessionTreatment);
  app.get("/sessions/me",        listMySessions);
  app.get("/sessions/admin",     adminListSessions);
  app.patch("/sessions/:sessionId/feedback", addSessionFeedback);

  app.use(errorHandler);

  return app;
};

const baseSession = {
  id: SESSION_ID,
  userId: MEMBER_ID,
  staffUserId: STAFF_ID,
  appointmentId: APPT_ID,
  notes: "Todo bien",
  adverseEvents: null,
  laserParametersJson: null,
  createdAt: new Date(),
  memberFeedback: null,
  feedbackAt: null,
  appointment: { id: APPT_ID, startAt: new Date(), status: "completed" },
  staffUser: { id: STAFF_ID, email: "staff@velum.test" },
  user: { id: MEMBER_ID, email: "paciente@velum.test" },
};

beforeEach(() => vi.clearAllMocks());

// ── createSessionTreatment ────────────────────────────────────────────────────
describe("createSessionTreatment", () => {
  const validBody = {
    userId: MEMBER_ID,
    appointmentId: APPT_ID,
    notes: "Sesión completada sin incidentes",
  };

  it("crea sesión y retorna 201 con appointmentId válido", async () => {
    mockAppointmentFindUnique.mockResolvedValue({ id: APPT_ID, userId: MEMBER_ID });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        sessionTreatment: { create: mockSessionCreate },
        appointment: { update: mockAppointmentUpdate },
      };
      mockSessionCreate.mockResolvedValue(baseSession);
      return fn(tx);
    });

    const app  = await buildApp("staff");
    const res  = await request(app).post("/sessions").send(validBody);

    expect(res.status).toBe(201);
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "session.create" })
    );
  });

  it("retorna 404 si la cita no existe", async () => {
    mockAppointmentFindUnique.mockResolvedValue(null);

    const app = await buildApp("staff");
    const res = await request(app).post("/sessions").send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/cita/i);
  });

  it("retorna 400 si la cita no pertenece al userId del payload", async () => {
    mockAppointmentFindUnique.mockResolvedValue({ id: APPT_ID, userId: "otro-usuario" });

    const app = await buildApp("staff");
    const res = await request(app).post("/sessions").send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/usuario/i);
  });

  it("crea sesión sin appointmentId (sesión manual)", async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { sessionTreatment: { create: mockSessionCreate } };
      mockSessionCreate.mockResolvedValue({ ...baseSession, appointmentId: null });
      return fn(tx);
    });

    const app = await buildApp("staff");
    const res = await request(app)
      .post("/sessions")
      .send({ userId: MEMBER_ID, notes: "Sin cita" });

    expect(res.status).toBe(201);
    expect(mockAppointmentFindUnique).not.toHaveBeenCalled();
  });

  it("retorna 400 si el body es inválido (falta userId)", async () => {
    const app = await buildApp("staff");
    const res = await request(app).post("/sessions").send({ notes: "Sin userId" });

    expect(res.status).toBe(400);
  });
});

// ── listMySessions ────────────────────────────────────────────────────────────
describe("listMySessions", () => {
  it("member solo ve sus propias sesiones", async () => {
    mockSessionFindMany.mockResolvedValue([baseSession]);
    mockSessionCount.mockResolvedValue(1);

    const app = await buildApp("member", MEMBER_ID);
    const res = await request(app).get("/sessions/me");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    // where debe filtrar por userId del member
    const whereArg = mockSessionFindMany.mock.calls[0][0].where;
    expect(whereArg?.userId).toBe(MEMBER_ID);
  });

  it("staff puede filtrar por userId via query param", async () => {
    mockSessionFindMany.mockResolvedValue([baseSession]);
    mockSessionCount.mockResolvedValue(1);

    const app = await buildApp("staff", STAFF_ID);
    const res = await request(app).get(`/sessions/me?userId=${MEMBER_ID}`);

    expect(res.status).toBe(200);
    const whereArg = mockSessionFindMany.mock.calls[0][0].where;
    expect(whereArg?.userId).toBe(MEMBER_ID);
  });

  it("retorna paginación correcta", async () => {
    mockSessionFindMany.mockResolvedValue([baseSession]);
    mockSessionCount.mockResolvedValue(3);

    const app = await buildApp("staff");
    const res = await request(app).get("/sessions/me?page=1&limit=1");

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.pages).toBe(3);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
  });
});

// ── adminListSessions ─────────────────────────────────────────────────────────
describe("adminListSessions", () => {
  it("retorna lista paginada sin filtros", async () => {
    mockSessionFindMany.mockResolvedValue([baseSession]);
    mockSessionCount.mockResolvedValue(1);

    const app = await buildApp("admin");
    const res = await request(app).get("/sessions/admin");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it("filtra por appointmentId si se provee", async () => {
    mockSessionFindMany.mockResolvedValue([baseSession]);
    mockSessionCount.mockResolvedValue(1);

    const app = await buildApp("admin");
    await request(app).get(`/sessions/admin?appointmentId=${APPT_ID}`);

    const whereArg = mockSessionFindMany.mock.calls[0][0].where;
    expect(whereArg.appointmentId).toBe(APPT_ID);
  });

  it("filtra por userId si se provee", async () => {
    mockSessionFindMany.mockResolvedValue([baseSession]);
    mockSessionCount.mockResolvedValue(1);

    const app = await buildApp("admin");
    await request(app).get(`/sessions/admin?userId=${MEMBER_ID}`);

    const whereArg = mockSessionFindMany.mock.calls[0][0].where;
    expect(whereArg.userId).toBe(MEMBER_ID);
  });
});

// ── addSessionFeedback ────────────────────────────────────────────────────────
describe("addSessionFeedback", () => {
  const feedbackBody = { memberFeedback: "Excelente sesión, sin molestias." };

  it("member dueño puede agregar feedback a su sesión", async () => {
    mockSessionFindUnique.mockResolvedValue({ ...baseSession, userId: MEMBER_ID });
    mockSessionUpdate.mockResolvedValue({ ...baseSession, memberFeedback: feedbackBody.memberFeedback });

    const app = await buildApp("member", MEMBER_ID);
    const res = await request(app)
      .patch(`/sessions/${SESSION_ID}/feedback`)
      .send(feedbackBody);

    expect(res.status).toBe(200);
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "session.feedback" })
    );
  });

  it("staff puede agregar feedback a cualquier sesión", async () => {
    mockSessionFindUnique.mockResolvedValue({ ...baseSession, userId: MEMBER_ID });
    mockSessionUpdate.mockResolvedValue({ ...baseSession, memberFeedback: feedbackBody.memberFeedback });

    const app = await buildApp("staff", STAFF_ID);
    const res = await request(app)
      .patch(`/sessions/${SESSION_ID}/feedback`)
      .send(feedbackBody);

    expect(res.status).toBe(200);
  });

  it("member ajeno retorna 403", async () => {
    mockSessionFindUnique.mockResolvedValue({ ...baseSession, userId: "otro-member" });

    const app = await buildApp("member", MEMBER_ID);
    const res = await request(app)
      .patch(`/sessions/${SESSION_ID}/feedback`)
      .send(feedbackBody);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/editar/i);
  });

  it("retorna 404 si la sesión no existe", async () => {
    mockSessionFindUnique.mockResolvedValue(null);

    const app = await buildApp("staff");
    const res = await request(app)
      .patch(`/sessions/${SESSION_ID}/feedback`)
      .send(feedbackBody);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/sesión/i);
  });

  it("retorna 400 si el feedback está vacío", async () => {
    const app = await buildApp("staff");
    const res = await request(app)
      .patch(`/sessions/${SESSION_ID}/feedback`)
      .send({ memberFeedback: "" });

    expect(res.status).toBe(400);
  });
});
