/**
 * Appointments: gate de expediente médico en createAppointment
 * Cubre: member sin expediente aprobado → 403, admin bypasea el gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";

const {
  mockMedicalIntakeFindUnique,
  mockAppointmentFindMany,
  mockAppointmentCount,
} = vi.hoisted(() => ({
  mockMedicalIntakeFindUnique: vi.fn(),
  mockAppointmentFindMany: vi.fn().mockResolvedValue([]),
  mockAppointmentCount: vi.fn().mockResolvedValue(0),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    medicalIntake: { findUnique: mockMedicalIntakeFindUnique },
    membership: { findUnique: vi.fn().mockResolvedValue(null) },
    appointment: {
      findMany: mockAppointmentFindMany,
      count: mockAppointmentCount,
      create: vi.fn(),
    },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    agendaBlockedSlot: { findMany: vi.fn().mockResolvedValue([]) },
    agendaPolicy: {
      findFirst: vi.fn().mockResolvedValue({
        id: "p1", timezone: "America/Chihuahua", slotMinutes: 30,
        autoConfirmHours: 12, noShowGraceMinutes: 30,
        maxActiveAppointmentsPerWeek: 4, maxActiveAppointmentsPerMonth: 12,
        minAdvanceMinutes: 120, maxAdvanceDays: 60,
      }),
      findFirstOrThrow: vi.fn().mockResolvedValue({
        id: "p1", timezone: "America/Chihuahua", slotMinutes: 30,
        autoConfirmHours: 12, noShowGraceMinutes: 30,
        maxActiveAppointmentsPerWeek: 4, maxActiveAppointmentsPerMonth: 12,
        minAdvanceMinutes: 120, maxAdvanceDays: 60,
      }),
    },
    agendaCabin: {
      findMany: vi.fn().mockResolvedValue([{ id: "cabin1", name: "Cabina 1", isActive: true, sortOrder: 1 }]),
      count: vi.fn().mockResolvedValue(1),
    },
    agendaWeeklyRule: {
      findMany: vi.fn().mockResolvedValue([
        { id: "mon", dayOfWeek: 1, isOpen: true, startHour: 9, endHour: 20, agendaPolicyId: "p1" },
        { id: "tue", dayOfWeek: 2, isOpen: true, startHour: 9, endHour: 20, agendaPolicyId: "p1" },
        { id: "wed", dayOfWeek: 3, isOpen: true, startHour: 9, endHour: 20, agendaPolicyId: "p1" },
        { id: "thu", dayOfWeek: 4, isOpen: true, startHour: 9, endHour: 20, agendaPolicyId: "p1" },
        { id: "fri", dayOfWeek: 5, isOpen: true, startHour: 9, endHour: 20, agendaPolicyId: "p1" },
        { id: "sat", dayOfWeek: 6, isOpen: true, startHour: 9, endHour: 20, agendaPolicyId: "p1" },
        { id: "sun", dayOfWeek: 0, isOpen: false, startHour: null, endHour: null, agendaPolicyId: "p1" },
      ]),
    },
    agendaSpecialDateRule: { findMany: vi.fn().mockResolvedValue([]) },
    agendaTreatment: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(1) },
  },
}));

vi.mock("../src/services/auditService", () => ({ createAuditLog: vi.fn() }));
vi.mock("../src/services/notificationService", () => ({
  onAppointmentBooked: vi.fn().mockResolvedValue(undefined),
  onAppointmentConfirmed: vi.fn().mockResolvedValue(undefined),
  onAppointmentCancelledByClinic: vi.fn().mockResolvedValue(undefined),
  onAppointmentCancelledByPatient: vi.fn().mockResolvedValue(undefined),
  invalidateAdminIdCache: vi.fn(),
}));
vi.mock("../src/services/googleCalendarIntegrationService", () => ({
  enqueueGoogleAppointmentSync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/utils/clinic", () => ({
  getClinicIdByUserId: vi.fn().mockResolvedValue("clinic1"),
}));

// Fecha futura válida (N días adelante, hora H UTC+7)
const futureDateISO = (daysAhead: number, hour = 10): string => {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  d.setUTCHours(hour + 7, 0, 0, 0);
  return d.toISOString();
};

const buildApp = async (role = "member", userId = "user-1") => {
  const { createAppointment } = await import("../src/controllers/v1AppointmentController");
  const app = express();
  app.use(express.json());
  app.post("/appointments", (req, res, next) => {
    (req as any).user = { id: userId, role };
    next();
  }, createAppointment);
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAppointmentFindMany.mockResolvedValue([]);
  mockAppointmentCount.mockResolvedValue(0);
});

describe("POST /appointments — gate expediente médico (rol member)", () => {
  it("devuelve 403 ONBOARDING_INCOMPLETE si no hay expediente", async () => {
    mockMedicalIntakeFindUnique.mockResolvedValue(null);
    const app = await buildApp("member");
    const res = await request(app).post("/appointments").send({
      startAt: futureDateISO(5), endAt: futureDateISO(5, 11),
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ONBOARDING_INCOMPLETE");
  });

  it("devuelve 403 si el expediente está en estado submitted (no aprobado aún)", async () => {
    mockMedicalIntakeFindUnique.mockResolvedValue({ status: "submitted" });
    const app = await buildApp("member");
    const res = await request(app).post("/appointments").send({
      startAt: futureDateISO(5), endAt: futureDateISO(5, 11),
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ONBOARDING_INCOMPLETE");
  });

  it("devuelve 403 si el expediente está en draft", async () => {
    mockMedicalIntakeFindUnique.mockResolvedValue({ status: "draft" });
    const app = await buildApp("member");
    const res = await request(app).post("/appointments").send({
      startAt: futureDateISO(5), endAt: futureDateISO(5, 11),
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ONBOARDING_INCOMPLETE");
  });
});

describe("POST /appointments — admin bypasea gate de expediente", () => {
  it("no devuelve 403 ONBOARDING_INCOMPLETE para rol admin", async () => {
    mockMedicalIntakeFindUnique.mockResolvedValue(null);
    const app = await buildApp("admin", "admin-1");
    const res = await request(app).post("/appointments").send({
      startAt: futureDateISO(5), endAt: futureDateISO(5, 11),
    });
    expect(res.status).not.toBe(403);
    if (res.body?.code) {
      expect(res.body.code).not.toBe("ONBOARDING_INCOMPLETE");
    }
  });
});
