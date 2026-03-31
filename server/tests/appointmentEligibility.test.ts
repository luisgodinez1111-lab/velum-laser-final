/**
 * Tests para appointmentEligibilityService — funciones puras y con mock de DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL = "postgresql://x:x@localhost/x";

// ── Mock Prisma ──────────────────────────────────────────────────────────────
const {
  mockIntakeFindUnique,
  mockMembershipFindUnique,
  mockTreatmentFindUnique,
  mockTreatmentFindFirst,
} = vi.hoisted(() => ({
  mockIntakeFindUnique: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockTreatmentFindUnique: vi.fn(),
  mockTreatmentFindFirst: vi.fn(),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    medicalIntake: { findUnique: mockIntakeFindUnique },
    membership: { findUnique: mockMembershipFindUnique },
    agendaTreatment: {
      findUnique: mockTreatmentFindUnique,
      findFirst: mockTreatmentFindFirst,
    },
  },
}));

import {
  hasClinicalEligibility,
  resolveTreatmentForAppointment,
  preferredCabinIdsForTreatment,
  deriveAppointmentEndAt,
  type ResolvedAgendaTreatment,
} from "../src/services/appointmentEligibilityService";
import { AgendaValidationError } from "../src/services/agendaService";

beforeEach(() => vi.clearAllMocks());

// ── hasClinicalEligibility ───────────────────────────────────────────────────

describe("hasClinicalEligibility", () => {
  it("intakeOk=true cuando expediente está en estado 'approved'", async () => {
    mockIntakeFindUnique.mockResolvedValue({ status: "approved" });
    mockMembershipFindUnique.mockResolvedValue({ status: "active" });
    const { intakeOk } = await hasClinicalEligibility("user-1");
    expect(intakeOk).toBe(true);
  });

  it("intakeOk=true cuando expediente está en estado 'submitted'", async () => {
    mockIntakeFindUnique.mockResolvedValue({ status: "submitted" });
    mockMembershipFindUnique.mockResolvedValue({ status: "inactive" });
    const { intakeOk } = await hasClinicalEligibility("user-2");
    expect(intakeOk).toBe(true);
  });

  it("intakeOk=false cuando expediente está en estado 'pending'", async () => {
    mockIntakeFindUnique.mockResolvedValue({ status: "pending" });
    mockMembershipFindUnique.mockResolvedValue({ status: "active" });
    const { intakeOk } = await hasClinicalEligibility("user-3");
    expect(intakeOk).toBe(false);
  });

  it("intakeOk=false cuando no existe expediente", async () => {
    mockIntakeFindUnique.mockResolvedValue(null);
    mockMembershipFindUnique.mockResolvedValue({ status: "active" });
    const { intakeOk } = await hasClinicalEligibility("user-4");
    expect(intakeOk).toBe(false);
  });

  it("membershipOk=true cuando membresía está activa", async () => {
    mockIntakeFindUnique.mockResolvedValue({ status: "approved" });
    mockMembershipFindUnique.mockResolvedValue({ status: "active" });
    const { membershipOk } = await hasClinicalEligibility("user-5");
    expect(membershipOk).toBe(true);
  });

  it("membershipOk=false cuando membresía está cancelada", async () => {
    mockIntakeFindUnique.mockResolvedValue({ status: "approved" });
    mockMembershipFindUnique.mockResolvedValue({ status: "cancelled" });
    const { membershipOk } = await hasClinicalEligibility("user-6");
    expect(membershipOk).toBe(false);
  });

  it("membershipOk=false cuando no existe membresía", async () => {
    mockIntakeFindUnique.mockResolvedValue({ status: "approved" });
    mockMembershipFindUnique.mockResolvedValue(null);
    const { membershipOk } = await hasClinicalEligibility("user-7");
    expect(membershipOk).toBe(false);
  });

  it("consulta intake y membership en paralelo (Promise.all)", async () => {
    let intakeCalled = false;
    let membershipCalled = false;
    mockIntakeFindUnique.mockImplementation(async () => {
      intakeCalled = true;
      return { status: "approved" };
    });
    mockMembershipFindUnique.mockImplementation(async () => {
      membershipCalled = true;
      return { status: "active" };
    });
    await hasClinicalEligibility("user-8");
    expect(intakeCalled).toBe(true);
    expect(membershipCalled).toBe(true);
  });
});

// ── resolveTreatmentForAppointment ───────────────────────────────────────────

const makeTreatment = (overrides: Partial<ResolvedAgendaTreatment> = {}): ResolvedAgendaTreatment => ({
  id: "t-1",
  code: "laser-facial",
  durationMinutes: 60,
  prepBufferMinutes: 10,
  cleanupBufferMinutes: 5,
  cabinId: "c-1",
  requiresSpecificCabin: false,
  isActive: true,
  cabinRules: [],
  ...overrides,
});

describe("resolveTreatmentForAppointment", () => {
  describe("búsqueda por treatmentId", () => {
    it("retorna el tratamiento cuando existe y está activo", async () => {
      mockTreatmentFindUnique.mockResolvedValue(makeTreatment());
      const result = await resolveTreatmentForAppointment({ treatmentId: "t-1" });
      expect(result?.id).toBe("t-1");
    });

    it("lanza AgendaValidationError 404 cuando el tratamiento no existe", async () => {
      mockTreatmentFindUnique.mockResolvedValue(null);
      await expect(
        resolveTreatmentForAppointment({ treatmentId: "inexistente" })
      ).rejects.toBeInstanceOf(AgendaValidationError);
    });

    it("lanza AgendaValidationError 404 cuando el tratamiento está inactivo", async () => {
      mockTreatmentFindUnique.mockResolvedValue(makeTreatment({ isActive: false }));
      await expect(
        resolveTreatmentForAppointment({ treatmentId: "t-inactivo" })
      ).rejects.toBeInstanceOf(AgendaValidationError);
    });

    it("el error lanzado tiene statusCode 404", async () => {
      mockTreatmentFindUnique.mockResolvedValue(null);
      try {
        await resolveTreatmentForAppointment({ treatmentId: "x" });
      } catch (e) {
        expect((e as AgendaValidationError).statusCode).toBe(404);
      }
    });
  });

  describe("búsqueda por reason (código)", () => {
    it("retorna el tratamiento cuando el código coincide", async () => {
      mockTreatmentFindFirst.mockResolvedValue(makeTreatment({ code: "laser-facial" }));
      const result = await resolveTreatmentForAppointment({ reason: "laser-facial" });
      expect(result?.code).toBe("laser-facial");
    });

    it("retorna null cuando no hay treatmentId ni reason", async () => {
      const result = await resolveTreatmentForAppointment({});
      expect(result).toBeNull();
    });

    it("retorna null cuando reason está vacío", async () => {
      const result = await resolveTreatmentForAppointment({ reason: "   " });
      expect(result).toBeNull();
    });

    it("retorna null cuando findFirst no encuentra el código", async () => {
      mockTreatmentFindFirst.mockResolvedValue(null);
      const result = await resolveTreatmentForAppointment({ reason: "inexistente" });
      expect(result).toBeNull();
    });
  });
});

// ── preferredCabinIdsForTreatment ────────────────────────────────────────────

describe("preferredCabinIdsForTreatment", () => {
  it("retorna [] cuando treatment es null", () => {
    expect(preferredCabinIdsForTreatment(null)).toEqual([]);
  });

  it("retorna [] cuando no hay cabinRules ni cabinId", () => {
    const t = makeTreatment({ cabinId: null, cabinRules: [] });
    expect(preferredCabinIdsForTreatment(t)).toEqual([]);
  });

  it("ordena cabinas por prioridad ascendente", () => {
    const t = makeTreatment({
      cabinId: null,
      cabinRules: [
        { cabinId: "c-3", priority: 3 },
        { cabinId: "c-1", priority: 1 },
        { cabinId: "c-2", priority: 2 },
      ],
    });
    expect(preferredCabinIdsForTreatment(t)).toEqual(["c-1", "c-2", "c-3"]);
  });

  it("antepone cabinId si no está en cabinRules", () => {
    const t = makeTreatment({
      cabinId: "c-especial",
      cabinRules: [{ cabinId: "c-1", priority: 1 }],
    });
    const result = preferredCabinIdsForTreatment(t);
    expect(result[0]).toBe("c-especial");
    expect(result).toContain("c-1");
  });

  it("no duplica cabinId si ya está en cabinRules", () => {
    const t = makeTreatment({
      cabinId: "c-1",
      cabinRules: [{ cabinId: "c-1", priority: 1 }],
    });
    const result = preferredCabinIdsForTreatment(t);
    expect(result.filter((id) => id === "c-1")).toHaveLength(1);
  });

  it("elimina duplicados en cabinRules", () => {
    const t = makeTreatment({
      cabinId: null,
      cabinRules: [
        { cabinId: "c-1", priority: 1 },
        { cabinId: "c-1", priority: 2 },
      ],
    });
    const result = preferredCabinIdsForTreatment(t);
    expect(result).toEqual(["c-1"]);
  });
});

// ── deriveAppointmentEndAt ───────────────────────────────────────────────────

describe("deriveAppointmentEndAt", () => {
  const startAt = new Date("2025-06-16T10:00:00.000Z");

  it("usa durationMinutes del tratamiento si hay treatment", () => {
    const t = makeTreatment({ durationMinutes: 60 });
    const endAt = deriveAppointmentEndAt({ startAt, treatment: t });
    expect(endAt?.getTime()).toBe(startAt.getTime() + 60 * 60 * 1000);
  });

  it("durationMinutes de 30 minutos da el endAt correcto", () => {
    const t = makeTreatment({ durationMinutes: 30 });
    const endAt = deriveAppointmentEndAt({ startAt, treatment: t });
    expect(endAt?.getTime()).toBe(startAt.getTime() + 30 * 60 * 1000);
  });

  it("usa payloadEndAt cuando no hay treatment", () => {
    const payloadEndAt = "2025-06-16T11:30:00.000Z";
    const endAt = deriveAppointmentEndAt({ startAt, payloadEndAt, treatment: null });
    expect(endAt?.toISOString()).toBe(payloadEndAt);
  });

  it("retorna null cuando no hay treatment ni payloadEndAt", () => {
    const endAt = deriveAppointmentEndAt({ startAt, treatment: null });
    expect(endAt).toBeNull();
  });

  it("treatment tiene prioridad sobre payloadEndAt", () => {
    const t = makeTreatment({ durationMinutes: 45 });
    const payloadEndAt = "2025-06-16T12:00:00.000Z"; // diferente duración
    const endAt = deriveAppointmentEndAt({ startAt, payloadEndAt, treatment: t });
    // Debe usar treatment.durationMinutes=45, no payloadEndAt
    expect(endAt?.getTime()).toBe(startAt.getTime() + 45 * 60 * 1000);
  });
});
