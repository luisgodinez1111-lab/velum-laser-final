/**
 * Tests para utils/strings.ts
 * Cubre: clean (trim, tipos no-string), validEmail (formatos válidos e inválidos).
 */
import { describe, it, expect } from "vitest";
import { clean, validEmail } from "../src/utils/strings";

describe("clean", () => {
  it("hace trim de espacios al inicio y al final", () => {
    expect(clean("  hola mundo  ")).toBe("hola mundo");
  });

  it("devuelve el string sin modificar si no tiene espacios", () => {
    expect(clean("velum")).toBe("velum");
  });

  it("devuelve '' para string vacío", () => {
    expect(clean("")).toBe("");
  });

  it("devuelve '' para string de solo espacios", () => {
    expect(clean("   ")).toBe("");
  });

  it("devuelve '' para null", () => {
    expect(clean(null)).toBe("");
  });

  it("devuelve '' para undefined", () => {
    expect(clean(undefined)).toBe("");
  });

  it("devuelve '' para número", () => {
    expect(clean(42)).toBe("");
  });

  it("devuelve '' para array", () => {
    expect(clean(["a", "b"])).toBe("");
  });

  it("devuelve '' para objeto", () => {
    expect(clean({ key: "value" })).toBe("");
  });

  it("devuelve '' para booleano", () => {
    expect(clean(true)).toBe("");
    expect(clean(false)).toBe("");
  });

  it("preserva caracteres especiales dentro del string", () => {
    expect(clean("  hola@velum.mx  ")).toBe("hola@velum.mx");
  });
});

describe("validEmail", () => {
  it("acepta email estándar", () => {
    expect(validEmail("user@example.com")).toBe(true);
  });

  it("acepta email con subdominio", () => {
    expect(validEmail("user@mail.velum.mx")).toBe(true);
  });

  it("acepta email con guiones y puntos en local part", () => {
    expect(validEmail("first.last-name@domain.co")).toBe(true);
  });

  it("acepta email con números", () => {
    expect(validEmail("user123@test.io")).toBe(true);
  });

  it("rechaza email sin @", () => {
    expect(validEmail("no-arroba.com")).toBe(false);
  });

  it("rechaza email sin dominio después del @", () => {
    expect(validEmail("user@")).toBe(false);
  });

  it("rechaza email sin TLD", () => {
    expect(validEmail("user@domain")).toBe(false);
  });

  it("rechaza string vacío", () => {
    expect(validEmail("")).toBe(false);
  });

  it("rechaza email con espacios", () => {
    expect(validEmail("user @domain.com")).toBe(false);
  });

  it("rechaza solo el símbolo @", () => {
    expect(validEmail("@")).toBe(false);
  });

  it("rechaza múltiples @", () => {
    expect(validEmail("user@@domain.com")).toBe(false);
  });
});
