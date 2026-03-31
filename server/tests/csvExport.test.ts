/**
 * Tests para csvExportService — función pura, sin DB.
 */
import { describe, it, expect } from "vitest";
import { escapeCsvField } from "../src/services/csvExportService";

describe("escapeCsvField", () => {
  it("envuelve el valor en comillas dobles", () => {
    expect(escapeCsvField("hola")).toBe('"hola"');
  });

  it("duplica las comillas dobles internas (RFC 4180)", () => {
    expect(escapeCsvField('dijo "hola"')).toBe('"dijo ""hola"""');
  });

  it("permite comas dentro del campo sin problema", () => {
    const result = escapeCsvField("Chihuahua, MX");
    expect(result).toBe('"Chihuahua, MX"');
  });

  it("permite saltos de línea dentro del campo", () => {
    const result = escapeCsvField("línea1\nlínea2");
    expect(result).toBe('"línea1\nlínea2"');
  });

  it("convierte null a cadena vacía", () => {
    expect(escapeCsvField(null)).toBe('""');
  });

  it("convierte undefined a cadena vacía", () => {
    expect(escapeCsvField(undefined)).toBe('""');
  });

  it("convierte números a string", () => {
    expect(escapeCsvField(42)).toBe('"42"');
  });

  it("convierte booleano a string", () => {
    expect(escapeCsvField(true)).toBe('"true"');
    expect(escapeCsvField(false)).toBe('"false"');
  });

  it("maneja cadena vacía", () => {
    expect(escapeCsvField("")).toBe('""');
  });

  it("maneja múltiples comillas consecutivas", () => {
    expect(escapeCsvField('a""b')).toBe('"a""""b"');
  });
});
