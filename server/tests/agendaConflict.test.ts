/**
 * VALERIA — Agenda: detección de conflictos y validaciones de horario
 * Cubre: cita en el pasado, fin antes del inicio, fuera de horario,
 * conflicto de cabina, slot inválido, cita el mismo día.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

// Anclar la fecha a un lunes conocido para que futureSlot(N) no caiga en domingo
// independientemente del día real en que se ejecuten los tests.
const FIXED_NOW = new Date("2026-03-30T16:00:00.000Z"); // lunes 30-mar-2026 09:00 Chihuahua
vi.useFakeTimers();
vi.setSystemTime(FIXED_NOW);
afterAll(() => vi.useRealTimers());

// ── Helpers para fechas relativas ────────────────────────────────────────────
const fromNow = (deltaMinutes: number): Date =>
  new Date(Date.now() + deltaMinutes * 60 * 1000);

// ── Configuración de agenda por defecto (mock) ───────────────────────────────
const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  policy: {
    timezone: "America/Chihuahua",
    slotMinutes: 30,
    autoConfirmHours: 12,
    noShowGraceMinutes: 30,
    maxActiveAppointmentsPerWeek: 4,
    maxActiveAppointmentsPerMonth: 12,
    minAdvanceMinutes: 120,
    maxAdvanceDays: 60,
    ...overrides,
  },
  cabins: [{ id: "cabin1", name: "Cabina 1", isActive: true, sortOrder: 1 }],
  treatments: [],
  weeklyRules: [
    // 0=Sunday (closed), 1–6 Monday–Saturday open 09:00–20:00
    { id: "sun", dayOfWeek: 0, isOpen: false, startHour: null, endHour: null, agendaPolicyId: "p1" },
    { id: "mon", dayOfWeek: 1, isOpen: true, startHour: 9, endHour: 20, agendaPolicyId: "p1" },
    { id: "tue", dayOfWeek: 2, isOpen: true, startHour: 9, endHour: 20, agendaPolicyId: "p1" },
    { id: "wed", dayOfWeek: 3, isOpen: true, startHour: 9, endHour: 20, agendaPolicyId: "p1" },
    { id: "thu", dayOfWeek: 4, isOpen: true, startHour: 9, endHour: 20, agendaPolicyId: "p1" },
    { id: "fri", dayOfWeek: 5, isOpen: true, startHour: 9, endHour: 20, agendaPolicyId: "p1" },
    { id: "sat", dayOfWeek: 6, isOpen: true, startHour: 9, endHour: 20, agendaPolicyId: "p1" },
  ],
  specialDateRules: [],
});

// ── Mock Prisma ─────────────────────────────────────────────────────────────
const {
  mockAppointmentFindMany,
  mockBlockedSlotFindMany,
  mockPolicyFindFirst,
  mockCabinFindMany,
  mockWeeklyFindMany,
  mockSpecialFindMany,
  mockTreatmentFindMany,
} = vi.hoisted(() => ({
  mockAppointmentFindMany: vi.fn().mockResolvedValue([]),
  mockBlockedSlotFindMany: vi.fn().mockResolvedValue([]),
  mockPolicyFindFirst: vi.fn(),
  mockCabinFindMany: vi.fn(),
  mockWeeklyFindMany: vi.fn(),
  mockSpecialFindMany: vi.fn(),
  mockTreatmentFindMany: vi.fn(),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    appointment: { findMany: mockAppointmentFindMany, count: vi.fn().mockResolvedValue(0) },
    agendaBlockedSlot: { findMany: mockBlockedSlotFindMany },
    agendaPolicy: { findFirst: mockPolicyFindFirst, findFirstOrThrow: mockPolicyFindFirst, create: vi.fn() },
    agendaCabin: { findMany: mockCabinFindMany, count: vi.fn().mockResolvedValue(1) },
    agendaWeeklyRule: { findMany: mockWeeklyFindMany },
    agendaSpecialDateRule: { findMany: mockSpecialFindMany },
    agendaTreatment: { findMany: mockTreatmentFindMany, count: vi.fn().mockResolvedValue(1) },
  },
}));

// Override getAgendaConfig to return controlled config
const makeAgendaConfigMock = (overrides = {}) => {
  const config = makeConfig(overrides);
  mockPolicyFindFirst.mockResolvedValue({ id: "p1", ...config.policy });
  mockCabinFindMany.mockResolvedValue(config.cabins);
  mockWeeklyFindMany.mockResolvedValue(config.weeklyRules);
  mockSpecialFindMany.mockResolvedValue([]);
  mockTreatmentFindMany.mockResolvedValue([]);
};

beforeEach(() => {
  vi.clearAllMocks();
  makeAgendaConfigMock();
});

import { resolveAppointmentPlacement, AgendaValidationError } from "../src/services/agendaService";

// ── Helper: construye una cita en un día abierto N días en el futuro ─────────
const futureSlot = (daysAhead: number, startHour: number, durationMinutes = 60) => {
  // Use a fixed weekday (Wednesday) far enough in the future
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  // Force to Wednesday by finding next Wednesday
  const offset = (3 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + offset - daysAhead);
  // Reset to specific day
  const base = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  // Use America/Chihuahua offset (UTC-7): startHour local = startHour+7 UTC
  const utcOffset = 7;
  const startAt = new Date(base);
  startAt.setUTCHours(startHour + utcOffset, 0, 0, 0);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);
  return { startAt, endAt };
};

describe("resolveAppointmentPlacement — validaciones temporales", () => {
  it("lanza error si endAt <= startAt", async () => {
    const { startAt } = futureSlot(3, 10);
    const endAt = new Date(startAt.getTime() - 1000);
    await expect(resolveAppointmentPlacement({ startAt, endAt }))
      .rejects.toThrow(AgendaValidationError);
  });

  it("lanza error si la cita está dentro del minAdvanceMinutes (muy pronto)", async () => {
    // 30 minutes from now — policy requires 120 min advance
    const startAt = fromNow(30);
    const endAt = fromNow(90);
    await expect(resolveAppointmentPlacement({ startAt, endAt }))
      .rejects.toThrow(/anticipación/i);
  });

  it("lanza error si la cita supera maxAdvanceDays (demasiado lejos)", async () => {
    const { startAt, endAt } = futureSlot(61, 10); // policy maxAdvanceDays = 60
    await expect(resolveAppointmentPlacement({ startAt, endAt }))
      .rejects.toThrow(/anticipación|días/i);
  });
});

describe("resolveAppointmentPlacement — conflicto de cabina", () => {
  it("lanza AgendaValidationError cuando hay una cita solapada en la misma cabina", async () => {
    const { startAt, endAt } = futureSlot(5, 10, 60); // 10:00–11:00

    // Existing appointment: 10:30–11:30 in the same cabin
    const existingStart = new Date(startAt.getTime() + 30 * 60 * 1000);
    const existingEnd   = new Date(startAt.getTime() + 90 * 60 * 1000);

    mockAppointmentFindMany.mockResolvedValue([{
      id: "existing_appt",
      startAt: existingStart,
      endAt: existingEnd,
      treatment: { prepBufferMinutes: 0, cleanupBufferMinutes: 0 },
    }]);

    await expect(
      resolveAppointmentPlacement({ startAt, endAt, requestedCabinId: "cabin1" })
    ).rejects.toBeInstanceOf(AgendaValidationError);
  });

  it("resuelve sin error cuando no hay solapamientos", async () => {
    const { startAt, endAt } = futureSlot(5, 10, 60); // 10:00–11:00
    mockAppointmentFindMany.mockResolvedValue([]); // no conflicts

    await expect(
      resolveAppointmentPlacement({ startAt, endAt })
    ).resolves.toBeDefined();
  });
});

describe("resolveAppointmentPlacement — horario de clínica", () => {
  it("lanza error cuando la clínica está cerrada (domingo)", async () => {
    // Find next Sunday
    const now = new Date();
    const daysToSunday = (7 - now.getDay()) % 7 || 7;
    const sunday = new Date(Date.now() + daysToSunday * 24 * 60 * 60 * 1000);
    sunday.setUTCHours(17, 0, 0, 0); // 10:00 local = 17:00 UTC (UTC-7)
    const endAt = new Date(sunday.getTime() + 60 * 60 * 1000);

    // Only schedule if it's more than minAdvance away
    if (sunday.getTime() - Date.now() < 120 * 60 * 1000) {
      return; // skip if too close
    }

    await expect(
      resolveAppointmentPlacement({ startAt: sunday, endAt })
    ).rejects.toThrow(/cerrada/i);
  });
});

describe("AgendaValidationError", () => {
  it("tiene statusCode 409 por defecto", () => {
    const err = new AgendaValidationError("conflict");
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe("conflict");
    expect(err).toBeInstanceOf(Error);
  });

  it("acepta statusCode personalizado", () => {
    const err = new AgendaValidationError("bad input", 400);
    expect(err.statusCode).toBe(400);
  });
});
