/**
 * Tests para services/emailService.ts
 * Verifica: función correcta → cliente Resend correcto → subject correcto.
 * No prueba el contenido HTML completo (implementación), sí el contrato externo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Env vars antes de cualquier import ──────────────────────────────────────
process.env.JWT_SECRET             = "test-secret-32-bytes-minimum-len";
process.env.DATABASE_URL           = "postgresql://x:x@localhost/x";
process.env.INTEGRATIONS_ENC_KEY   = "test-enc-key-32-bytes-minimum!!";
process.env.RESEND_KEY_VERIFICATION = "re-test-verification";
process.env.RESEND_KEY_RESET        = "re-test-reset";
process.env.RESEND_KEY_REMINDERS    = "re-test-reminders";
process.env.RESEND_KEY_DOCUMENTS    = "re-test-documents";
process.env.RESEND_KEY_ADMIN_INVITE = "re-test-admin-invite";
process.env.RESEND_FROM_EMAIL       = "test@velum.test";

// ── Mocks hoisted ────────────────────────────────────────────────────────────
const {
  mockSendVerification,
  mockSendReset,
  mockSendReminders,
  mockSendDocuments,
  mockSendAdminInvite,
  MockResend,
} = vi.hoisted(() => {
  const mockSendVerification = vi.fn().mockResolvedValue({ id: "email-1" });
  const mockSendReset        = vi.fn().mockResolvedValue({ id: "email-2" });
  const mockSendReminders    = vi.fn().mockResolvedValue({ id: "email-3" });
  const mockSendDocuments    = vi.fn().mockResolvedValue({ id: "email-4" });
  const mockSendAdminInvite  = vi.fn().mockResolvedValue({ id: "email-5" });

  // Los clientes se instancian en orden:
  // 1→ resendVerification, 2→ resendReset, 3→ resendReminders,
  // 4→ resendDocuments, 5→ resendAdminInvite
  const sendFns = [
    mockSendVerification,
    mockSendReset,
    mockSendReminders,
    mockSendDocuments,
    mockSendAdminInvite,
  ];
  let idx = 0;

  const MockResend = vi.fn().mockImplementation(() => ({
    emails: { send: sendFns[idx++] ?? vi.fn().mockResolvedValue({ id: "extra" }) },
  }));

  return {
    mockSendVerification,
    mockSendReset,
    mockSendReminders,
    mockSendDocuments,
    mockSendAdminInvite,
    MockResend,
  };
});

// Mock del módulo resend
vi.mock("resend", () => ({ Resend: MockResend }));

// Circuit breaker y retry → pass-through para no complicar los tests
vi.mock("../src/utils/circuitBreaker", () => ({
  emailCircuit: { execute: (fn: () => unknown) => fn() },
}));
vi.mock("../src/utils/retry", () => ({
  withRetry: (fn: () => unknown) => fn(),
}));

vi.mock("../src/utils/requestContext", () => ({
  getRequestId: () => null,
}));

import {
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendPaymentReminderEmail,
  sendAppointmentReminderEmail,
  sendAppointmentBookingEmail,
  sendAppointmentCancellationEmail,
  sendDeleteUserOtpEmail,
  sendConsentOtpEmail,
  sendDocumentSignedEmail,
  sendAdminInvitationEmail,
  sendPatientWelcomeEmail,
  sendCustomChargeOtpEmail,
  sendPaymentReceiptEmail,
} from "../src/services/emailService";

beforeEach(() => vi.clearAllMocks());

// ── 1. sendEmailVerificationEmail — resendVerification ───────────────────────
describe("sendEmailVerificationEmail", () => {
  it("usa el cliente de verificación (API key 1)", async () => {
    await sendEmailVerificationEmail("user@test.com", "123456");
    expect(mockSendVerification).toHaveBeenCalledTimes(1);
    expect(mockSendReset).not.toHaveBeenCalled();
    expect(mockSendReminders).not.toHaveBeenCalled();
  });

  it("envía al destinatario correcto con subject correcto", async () => {
    await sendEmailVerificationEmail("paciente@velum.test", "654321");
    const call = mockSendVerification.mock.calls[0][0];
    expect(call.to).toBe("paciente@velum.test");
    expect(call.subject).toContain("verificación");
    expect(call.html).toContain("654321");
  });

  it("el html incluye el OTP en el cuerpo", async () => {
    await sendEmailVerificationEmail("a@b.com", "999888");
    const { html } = mockSendVerification.mock.calls[0][0];
    expect(html).toContain("999888");
  });
});

// ── 2. sendPasswordResetEmail — resendReset ──────────────────────────────────
describe("sendPasswordResetEmail", () => {
  it("usa el cliente de reset (API key 2)", async () => {
    await sendPasswordResetEmail("user@test.com", "https://reset.url/token");
    expect(mockSendReset).toHaveBeenCalledTimes(1);
    expect(mockSendVerification).not.toHaveBeenCalled();
  });

  it("incluye la URL en el subject o html", async () => {
    await sendPasswordResetEmail("u@t.com", "https://my-reset-url.com/xyz");
    const call = mockSendReset.mock.calls[0][0];
    expect(call.html).toContain("https://my-reset-url.com/xyz");
  });

  it("subject menciona contraseña", async () => {
    await sendPasswordResetEmail("u@t.com", "https://url.com");
    const { subject } = mockSendReset.mock.calls[0][0];
    expect(subject.toLowerCase()).toMatch(/contraseña|password/);
  });
});

// ── 3. sendPaymentReminderEmail — resendReminders ────────────────────────────
describe("sendPaymentReminderEmail", () => {
  const params = {
    name: "Ana García",
    planName: "Premium",
    amount: 1500,
    dueDate: "01/04/2026",
  };

  it("usa el cliente de recordatorios (API key 3)", async () => {
    await sendPaymentReminderEmail("u@t.com", params);
    expect(mockSendReminders).toHaveBeenCalledTimes(1);
    expect(mockSendReset).not.toHaveBeenCalled();
  });

  it("incluye el nombre y monto en el html", async () => {
    await sendPaymentReminderEmail("u@t.com", params);
    const { html } = mockSendReminders.mock.calls[0][0];
    expect(html).toContain("Ana");
    expect(html).toContain("1500");
  });
});

// ── 4. sendAppointmentReminderEmail — resendReminders ───────────────────────
describe("sendAppointmentReminderEmail", () => {
  const params = {
    name: "Laura",
    treatment: "Depilación Láser",
    date: "02/04/2026",
    time: "10:00",
    location: "Sucursal Centro",
  };

  it("usa el cliente de recordatorios (API key 3)", async () => {
    await sendAppointmentReminderEmail("u@t.com", params);
    expect(mockSendReminders).toHaveBeenCalledTimes(1);
  });

  it("incluye el tratamiento en el html", async () => {
    await sendAppointmentReminderEmail("u@t.com", params);
    const { html } = mockSendReminders.mock.calls[0][0];
    expect(html).toContain("Depilación Láser");
  });
});

// ── 5. sendAppointmentBookingEmail — resendReminders ────────────────────────
describe("sendAppointmentBookingEmail", () => {
  const params = {
    name: "María",
    treatment: "Fotodepilación",
    date: "05/04/2026",
    time: "11:30",
    location: "Sucursal Norte",
  };

  it("usa el cliente de recordatorios (API key 3)", async () => {
    await sendAppointmentBookingEmail("u@t.com", params);
    expect(mockSendReminders).toHaveBeenCalledTimes(1);
  });
});

// ── 6. sendAppointmentCancellationEmail — resendReminders ───────────────────
describe("sendAppointmentCancellationEmail", () => {
  const params = {
    name: "Carmen",
    treatment: "Láser CO2",
    date: "06/04/2026",
    time: "09:00",
  };

  it("usa el cliente de recordatorios (API key 3)", async () => {
    await sendAppointmentCancellationEmail("u@t.com", params);
    expect(mockSendReminders).toHaveBeenCalledTimes(1);
  });

  it("subject menciona cancelación", async () => {
    await sendAppointmentCancellationEmail("u@t.com", params);
    const { subject } = mockSendReminders.mock.calls[0][0];
    expect(subject.toLowerCase()).toMatch(/cancelaci|cancel/);
  });
});

// ── 7. sendDeleteUserOtpEmail — resendReminders ──────────────────────────────
describe("sendDeleteUserOtpEmail", () => {
  it("usa el cliente de recordatorios (API key 3)", async () => {
    await sendDeleteUserOtpEmail("u@t.com", { adminEmail: "admin@t.com", targetEmail: "paciente@t.com", otp: "112233" });
    expect(mockSendReminders).toHaveBeenCalledTimes(1);
  });

  it("incluye el OTP en el html", async () => {
    await sendDeleteUserOtpEmail("u@t.com", { adminEmail: "admin@t.com", targetEmail: "pac@t.com", otp: "445566" });
    const { html } = mockSendReminders.mock.calls[0][0];
    expect(html).toContain("445566");
  });
});

// ── 8. sendConsentOtpEmail — resendReminders ─────────────────────────────────
describe("sendConsentOtpEmail", () => {
  it("usa el cliente de recordatorios (API key 3)", async () => {
    await sendConsentOtpEmail("u@t.com", { name: "Paciente Test", otp: "778899" });
    expect(mockSendReminders).toHaveBeenCalledTimes(1);
  });

  it("incluye el OTP en el html", async () => {
    await sendConsentOtpEmail("u@t.com", { name: "Dra. Pérez", otp: "321654" });
    const { html } = mockSendReminders.mock.calls[0][0];
    expect(html).toContain("321654");
  });
});

// ── 9. sendDocumentSignedEmail — resendDocuments ─────────────────────────────
describe("sendDocumentSignedEmail", () => {
  it("usa el cliente de documentos (API key 4)", async () => {
    await sendDocumentSignedEmail("u@t.com", { name: "Test", documentType: "Consentimiento", signedAt: "31/03/2026" });
    expect(mockSendDocuments).toHaveBeenCalledTimes(1);
    expect(mockSendReminders).not.toHaveBeenCalled();
  });

  it("subject menciona documento o firma", async () => {
    await sendDocumentSignedEmail("u@t.com", { name: "Ana", documentType: "Contrato", signedAt: "31/03/2026 10:00" });
    const { subject } = mockSendDocuments.mock.calls[0][0];
    expect(subject.toLowerCase()).toMatch(/document|firm|contrato/);
  });
});

// ── 10. sendAdminInvitationEmail — resendAdminInvite ─────────────────────────
describe("sendAdminInvitationEmail", () => {
  it("usa el cliente de invitaciones admin (API key 5)", async () => {
    await sendAdminInvitationEmail("admin@t.com", {
      name: "Carlos",
      role: "staff",
      tempPassword: "Temp123!",
      loginUrl: "https://velum.test/login",
    });
    expect(mockSendAdminInvite).toHaveBeenCalledTimes(1);
    expect(mockSendReminders).not.toHaveBeenCalled();
    expect(mockSendDocuments).not.toHaveBeenCalled();
  });

  it("incluye la contraseña temporal en el html", async () => {
    await sendAdminInvitationEmail("a@t.com", {
      name: "Luis",
      role: "admin",
      tempPassword: "SecurePass999!",
      loginUrl: "https://velum.test",
    });
    const { html } = mockSendAdminInvite.mock.calls[0][0];
    expect(html).toContain("SecurePass999!");
  });
});

// ── 11. sendPatientWelcomeEmail — resendAdminInvite ──────────────────────────
describe("sendPatientWelcomeEmail", () => {
  it("usa el cliente de invitaciones admin (API key 5)", async () => {
    await sendPatientWelcomeEmail("paciente@t.com", {
      name: "Sofía",
      tempPassword: "TempPass123!",
      loginUrl: "https://velum.test",
    });
    expect(mockSendAdminInvite).toHaveBeenCalledTimes(1);
  });
});

// ── 12. sendCustomChargeOtpEmail — resendReminders ───────────────────────────
describe("sendCustomChargeOtpEmail", () => {
  const chargeParams = {
    name: "Valeria",
    otp: "567890",
    chargeId: "chrg-001",
    title: "Tratamiento extra",
    amountFormatted: "$2,500",
    type: "ONE_TIME" as const,
    appBaseUrl: "https://velum.test",
  };

  it("usa el cliente de recordatorios (API key 3)", async () => {
    await sendCustomChargeOtpEmail("u@t.com", chargeParams);
    expect(mockSendReminders).toHaveBeenCalledTimes(1);
  });

  it("incluye el OTP y el monto en el html", async () => {
    await sendCustomChargeOtpEmail("u@t.com", { ...chargeParams, otp: "111222", amountFormatted: "$999" });
    const { html } = mockSendReminders.mock.calls[0][0];
    expect(html).toContain("111222");
    expect(html).toContain("$999");
  });
});

// ── 13. sendPaymentReceiptEmail — resendReminders ─────────────────────────────
describe("sendPaymentReceiptEmail", () => {
  it("usa el cliente de recordatorios (API key 3)", async () => {
    await sendPaymentReceiptEmail("u@t.com", {
      name: "Isabela",
      planName: "Premium",
      amount: "1,800",
      date: "31/03/2026",
    });
    expect(mockSendReminders).toHaveBeenCalledTimes(1);
  });

  it("incluye el invoiceId en el html cuando se provee", async () => {
    await sendPaymentReceiptEmail("u@t.com", {
      name: "Test",
      planName: "Básico",
      amount: "500",
      date: "01/04/2026",
      invoiceId: "inv-XYZ-001",
    });
    const { html } = mockSendReminders.mock.calls[0][0];
    expect(html).toContain("inv-XYZ-001");
  });
});
