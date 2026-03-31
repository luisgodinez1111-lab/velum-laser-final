/**
 * Tests para services/paymentReminderService.ts
 * Cubre: runPaymentReminders — lock, query por días, email/WhatsApp/notificación, dedup
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.JWT_SECRET           = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL         = "postgresql://x:x@localhost/x";
process.env.INTEGRATIONS_ENC_KEY = "test-enc-key-32-bytes-minimum!!";

const {
  mockAppSettingFindUnique,
  mockAppSettingUpsert,
  mockAppSettingDelete,
  mockMembershipFindMany,
  mockMembershipUpdate,
  mockReadStripePlanCatalog,
  mockSendPaymentReminderEmail,
  mockSendWhatsappPaymentReminder,
  mockCreateNotification,
  mockRecordWorkerRun,
} = vi.hoisted(() => ({
  mockAppSettingFindUnique:     vi.fn(),
  mockAppSettingUpsert:         vi.fn(),
  mockAppSettingDelete:         vi.fn().mockResolvedValue({}),
  mockMembershipFindMany:       vi.fn(),
  mockMembershipUpdate:         vi.fn().mockResolvedValue({}),
  mockReadStripePlanCatalog:    vi.fn().mockResolvedValue([]),
  mockSendPaymentReminderEmail: vi.fn().mockResolvedValue({}),
  mockSendWhatsappPaymentReminder: vi.fn().mockResolvedValue({}),
  mockCreateNotification:       vi.fn().mockResolvedValue({}),
  mockRecordWorkerRun:          vi.fn().mockResolvedValue({}),
}));

vi.mock("../src/db/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: mockAppSettingFindUnique,
      upsert:     mockAppSettingUpsert,
      delete:     mockAppSettingDelete,
    },
    membership: {
      findMany: mockMembershipFindMany,
      update:   mockMembershipUpdate,
    },
  },
}));

vi.mock("../src/services/stripePlanCatalogService", () => ({
  readStripePlanCatalog: mockReadStripePlanCatalog,
}));

vi.mock("../src/services/emailService", () => ({
  sendPaymentReminderEmail: mockSendPaymentReminderEmail,
}));

vi.mock("../src/services/whatsappMetaService", () => ({
  sendWhatsappPaymentReminder: mockSendWhatsappPaymentReminder,
}));

vi.mock("../src/services/notificationService", () => ({
  createNotification: mockCreateNotification,
}));

vi.mock("../src/utils/workerRegistry", () => ({
  recordWorkerRun: mockRecordWorkerRun,
}));

vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
}));

import { runPaymentReminders } from "../src/services/paymentReminderService";

const futureExpiry = new Date(Date.now() + 30 * 60 * 1000);

const baseMembership = {
  id: "ms-001",
  planId: "premium",
  status: "active",
  currentPeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  lastReminderSentAt: null,
  user: {
    id: "user-001",
    email: "paciente@velum.test",
    profile: { firstName: "Ana", lastName: "García", phone: "+52 614 000 0000" },
  },
};

beforeEach(() => vi.clearAllMocks());

// ── Lock ──────────────────────────────────────────────────────────────────────
describe("runPaymentReminders — distributed lock", () => {
  it("no procesa membresías si el lock está activo", async () => {
    mockAppSettingFindUnique.mockResolvedValue({
      key: "payment_reminder_lock",
      value: { expiresAt: futureExpiry.toISOString() },
    });

    await runPaymentReminders();

    expect(mockMembershipFindMany).not.toHaveBeenCalled();
  });

  it("adquiere el lock y libera al final cuando no hay lock previo", async () => {
    mockAppSettingFindUnique.mockResolvedValue(null);
    mockAppSettingUpsert.mockResolvedValue({});
    mockMembershipFindMany.mockResolvedValue([]);

    await runPaymentReminders();

    expect(mockAppSettingUpsert).toHaveBeenCalledOnce();
    expect(mockAppSettingDelete).toHaveBeenCalledOnce();
    expect(mockRecordWorkerRun).toHaveBeenCalledWith("payment-reminder");
  });

  it("libera el lock incluso si la query de membresías falla", async () => {
    mockAppSettingFindUnique.mockResolvedValue(null);
    mockAppSettingUpsert.mockResolvedValue({});
    mockMembershipFindMany.mockRejectedValue(new Error("DB error"));

    await runPaymentReminders();

    expect(mockAppSettingDelete).toHaveBeenCalledOnce();
  });
});

// ── Envío de recordatorios ────────────────────────────────────────────────────
describe("runPaymentReminders — envío", () => {
  beforeEach(() => {
    mockAppSettingFindUnique.mockResolvedValue(null);
    mockAppSettingUpsert.mockResolvedValue({});
  });

  it("no procesa membresías cuando la lista está vacía", async () => {
    mockMembershipFindMany.mockResolvedValue([]);

    await runPaymentReminders();

    expect(mockSendPaymentReminderEmail).not.toHaveBeenCalled();
    expect(mockMembershipUpdate).not.toHaveBeenCalled();
  });

  it("envía email, WhatsApp y notificación in-app para cada membresía", async () => {
    // Solo la primera ventana (3 días) retorna la membresía; la segunda (1 día) vacía
    mockMembershipFindMany
      .mockResolvedValueOnce([baseMembership])
      .mockResolvedValueOnce([]);

    await runPaymentReminders();

    expect(mockSendPaymentReminderEmail).toHaveBeenCalledOnce();
    expect(mockSendWhatsappPaymentReminder).toHaveBeenCalledOnce();
    expect(mockCreateNotification).toHaveBeenCalledOnce();
  });

  it("reserva el slot antes de enviar para evitar duplicados", async () => {
    mockMembershipFindMany.mockResolvedValue([baseMembership]);

    await runPaymentReminders();

    // La actualización de lastReminderSentAt debe ocurrir ANTES del email
    const updateOrder = mockMembershipUpdate.mock.invocationCallOrder[0];
    const emailOrder  = mockSendPaymentReminderEmail.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(emailOrder);
  });

  it("usa nombre del catálogo si está disponible", async () => {
    mockReadStripePlanCatalog.mockResolvedValue([
      { planCode: "premium", name: "Premium Plus", amount: 150000, stripePriceId: "price_abc" },
    ]);
    mockMembershipFindMany.mockResolvedValue([baseMembership]);

    await runPaymentReminders();

    const emailCall = mockSendPaymentReminderEmail.mock.calls[0][1];
    expect(emailCall.planName).toBe("Premium Plus");
  });

  it("usa email como nombre si no hay perfil", async () => {
    const msNoProfile = { ...baseMembership, user: { id: "u2", email: "sin-perfil@velum.test", profile: null } };
    mockMembershipFindMany.mockResolvedValue([msNoProfile]);

    await runPaymentReminders();

    const emailCall = mockSendPaymentReminderEmail.mock.calls[0][1];
    expect(emailCall.name).toBe("sin-perfil@velum.test");
  });

  it("no envía WhatsApp si el usuario no tiene teléfono", async () => {
    const msNoPhone = {
      ...baseMembership,
      user: { ...baseMembership.user, profile: { firstName: "Ana", lastName: "G", phone: null } },
    };
    // Solo la primera ventana retorna membresía para que el email se llame exactamente una vez
    mockMembershipFindMany
      .mockResolvedValueOnce([msNoPhone])
      .mockResolvedValueOnce([]);

    await runPaymentReminders();

    expect(mockSendPaymentReminderEmail).toHaveBeenCalledOnce();
    expect(mockSendWhatsappPaymentReminder).not.toHaveBeenCalled();
  });

  it("continúa con la siguiente membresía si una falla", async () => {
    const ms1 = { ...baseMembership, id: "ms-fail" };
    const ms2 = { ...baseMembership, id: "ms-ok" };

    // Ambas iteraciones de REMINDER_DAYS=[3,1] usarán estas membresías
    // Para simplificar: primer findMany retorna ms1 (falla), segundo ms2 (ok)
    mockMembershipFindMany
      .mockResolvedValueOnce([ms1])
      .mockResolvedValueOnce([ms2]);

    mockSendPaymentReminderEmail
      .mockRejectedValueOnce(new Error("email error"))
      .mockResolvedValueOnce({});

    await runPaymentReminders();

    // El segundo email sí fue enviado
    expect(mockSendPaymentReminderEmail).toHaveBeenCalledTimes(2);
  });

  it("consulta por 2 ventanas de días (3 y 1 días antes)", async () => {
    mockMembershipFindMany.mockResolvedValue([]);

    await runPaymentReminders();

    // REMINDER_DAYS = [3, 1] → 2 queries
    expect(mockMembershipFindMany).toHaveBeenCalledTimes(2);
  });
});
