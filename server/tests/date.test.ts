/**
 * Tests para utils/date.ts
 * Cubre: addHours con tiempo anclado.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const FIXED_NOW = new Date("2026-03-31T12:00:00.000Z");
vi.useFakeTimers();
vi.setSystemTime(FIXED_NOW);
afterAll(() => vi.useRealTimers());

import { addHours } from "../src/utils/date";

describe("addHours", () => {
  it("agrega 1 hora a la fecha actual", () => {
    const result = addHours(1);
    const expected = new Date(FIXED_NOW);
    expected.setHours(expected.getHours() + 1);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("agrega 24 horas (1 día)", () => {
    const result   = addHours(24);
    const expected = new Date(FIXED_NOW);
    expected.setHours(expected.getHours() + 24);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("agrega 0 horas — retorna fecha igual a ahora", () => {
    const result = addHours(0);
    const now    = new Date(FIXED_NOW);
    now.setHours(now.getHours() + 0);
    expect(result.getTime()).toBe(now.getTime());
  });

  it("retorna un objeto Date", () => {
    expect(addHours(1)).toBeInstanceOf(Date);
  });

  it("agrega horas negativas (retrocede en el tiempo)", () => {
    const result   = addHours(-2);
    const expected = new Date(FIXED_NOW);
    expected.setHours(expected.getHours() - 2);
    expect(result.getTime()).toBe(expected.getTime());
  });
});
