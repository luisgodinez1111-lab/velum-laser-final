/**
 * Tests de lógica pura de CustomChargePage.
 * No requiere @testing-library/react — cubre las funciones extraídas inline.
 */
import { describe, it, expect } from "vitest";

// ── Funciones puras que reflejan la lógica de CustomChargePage ──────────────

function extractOtpDigit(value: string): string {
  return value.replace(/\D/g, "").slice(-1);
}

function extractPastedOtp(text: string): string[] | null {
  const digits = text.replace(/\D/g, "").slice(0, 6);
  return digits.length === 6 ? digits.split("") : null;
}

function isTerminalOtpError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("demasiados intentos") || lower.includes("too many");
}

function isVerifyButtonDisabled(params: {
  otp: string[];
  verifying: boolean;
  otpBlocked: boolean;
}): boolean {
  const { otp, verifying, otpBlocked } = params;
  return verifying || otp.join("").length !== 6 || otpBlocked;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("extractOtpDigit — lógica de handleOtpChange", () => {
  it("acepta un dígito numérico", () => expect(extractOtpDigit("5")).toBe("5"));
  it("conserva el último dígito al escribir sobre otro ('35' → '5')", () => expect(extractOtpDigit("35")).toBe("5"));
  it("elimina letras y devuelve vacío", () => expect(extractOtpDigit("a")).toBe(""));
  it("elimina símbolos y devuelve vacío", () => expect(extractOtpDigit("@")).toBe(""));
  it("extrae el último dígito de entrada mixta 'abc5'", () => expect(extractOtpDigit("abc5")).toBe("5"));
  it("devuelve vacío para entrada vacía", () => expect(extractOtpDigit("")).toBe(""));
});

describe("extractPastedOtp — lógica de handlePaste", () => {
  it("devuelve array de 6 dígitos exactos", () => expect(extractPastedOtp("123456")).toEqual(["1","2","3","4","5","6"]));
  it("extrae 6 dígitos de '12 34 56' (con espacios)", () => expect(extractPastedOtp("12 34 56")).toEqual(["1","2","3","4","5","6"]));
  it("extrae 6 dígitos de '123-456' (con guión)", () => expect(extractPastedOtp("123-456")).toEqual(["1","2","3","4","5","6"]));
  it("usa solo los primeros 6 cuando hay más de 6", () => expect(extractPastedOtp("12345678")).toEqual(["1","2","3","4","5","6"]));
  it("devuelve null con menos de 6 dígitos", () => expect(extractPastedOtp("12345")).toBeNull());
  it("devuelve null para texto sin dígitos", () => expect(extractPastedOtp("abcdef")).toBeNull());
  it("devuelve null para cadena vacía", () => expect(extractPastedOtp("")).toBeNull());
});

describe("isTerminalOtpError — detección de otpBlocked en handleVerify", () => {
  it("detecta 'demasiados intentos'", () => expect(isTerminalOtpError("demasiados intentos")).toBe(true));
  it("es case-insensitive ('Demasiados Intentos')", () => expect(isTerminalOtpError("Demasiados Intentos")).toBe(true));
  it("detecta 'Too many attempts' en inglés", () => expect(isTerminalOtpError("Too many attempts")).toBe(true));
  it("detecta 'too many requests' en minúsculas", () => expect(isTerminalOtpError("too many requests")).toBe(true));
  it("no activa para error de código incorrecto", () => expect(isTerminalOtpError("Código incorrecto o expirado")).toBe(false));
  it("no activa para 'intentos' sin 'demasiados'", () => expect(isTerminalOtpError("Varios intentos fallidos")).toBe(false));
  it("no activa para cadena vacía", () => expect(isTerminalOtpError("")).toBe(false));
});

describe("isVerifyButtonDisabled — reglas de disabled del botón", () => {
  const full    = ["1","2","3","4","5","6"];
  const partial = ["1","2","3","","",""];
  const empty   = ["","","","","",""];

  it("habilitado: OTP completo, no verifying, no bloqueado", () =>
    expect(isVerifyButtonDisabled({ otp: full, verifying: false, otpBlocked: false })).toBe(false));
  it("deshabilitado: OTP incompleto", () =>
    expect(isVerifyButtonDisabled({ otp: partial, verifying: false, otpBlocked: false })).toBe(true));
  it("deshabilitado: verifying=true (aunque OTP completo)", () =>
    expect(isVerifyButtonDisabled({ otp: full, verifying: true, otpBlocked: false })).toBe(true));
  it("deshabilitado: otpBlocked=true (aunque OTP completo)", () =>
    expect(isVerifyButtonDisabled({ otp: full, verifying: false, otpBlocked: true })).toBe(true));
  it("deshabilitado: OTP vacío", () =>
    expect(isVerifyButtonDisabled({ otp: empty, verifying: false, otpBlocked: false })).toBe(true));
});
