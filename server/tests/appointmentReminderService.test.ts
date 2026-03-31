/**
 * Tests para services/appointmentReminderService.ts
 * Cubre: runAppointmentReminders — lock, query, envío de email/WhatsApp, marcado reminderSentAt
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET           = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL         = "postgresql://x:x@localhost/x";
process.env.INTEGRATIONS_ENC_KEY = "test-enc-key-32-bytes-minimum!!";

const {
  mockAppSettingFindUnique,
  mockAppSettingUpsert,
  mockAppSettingDelete,
  mockAppointmentFindMany,
  mockAppointmentUpdate,
  mockSendAppointmentReminderEmail,
  mockSendWhatsappAppointmentReminder,
  mockRecordWorkerRun,
} = vi.hoisted(() => ({
  mockAppSettingFindUnique:           vi.fn(),
  mockAppSettingUpsert:               vi.fn(),
  mockAppSettingDelete:               vi.fn().mockResolvedValue({}),
  mockAppointmentFindMany:            vi.fn(),
  mockAppointmentUpdate:              vi.fn().mockResolvedValue({}),
  mockSendAppointmentReminderEmail:   vi.fn().mockResolvedValue({}),
  mockSendWhatsappAppointmentReminder: vi.fn().mockResolvedValue({}),
  mockRecordWorkerRun:                vi.fn().mockResolvedValue({}),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: mockAppSettingFindUnique,
      upsert:     mockAppSettingUpsert,
      delete:     mockAppSettingDelete,
    },
    appointment: {
      findMany: mockAppointmentFindMany,
      update:   mockAppointmentUpdate,
    },
  },
}));

vi.mock("../src/services/emailService", () => ({
  sendAppointmentReminderEmail: mockSendAppointmentReminderEmail,
}));

vi.mock("../src/services/whatsappMetaService", () => ({
  sendWhatsappAppointmentReminder: mockSendWhatsappAppointmentReminder,
}));

vi.mock("../src/utils/workerRegistry", () => ({
  recordWorkerRun: mockRecordWorkerRun,
}));

// node-cron no debe ejecutarse en tests
vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
}));

import { runAppointmentReminders } from "../src/services/appointmentReminderService";

const futureDate = new Date(Date.now() + 30 * 60 * 1000); // lock no expirado

const baseAppointment = {
  id: "appt-001",
  startAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h desde ahora
  status: "scheduled",
  reminderSentAt: null,
  user: {
    email: "paciente@velum.test",
    profile: { firstName: "Ana", lastName: "García", phone: "+52 614 000 0000" },
  },
  treatment: { name: "Depilación Láser" },
  cabin: { name: "Cabina 1" },
};

beforeEach(() => vi.clearAllMocks());

// ── Lock ──────────────────────────────────────────────────────────────────────
describe("runAppointmentReminders — distributed lock", () => {
  it("no procesa citas si el lock está activo (otra instancia lo tiene)", async () => {
    mockAppSettingFindUnique.mockResolvedValue({
      key: "appointment_reminder_lock",
      value: { expiresAt: futureDate.toISOString() },
    });

    await runAppointmentReminders();

    expect(mockAppointmentFindMany).not.toHaveBeenCalled();
    expect(mockSendAppointmentReminderEmail).not.toHaveBeenCalled();
  });

  it("adquiere el lock y libera al final cuando no hay lock previo", async () => {
    mockAppSettingFindUnique.mockResolvedValue(null);
    mockAppSettingUpsert.mockResolvedValue({});
    mockAppointmentFindMany.mockResolvedValue([]);

    await runAppointmentReminders();

    expect(mockAppSettingUpsert).toHaveBeenCalledOnce();
    expect(mockAppSettingDelete).toHaveBeenCalledOnce();
    expect(mockRecordWorkerRun).toHaveBeenCalledWith("appointment-reminder");
  });

  it("adquiere el lock si el lock anterior ya expiró", async () => {
    mockAppSettingFindUnique.mockResolvedValue({
      key: "appointment_reminder_lock",
      value: { expiresAt: new Date(Date.now() - 1000).toISOString() }, // ya expiró
    });
    mockAppSettingUpsert.mockResolvedValue({});
    mockAppointmentFindMany.mockResolvedValue([]);

    await runAppointmentReminders();

    expect(mockAppSettingUpsert).toHaveBeenCalledOnce();
  });
});

// ── Happy path ────────────────────────────────────────────────────────────────
describe("runAppointmentReminders — envío de recordatorios", () => {
  beforeEach(() => {
    mockAppSettingFindUnique.mockResolvedValue(null);
    mockAppSettingUpsert.mockResolvedValue({});
  });

  it("envía email y WhatsApp para cada cita y marca reminderSentAt", async () => {
    mockAppointmentFindMany.mockResolvedValue([baseAppointment]);

    await runAppointmentReminders();

    expect(mockSendAppointmentReminderEmail).toHaveBeenCalledOnce();
    expect(mockSendWhatsappAppointmentReminder).toHaveBeenCalledOnce();
    expect(mockAppointmentUpdate).toHaveBeenCalledWith({
      where: { id: baseAppointment.id },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it("no envía WhatsApp si el paciente no tiene teléfono", async () => {
    const apptNoPhone = {
      ...baseAppointment,
      id: "appt-no-phone",
      user: { ...baseAppointment.user, profile: { firstName: "Ana", lastName: "García", phone: null } },
    };
    mockAppointmentFindMany.mockResolvedValue([apptNoPhone]);

    await runAppointmentReminders();

    expect(mockSendAppointmentReminderEmail).toHaveBeenCalledOnce();
    expect(mockSendWhatsappAppointmentReminder).not.toHaveBeenCalled();
  });

  it("no procesa citas cuando la lista está vacía", async () => {
    mockAppointmentFindMany.mockResolvedValue([]);

    await runAppointmentReminders();

    expect(mockSendAppointmentReminderEmail).not.toHaveBeenCalled();
    expect(mockAppointmentUpdate).not.toHaveBeenCalled();
  });

  it("usa email como nombre si no hay perfil", async () => {
    const apptNoProfile = {
      ...baseAppointment,
      id: "appt-no-profile",
      user: { email: "sin-perfil@velum.test", profile: null },
    };
    mockAppointmentFindMany.mockResolvedValue([apptNoProfile]);

    await runAppointmentReminders();

    const emailCall = mockSendAppointmentReminderEmail.mock.calls[0];
    expect(emailCall[0]).toBe("sin-perfil@velum.test");
    expect(emailCall[1].name).toBe("sin-perfil@velum.test");
  });

  it("continúa con la siguiente cita si una falla", async () => {
    const appt1 = { ...baseAppointment, id: "appt-fail" };
    const appt2 = { ...baseAppointment, id: "appt-ok" };

    mockAppointmentFindMany.mockResolvedValue([appt1, appt2]);
    mockSendAppointmentReminderEmail
      .mockRejectedValueOnce(new Error("email error"))
      .mockResolvedValueOnce({});

    await runAppointmentReminders();

    // La segunda cita sí fue marcada
    expect(mockAppointmentUpdate).toHaveBeenCalledTimes(1);
    expect(mockAppointmentUpdate.mock.calls[0][0].where.id).toBe("appt-ok");
  });

  it("libera el lock incluso si la query de citas falla", async () => {
    mockAppointmentFindMany.mockRejectedValue(new Error("DB error"));

    await runAppointmentReminders();

    expect(mockAppSettingDelete).toHaveBeenCalledOnce();
  });
});
