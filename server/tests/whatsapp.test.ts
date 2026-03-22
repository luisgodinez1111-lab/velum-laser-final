import { describe, it, expect } from "vitest";
import { normalizePhone } from "../src/services/whatsappMetaService";

describe("normalizePhone", () => {
  it("agrega + a número sin prefijo", () => {
    expect(normalizePhone("526141234567")).toBe("+526141234567");
  });

  it("conserva + existente", () => {
    expect(normalizePhone("+526141234567")).toBe("+526141234567");
  });

  it("elimina espacios, guiones y paréntesis", () => {
    expect(normalizePhone("+52 (614) 123-4567")).toBe("+526141234567");
  });

  it("retorna cadena vacía para input vacío", () => {
    expect(normalizePhone("")).toBe("");
  });

  it("retorna cadena vacía para input sin dígitos", () => {
    expect(normalizePhone("---")).toBe("");
  });
});
