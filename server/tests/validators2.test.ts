/**
 * VALERIA — Validators (medical intake + auth + membership)
 * Valida rangos, enums y reglas de negocio en schemas Zod.
 */
import { describe, it, expect } from "vitest";

// ── medicalIntakeUpdateSchema ────────────────────────────────────────────────
import { medicalIntakeUpdateSchema } from "../src/validators/medicalIntake";

describe("medicalIntakeUpdateSchema", () => {
  it("acepta phototype válido (1–6)", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(medicalIntakeUpdateSchema.safeParse({ phototype: n }).success).toBe(true);
    }
  });

  it("rechaza phototype 0 (fuera de rango)", () => {
    expect(medicalIntakeUpdateSchema.safeParse({ phototype: 0 }).success).toBe(false);
  });

  it("rechaza phototype 7 (fuera de rango)", () => {
    expect(medicalIntakeUpdateSchema.safeParse({ phototype: 7 }).success).toBe(false);
  });

  it("rechaza phototype decimal", () => {
    expect(medicalIntakeUpdateSchema.safeParse({ phototype: 2.5 }).success).toBe(false);
  });

  it("acepta status 'submitted'", () => {
    expect(medicalIntakeUpdateSchema.safeParse({ status: "submitted" }).success).toBe(true);
  });

  it("rechaza status 'approved' (no permitido por socias)", () => {
    expect(medicalIntakeUpdateSchema.safeParse({ status: "approved" }).success).toBe(false);
  });

  it("rechaza signatureKey menor a 3 caracteres", () => {
    expect(medicalIntakeUpdateSchema.safeParse({ signatureKey: "ab" }).success).toBe(false);
  });

  it("acepta payload vacío (actualización parcial)", () => {
    expect(medicalIntakeUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("acepta historyJson como objeto libre", () => {
    const r = medicalIntakeUpdateSchema.safeParse({
      historyJson: { allergies: "Latex", medications: "", skinConditions: "Psoriasis leve" }
    });
    expect(r.success).toBe(true);
  });
});

// ── auth validators ──────────────────────────────────────────────────────────
import { registerSchema, loginSchema } from "../src/validators/auth";

describe("registerSchema", () => {
  // registerSchema requires password min 12 characters (no additional complexity rules)
  const base = { email: "test@velum.mx", password: "SecurePass@123", firstName: "Ana" };

  it("acepta registro válido", () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza email malformado", () => {
    expect(registerSchema.safeParse({ ...base, email: "no-es-email" }).success).toBe(false);
  });

  it("rechaza contraseña menor a 12 caracteres", () => {
    expect(registerSchema.safeParse({ ...base, password: "Corta@1" }).success).toBe(false);
  });

  it("rechaza contraseña de exactamente 11 caracteres", () => {
    expect(registerSchema.safeParse({ ...base, password: "Abcdefghij1" }).success).toBe(false);
  });

  it("acepta contraseña de exactamente 12 caracteres", () => {
    expect(registerSchema.safeParse({ ...base, password: "Abcdefghij12" }).success).toBe(true);
  });

  it("acepta registro sin firstName (campo opcional)", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "ValidPassword123" }).success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("acepta email + password válidos", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "cualquiera" }).success).toBe(true);
  });

  it("rechaza sin email", () => {
    expect(loginSchema.safeParse({ password: "pass" }).success).toBe(false);
  });
});

// ── membershipUpdateSchema ──────────────────────────────────────────────────
import { membershipUpdateSchema } from "../src/validators/membership";

describe("membershipUpdateSchema", () => {
  const validStatuses = ["active", "past_due", "canceled", "paused", "inactive"] as const;

  it("acepta todos los status válidos de membresía", () => {
    for (const status of validStatuses) {
      expect(membershipUpdateSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rechaza status inventado", () => {
    expect(membershipUpdateSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});
