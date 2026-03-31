/**
 * Tests completos de todos los validators Zod.
 * Complementa validators.test.ts y validators2.test.ts existentes.
 * Cubre: happy path, casos inválidos y reglas de negocio (superRefine).
 */
import { describe, it, expect } from "vitest";

// ── auth validators (casos no cubiertos por validators2.test.ts) ─────────────
import {
  forgotSchema,
  resetSchema,
  verifyEmailSchema,
  consentOtpVerifySchema,
  loginSchema,
} from "../src/validators/auth";

describe("forgotSchema", () => {
  it("acepta email válido", () => {
    expect(forgotSchema.safeParse({ email: "user@velum.mx" }).success).toBe(true);
  });
  it("rechaza email malformado", () => {
    expect(forgotSchema.safeParse({ email: "no-email" }).success).toBe(false);
  });
  it("rechaza payload vacío", () => {
    expect(forgotSchema.safeParse({}).success).toBe(false);
  });
});

describe("resetSchema", () => {
  const validToken = "a".repeat(32); // mínimo 32 chars
  const validPass  = "SecurePass@123";

  it("acepta token de 32 chars + password fuerte", () => {
    expect(resetSchema.safeParse({ token: validToken, password: validPass }).success).toBe(true);
  });
  it("rechaza token corto (< 32 chars)", () => {
    expect(resetSchema.safeParse({ token: "short", password: validPass }).success).toBe(false);
  });
  it("rechaza password débil (sin símbolo)", () => {
    expect(resetSchema.safeParse({ token: validToken, password: "SinSimboloABC12" }).success).toBe(false);
  });
  it("rechaza password débil (sin número)", () => {
    expect(resetSchema.safeParse({ token: validToken, password: "SinNumero@abc!!" }).success).toBe(false);
  });
  it("rechaza payload sin token", () => {
    expect(resetSchema.safeParse({ password: validPass }).success).toBe(false);
  });
});

describe("verifyEmailSchema", () => {
  it("acepta email válido + OTP de 6 dígitos", () => {
    expect(verifyEmailSchema.safeParse({ email: "a@b.com", otp: "123456" }).success).toBe(true);
  });
  it("rechaza OTP con letras", () => {
    expect(verifyEmailSchema.safeParse({ email: "a@b.com", otp: "12345a" }).success).toBe(false);
  });
  it("rechaza OTP de 5 dígitos (muy corto)", () => {
    expect(verifyEmailSchema.safeParse({ email: "a@b.com", otp: "12345" }).success).toBe(false);
  });
  it("rechaza OTP de 7 dígitos (muy largo)", () => {
    expect(verifyEmailSchema.safeParse({ email: "a@b.com", otp: "1234567" }).success).toBe(false);
  });
  it("rechaza sin email", () => {
    expect(verifyEmailSchema.safeParse({ otp: "123456" }).success).toBe(false);
  });
});

describe("consentOtpVerifySchema", () => {
  it("acepta OTP de exactamente 6 dígitos", () => {
    expect(consentOtpVerifySchema.safeParse({ otp: "000000" }).success).toBe(true);
  });
  it("rechaza OTP con espacios", () => {
    expect(consentOtpVerifySchema.safeParse({ otp: "12 345" }).success).toBe(false);
  });
  it("rechaza OTP vacío", () => {
    expect(consentOtpVerifySchema.safeParse({ otp: "" }).success).toBe(false);
  });
});

describe("loginSchema — casos adicionales", () => {
  it("rechaza password vacío", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
  it("rechaza sin password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com" }).success).toBe(false);
  });
});

// ── appointments validators ───────────────────────────────────────────────────
import {
  appointmentCreateSchema,
  appointmentUpdateSchema,
} from "../src/validators/appointments";

describe("appointmentCreateSchema", () => {
  const validISO = "2026-05-10T10:00:00.000Z";
  const endISO   = "2026-05-10T11:00:00.000Z";

  it("acepta startAt obligatorio, endAt opcional", () => {
    expect(appointmentCreateSchema.safeParse({ startAt: validISO }).success).toBe(true);
  });
  it("acepta startAt + endAt + campos opcionales", () => {
    expect(appointmentCreateSchema.safeParse({
      startAt: validISO, endAt: endISO,
      cabinId: "cabin-abc", treatmentId: "trt-abc",
      reason: "Revisión", evaluationZones: ["zona1"],
      evaluationCost: 0, evaluationCurrency: "MXN"
    }).success).toBe(true);
  });
  it("rechaza startAt en formato inválido (no ISO)", () => {
    expect(appointmentCreateSchema.safeParse({ startAt: "10/05/2026" }).success).toBe(false);
  });
  it("rechaza evaluationCost negativo", () => {
    expect(appointmentCreateSchema.safeParse({
      startAt: validISO, evaluationCost: -100
    }).success).toBe(false);
  });
  it("rechaza cabinId muy corto (< 3 chars)", () => {
    expect(appointmentCreateSchema.safeParse({ startAt: validISO, cabinId: "ab" }).success).toBe(false);
  });
  it("rechaza evaluationZones con elemento vacío", () => {
    expect(appointmentCreateSchema.safeParse({
      startAt: validISO, evaluationZones: ["zona1", ""]
    }).success).toBe(false);
  });
  it("rechaza sin startAt", () => {
    expect(appointmentCreateSchema.safeParse({ endAt: endISO }).success).toBe(false);
  });
});

describe("appointmentUpdateSchema", () => {
  it("acepta action reschedule con nuevas fechas", () => {
    expect(appointmentUpdateSchema.safeParse({
      action: "reschedule",
      startAt: "2026-05-10T10:00:00.000Z",
      endAt: "2026-05-10T11:00:00.000Z"
    }).success).toBe(true);
  });
  it("acepta action cancel con motivo", () => {
    expect(appointmentUpdateSchema.safeParse({
      action: "cancel", canceledReason: "Paciente no puede asistir"
    }).success).toBe(true);
  });
  it("acepta todas las actions válidas", () => {
    for (const action of ["reschedule", "cancel", "confirm", "complete", "mark_no_show"] as const) {
      expect(appointmentUpdateSchema.safeParse({ action }).success).toBe(true);
    }
  });
  it("rechaza action inválida", () => {
    expect(appointmentUpdateSchema.safeParse({ action: "delete" }).success).toBe(false);
  });
  it("rechaza canceledReason muy corta (< 3 chars)", () => {
    expect(appointmentUpdateSchema.safeParse({ action: "cancel", canceledReason: "no" }).success).toBe(false);
  });
  it("rechaza sin action", () => {
    expect(appointmentUpdateSchema.safeParse({}).success).toBe(false);
  });
});

// ── medicalIntake validators (casos no cubiertos por validators2.test.ts) ────
import { medicalIntakeApproveSchema } from "../src/validators/medicalIntake";

describe("medicalIntakeApproveSchema", () => {
  it("acepta approved=true sin motivo", () => {
    expect(medicalIntakeApproveSchema.safeParse({ approved: true }).success).toBe(true);
  });
  it("acepta approved=false con motivo de rechazo", () => {
    expect(medicalIntakeApproveSchema.safeParse({
      approved: false, rejectionReason: "Documentación incompleta"
    }).success).toBe(true);
  });
  it("rechaza approved=false sin motivo (superRefine)", () => {
    const r = medicalIntakeApproveSchema.safeParse({ approved: false });
    expect(r.success).toBe(false);
    expect((r as { error: { issues: Array<{ path: string[] }> } }).error.issues[0].path).toContain("rejectionReason");
  });
  it("rechaza rejectionReason muy corta (< 3 chars)", () => {
    expect(medicalIntakeApproveSchema.safeParse({
      approved: false, rejectionReason: "no"
    }).success).toBe(false);
  });
  it("rechaza rejectionReason mayor a 500 chars", () => {
    expect(medicalIntakeApproveSchema.safeParse({
      approved: false, rejectionReason: "x".repeat(501)
    }).success).toBe(false);
  });
  it("rechaza approved=true con rejectionReason: el campo se ignora pero aprueba", () => {
    // approved=true con rejectionReason es técnicamente válido (superRefine solo aplica cuando !approved)
    expect(medicalIntakeApproveSchema.safeParse({
      approved: true, rejectionReason: "Motivo irrelevante"
    }).success).toBe(true);
  });
});

// ── membership validators ─────────────────────────────────────────────────────
import { changePlanSchema } from "../src/validators/membership";

describe("changePlanSchema", () => {
  it("acepta priceId válido", () => {
    expect(changePlanSchema.safeParse({ priceId: "price_abc123" }).success).toBe(true);
  });
  it("rechaza priceId muy corto (< 3 chars)", () => {
    expect(changePlanSchema.safeParse({ priceId: "ab" }).success).toBe(false);
  });
  it("rechaza priceId vacío", () => {
    expect(changePlanSchema.safeParse({ priceId: "" }).success).toBe(false);
  });
  it("rechaza sin priceId", () => {
    expect(changePlanSchema.safeParse({}).success).toBe(false);
  });
});

// ── profile validator ─────────────────────────────────────────────────────────
import { profileSchema } from "../src/validators/profile";

describe("profileSchema", () => {
  it("acepta payload completo válido", () => {
    expect(profileSchema.safeParse({
      firstName: "Ana", lastName: "López",
      phone: "6141234567", timezone: "America/Chihuahua"
    }).success).toBe(true);
  });
  it("acepta payload vacío (todos los campos son opcionales)", () => {
    expect(profileSchema.safeParse({}).success).toBe(true);
  });
  it("rechaza firstName vacío (string vacío)", () => {
    expect(profileSchema.safeParse({ firstName: "" }).success).toBe(false);
  });
  it("rechaza phone muy corto (< 6 chars)", () => {
    expect(profileSchema.safeParse({ phone: "12345" }).success).toBe(false);
  });
  it("acepta solo un campo opcional", () => {
    expect(profileSchema.safeParse({ timezone: "UTC" }).success).toBe(true);
  });
});

// ── agenda validators ─────────────────────────────────────────────────────────
import {
  agendaConfigUpdateSchema,
  agendaBlockCreateSchema,
  agendaDateParamSchema,
} from "../src/validators/agenda";

describe("agendaConfigUpdateSchema — política básica", () => {
  it("acepta payload vacío (todo opcional)", () => {
    expect(agendaConfigUpdateSchema.safeParse({}).success).toBe(true);
  });
  it("acepta slotMinutes válido (10–120)", () => {
    expect(agendaConfigUpdateSchema.safeParse({ slotMinutes: 30 }).success).toBe(true);
  });
  it("rechaza slotMinutes menor a 10", () => {
    expect(agendaConfigUpdateSchema.safeParse({ slotMinutes: 5 }).success).toBe(false);
  });
  it("rechaza slotMinutes mayor a 120", () => {
    expect(agendaConfigUpdateSchema.safeParse({ slotMinutes: 121 }).success).toBe(false);
  });
  it("rechaza cuando límite mensual < semanal (superRefine)", () => {
    const r = agendaConfigUpdateSchema.safeParse({
      maxActiveAppointmentsPerWeek: 10,
      maxActiveAppointmentsPerMonth: 5 // inválido: 5 < 10
    });
    expect(r.success).toBe(false);
  });
  it("acepta cuando límite mensual >= semanal", () => {
    expect(agendaConfigUpdateSchema.safeParse({
      maxActiveAppointmentsPerWeek: 4,
      maxActiveAppointmentsPerMonth: 12
    }).success).toBe(true);
  });
  it("acepta límite mensual == semanal (caso borde)", () => {
    expect(agendaConfigUpdateSchema.safeParse({
      maxActiveAppointmentsPerWeek: 8,
      maxActiveAppointmentsPerMonth: 8
    }).success).toBe(true);
  });
});

describe("agendaConfigUpdateSchema — weeklyRules", () => {
  it("acepta regla abierta con rango de horas válido", () => {
    expect(agendaConfigUpdateSchema.safeParse({
      weeklyRules: [{ dayOfWeek: 1, isOpen: true, startHour: 9, endHour: 20 }]
    }).success).toBe(true);
  });
  it("rechaza regla abierta sin horas (refine)", () => {
    expect(agendaConfigUpdateSchema.safeParse({
      weeklyRules: [{ dayOfWeek: 1, isOpen: true }]
    }).success).toBe(false);
  });
  it("rechaza endHour <= startHour en regla abierta", () => {
    expect(agendaConfigUpdateSchema.safeParse({
      weeklyRules: [{ dayOfWeek: 1, isOpen: true, startHour: 10, endHour: 10 }]
    }).success).toBe(false);
  });
  it("acepta regla cerrada sin horas (día cerrado)", () => {
    expect(agendaConfigUpdateSchema.safeParse({
      weeklyRules: [{ dayOfWeek: 0, isOpen: false }]
    }).success).toBe(true);
  });
  it("rechaza dayOfWeek fuera de rango (7)", () => {
    expect(agendaConfigUpdateSchema.safeParse({
      weeklyRules: [{ dayOfWeek: 7, isOpen: false }]
    }).success).toBe(false);
  });
});

describe("agendaConfigUpdateSchema — tratamientos", () => {
  it("acepta tratamiento válido", () => {
    expect(agendaConfigUpdateSchema.safeParse({
      treatments: [{
        name: "Depilación láser", code: "dep_laser",
        durationMinutes: 60
      }]
    }).success).toBe(true);
  });
  it("rechaza code con mayúsculas", () => {
    expect(agendaConfigUpdateSchema.safeParse({
      treatments: [{ name: "Test", code: "Dep_Laser", durationMinutes: 60 }]
    }).success).toBe(false);
  });
  it("rechaza durationMinutes < 10", () => {
    expect(agendaConfigUpdateSchema.safeParse({
      treatments: [{ name: "Test", code: "test", durationMinutes: 5 }]
    }).success).toBe(false);
  });
  it("rechaza requiresSpecificCabin=true sin cabinId ni allowedCabinIds (refine)", () => {
    const r = agendaConfigUpdateSchema.safeParse({
      treatments: [{
        name: "Test", code: "test",
        durationMinutes: 30, requiresSpecificCabin: true
      }]
    });
    expect(r.success).toBe(false);
  });
  it("acepta requiresSpecificCabin=true con cabinId definido", () => {
    expect(agendaConfigUpdateSchema.safeParse({
      treatments: [{
        name: "Test", code: "test",
        durationMinutes: 30,
        requiresSpecificCabin: true,
        cabinId: "cabin-xyz"
      }]
    }).success).toBe(true);
  });
});

describe("agendaBlockCreateSchema", () => {
  it("acepta bloqueo válido", () => {
    expect(agendaBlockCreateSchema.safeParse({
      dateKey: "2026-05-10", startMinute: 0, endMinute: 60
    }).success).toBe(true);
  });
  it("rechaza cuando endMinute <= startMinute (refine)", () => {
    expect(agendaBlockCreateSchema.safeParse({
      dateKey: "2026-05-10", startMinute: 60, endMinute: 60
    }).success).toBe(false);
  });
  it("rechaza dateKey con formato incorrecto", () => {
    expect(agendaBlockCreateSchema.safeParse({
      dateKey: "10/05/2026", startMinute: 0, endMinute: 60
    }).success).toBe(false);
  });
  it("rechaza startMinute negativo", () => {
    expect(agendaBlockCreateSchema.safeParse({
      dateKey: "2026-05-10", startMinute: -1, endMinute: 60
    }).success).toBe(false);
  });
  it("rechaza endMinute mayor a 1440", () => {
    expect(agendaBlockCreateSchema.safeParse({
      dateKey: "2026-05-10", startMinute: 0, endMinute: 1441
    }).success).toBe(false);
  });
  it("acepta bloqueo con cabinId y motivo opcionales", () => {
    expect(agendaBlockCreateSchema.safeParse({
      dateKey: "2026-05-10", startMinute: 480, endMinute: 540,
      cabinId: "cabin-1", reason: "Mantenimiento"
    }).success).toBe(true);
  });
});

describe("agendaDateParamSchema", () => {
  it("acepta fecha en formato YYYY-MM-DD", () => {
    expect(agendaDateParamSchema.safeParse({ dateKey: "2026-05-10" }).success).toBe(true);
  });
  it("rechaza formato DD-MM-YYYY", () => {
    expect(agendaDateParamSchema.safeParse({ dateKey: "10-05-2026" }).success).toBe(false);
  });
  it("rechaza fecha sin guiones", () => {
    expect(agendaDateParamSchema.safeParse({ dateKey: "20260510" }).success).toBe(false);
  });
});

// ── documents validators ──────────────────────────────────────────────────────
import { documentUploadSchema, documentSignSchema } from "../src/validators/documents";

describe("documentUploadSchema", () => {
  it("acepta todos los tipos válidos", () => {
    for (const type of ["informed_consent", "privacy_notice", "medical_history", "other"] as const) {
      expect(documentUploadSchema.safeParse({ type }).success).toBe(true);
    }
  });
  it("rechaza tipo no permitido", () => {
    expect(documentUploadSchema.safeParse({ type: "invoice" }).success).toBe(false);
  });
  it("acepta sin version (campo opcional)", () => {
    expect(documentUploadSchema.safeParse({ type: "other" }).success).toBe(true);
  });
  it("acepta con version", () => {
    expect(documentUploadSchema.safeParse({ type: "privacy_notice", version: "v2" }).success).toBe(true);
  });
  it("rechaza sin type", () => {
    expect(documentUploadSchema.safeParse({}).success).toBe(false);
  });
});

describe("documentSignSchema", () => {
  it("acepta signature válida", () => {
    expect(documentSignSchema.safeParse({ signature: "firma-base64-data..." }).success).toBe(true);
  });
  it("rechaza signature menor a 10 chars", () => {
    expect(documentSignSchema.safeParse({ signature: "corta" }).success).toBe(false);
  });
  it("rechaza signature vacía", () => {
    expect(documentSignSchema.safeParse({ signature: "" }).success).toBe(false);
  });
  it("rechaza sin signature", () => {
    expect(documentSignSchema.safeParse({}).success).toBe(false);
  });
});

// ── sessions validators ───────────────────────────────────────────────────────
import { sessionCreateSchema, sessionFeedbackSchema } from "../src/validators/sessions";

describe("sessionCreateSchema", () => {
  it("acepta sesión válida con userId obligatorio", () => {
    expect(sessionCreateSchema.safeParse({ userId: "user-abc" }).success).toBe(true);
  });
  it("acepta sesión completa con todos los campos", () => {
    expect(sessionCreateSchema.safeParse({
      userId: "user-abc",
      appointmentId: "apt-xyz",
      laserParametersJson: { power: 10, frequency: 5 },
      notes: "Sin incidencias",
      adverseEvents: "Leve enrojecimiento"
    }).success).toBe(true);
  });
  it("rechaza sin userId", () => {
    expect(sessionCreateSchema.safeParse({}).success).toBe(false);
  });
  it("rechaza userId muy corto (< 3 chars)", () => {
    expect(sessionCreateSchema.safeParse({ userId: "ab" }).success).toBe(false);
  });
  it("rechaza notes vacío (min 1)", () => {
    expect(sessionCreateSchema.safeParse({ userId: "user-abc", notes: "" }).success).toBe(false);
  });
  it("acepta sin campos opcionales", () => {
    expect(sessionCreateSchema.safeParse({ userId: "user-abc-123" }).success).toBe(true);
  });
});

describe("sessionFeedbackSchema", () => {
  it("acepta feedback válido", () => {
    expect(sessionFeedbackSchema.safeParse({ memberFeedback: "Muy buena experiencia" }).success).toBe(true);
  });
  it("rechaza feedback menor a 3 chars", () => {
    expect(sessionFeedbackSchema.safeParse({ memberFeedback: "ok" }).success).toBe(false);
  });
  it("rechaza feedback vacío", () => {
    expect(sessionFeedbackSchema.safeParse({ memberFeedback: "" }).success).toBe(false);
  });
  it("rechaza sin memberFeedback", () => {
    expect(sessionFeedbackSchema.safeParse({}).success).toBe(false);
  });
});

// ── leads validators (casos adicionales a validators.test.ts) ─────────────────
import { marketingEventSchema } from "../src/validators/leads";

describe("marketingEventSchema", () => {
  it("acepta evento mínimo válido", () => {
    expect(marketingEventSchema.safeParse({
      eventName: "Lead", eventId: "evt-001"
    }).success).toBe(true);
  });
  it("acepta evento completo con todos los campos", () => {
    expect(marketingEventSchema.safeParse({
      eventName: "Purchase",
      eventId: "evt-999",
      eventTime: "2026-05-10T10:00:00.000Z",
      userId: "usr-abc",
      leadId: "lead-xyz",
      fbp: "fb.1.123",
      fbc: "fb.2.abc",
      userData: { email: "hash123" },
      customData: { value: 1500 }
    }).success).toBe(true);
  });
  it("rechaza eventName vacío", () => {
    expect(marketingEventSchema.safeParse({ eventName: "", eventId: "evt-001" }).success).toBe(false);
  });
  it("rechaza eventId muy corto (< 3 chars)", () => {
    expect(marketingEventSchema.safeParse({ eventName: "Lead", eventId: "e1" }).success).toBe(false);
  });
  it("rechaza sin eventId", () => {
    expect(marketingEventSchema.safeParse({ eventName: "Lead" }).success).toBe(false);
  });
  it("rechaza eventTime con formato inválido", () => {
    expect(marketingEventSchema.safeParse({
      eventName: "Lead", eventId: "evt-001", eventTime: "no-es-iso"
    }).success).toBe(false);
  });
});

// ── audit validator ────────────────────────────────────────────────────────────
import { auditFilterSchema } from "../src/validators/audit";

describe("auditFilterSchema", () => {
  it("acepta payload vacío (todos opcionales)", () => {
    expect(auditFilterSchema.safeParse({}).success).toBe(true);
  });
  it("acepta todos los campos válidos", () => {
    expect(auditFilterSchema.safeParse({
      actorUserId: "usr-1", action: "LOGIN",
      result: "success", limit: 50, page: 1
    }).success).toBe(true);
  });
  it("acepta result='failed'", () => {
    expect(auditFilterSchema.safeParse({ result: "failed" }).success).toBe(true);
  });
  it("rechaza result inválido", () => {
    expect(auditFilterSchema.safeParse({ result: "error" }).success).toBe(false);
  });
  it("rechaza limit de 0 (< 1)", () => {
    expect(auditFilterSchema.safeParse({ limit: 0 }).success).toBe(false);
  });
  it("rechaza limit mayor a 200", () => {
    expect(auditFilterSchema.safeParse({ limit: 201 }).success).toBe(false);
  });
  it("acepta limit como string coercible a número", () => {
    // auditFilterSchema usa z.coerce.number() — debe aceptar string "50"
    expect(auditFilterSchema.safeParse({ limit: "50" }).success).toBe(true);
  });
  it("rechaza page de 0 (< 1)", () => {
    expect(auditFilterSchema.safeParse({ page: 0 }).success).toBe(false);
  });
  it("rechaza limit decimal (no entero)", () => {
    expect(auditFilterSchema.safeParse({ limit: 10.5 }).success).toBe(false);
  });
});

// ── admin validator ────────────────────────────────────────────────────────────
import { roleUpdateSchema } from "../src/validators/admin";

describe("roleUpdateSchema", () => {
  it("acepta todos los roles válidos", () => {
    for (const role of ["member", "staff", "admin", "system"] as const) {
      expect(roleUpdateSchema.safeParse({ role }).success).toBe(true);
    }
  });
  it("rechaza rol inventado", () => {
    expect(roleUpdateSchema.safeParse({ role: "superadmin" }).success).toBe(false);
  });
  it("rechaza rol vacío", () => {
    expect(roleUpdateSchema.safeParse({ role: "" }).success).toBe(false);
  });
  it("rechaza sin role", () => {
    expect(roleUpdateSchema.safeParse({}).success).toBe(false);
  });
  it("rechaza rol en mayúsculas ('Admin')", () => {
    expect(roleUpdateSchema.safeParse({ role: "Admin" }).success).toBe(false);
  });
});
