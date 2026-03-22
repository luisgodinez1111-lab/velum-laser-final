import { describe, it, expect, vi, afterEach } from "vitest";

process.env.JWT_SECRET = "test-secret-32-bytes-minimum-len";

describe("appointmentToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("genera un token verificable", async () => {
    const { generateAppointmentConfirmToken, verifyAppointmentConfirmToken } = await import(
      "../src/utils/appointmentToken"
    );
    const id = "appt_abc123";
    const token = generateAppointmentConfirmToken(id);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
    expect(verifyAppointmentConfirmToken(token)).toBe(id);
  });

  it("rechaza token con firma alterada", async () => {
    const { generateAppointmentConfirmToken, verifyAppointmentConfirmToken } = await import(
      "../src/utils/appointmentToken"
    );
    const token = generateAppointmentConfirmToken("appt_xyz");
    // Flip last char of the base64url string
    const tampered = token.slice(0, -1) + (token.slice(-1) === "a" ? "b" : "a");
    expect(verifyAppointmentConfirmToken(tampered)).toBeNull();
  });

  it("rechaza token expirado", async () => {
    const { generateAppointmentConfirmToken, verifyAppointmentConfirmToken } = await import(
      "../src/utils/appointmentToken"
    );
    // Fake Date.now() to be 73 hours in the past when generating
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow - 73 * 3600 * 1000);
    const token = generateAppointmentConfirmToken("appt_old");
    vi.spyOn(Date, "now").mockReturnValue(realNow);
    expect(verifyAppointmentConfirmToken(token)).toBeNull();
  });

  it("rechaza cadena vacía", async () => {
    const { verifyAppointmentConfirmToken } = await import("../src/utils/appointmentToken");
    expect(verifyAppointmentConfirmToken("")).toBeNull();
    expect(verifyAppointmentConfirmToken("not-base64")).toBeNull();
  });
});
