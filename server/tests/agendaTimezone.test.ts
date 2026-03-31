/**
 * Tests para agendaTimezoneUtils — funciones puras, sin DB.
 * Zona de referencia: America/Chihuahua (UTC-7 en horario de verano, UTC-6 en invierno).
 */
import { describe, it, expect } from "vitest";
import {
  toZonedParts,
  overlapsRange,
  normalizeDateKey,
  bufferedRange,
  appointmentRangeForDateKey,
  dayOfWeekForDateKey,
} from "../src/services/agendaTimezoneUtils";

const TZ = "America/Chihuahua";

describe("toZonedParts", () => {
  it("convierte UTC a fecha local correctamente (UTC-6 todo el año desde 2022)", () => {
    // México eliminó el horario de verano en 2022 → Chihuahua es UTC-6 permanente
    // 2025-06-15 16:00 UTC = 2025-06-15 10:00 Chihuahua (UTC-6)
    const date = new Date("2025-06-15T16:00:00.000Z");
    const parts = toZonedParts(date, TZ);
    expect(parts.dateKey).toBe("2025-06-15");
    expect(parts.minutesFromDay).toBe(10 * 60); // 10:00
  });

  it("convierte UTC a fecha local correctamente (hora de invierno UTC-6)", () => {
    // 2025-01-15 15:00 UTC = 2025-01-15 09:00 Chihuahua (UTC-6)
    const date = new Date("2025-01-15T15:00:00.000Z");
    const parts = toZonedParts(date, TZ);
    expect(parts.dateKey).toBe("2025-01-15");
    expect(parts.minutesFromDay).toBe(9 * 60);
  });

  it("retorna dayOfWeek correcto (lunes = 1)", () => {
    // 2025-06-16 es lunes
    const date = new Date("2025-06-16T16:00:00.000Z");
    const parts = toZonedParts(date, TZ);
    expect(parts.dayOfWeek).toBe(1);
  });

  it("retorna dayOfWeek correcto (domingo = 0)", () => {
    // 2025-06-15 es domingo
    const date = new Date("2025-06-15T16:00:00.000Z");
    const parts = toZonedParts(date, TZ);
    expect(parts.dayOfWeek).toBe(0);
  });
});

describe("dayOfWeekForDateKey", () => {
  it("retorna el día de semana correcto para 2025-06-16 (lunes)", () => {
    expect(dayOfWeekForDateKey("2025-06-16", TZ)).toBe(1);
  });

  it("retorna 0 para domingo", () => {
    expect(dayOfWeekForDateKey("2025-06-15", TZ)).toBe(0);
  });
});

describe("overlapsRange", () => {
  it("detecta overlap cuando B inicia dentro de A", () => {
    expect(overlapsRange(0, 60, 30, 90)).toBe(true);
  });

  it("detecta overlap cuando A inicia dentro de B", () => {
    expect(overlapsRange(30, 90, 0, 60)).toBe(true);
  });

  it("detecta overlap cuando A contiene a B completamente", () => {
    expect(overlapsRange(0, 120, 30, 60)).toBe(true);
  });

  it("retorna false cuando B termina exactamente donde A empieza (adyacentes)", () => {
    expect(overlapsRange(60, 120, 0, 60)).toBe(false);
  });

  it("retorna false cuando A termina antes de que B inicie", () => {
    expect(overlapsRange(0, 30, 60, 120)).toBe(false);
  });

  it("retorna false cuando B termina antes de que A inicie", () => {
    expect(overlapsRange(60, 120, 0, 30)).toBe(false);
  });
});

describe("normalizeDateKey", () => {
  it("elimina espacios en blanco al inicio y final", () => {
    expect(normalizeDateKey("  2025-06-15  ")).toBe("2025-06-15");
  });

  it("no modifica strings ya normalizados", () => {
    expect(normalizeDateKey("2025-06-15")).toBe("2025-06-15");
  });
});

describe("bufferedRange", () => {
  it("aplica buffer de preparación restando minutos del inicio", () => {
    const start = new Date("2025-06-15T10:00:00.000Z");
    const end = new Date("2025-06-15T11:00:00.000Z");
    const result = bufferedRange({ startAt: start, endAt: end, prepBufferMinutes: 15 });
    expect(result.startAt.getTime()).toBe(start.getTime() - 15 * 60 * 1000);
    expect(result.endAt.getTime()).toBe(end.getTime());
  });

  it("aplica buffer de limpieza sumando minutos al final", () => {
    const start = new Date("2025-06-15T10:00:00.000Z");
    const end = new Date("2025-06-15T11:00:00.000Z");
    const result = bufferedRange({ startAt: start, endAt: end, cleanupBufferMinutes: 10 });
    expect(result.startAt.getTime()).toBe(start.getTime());
    expect(result.endAt.getTime()).toBe(end.getTime() + 10 * 60 * 1000);
  });

  it("aplica ambos buffers simultáneamente", () => {
    const start = new Date("2025-06-15T10:00:00.000Z");
    const end = new Date("2025-06-15T11:00:00.000Z");
    const result = bufferedRange({ startAt: start, endAt: end, prepBufferMinutes: 15, cleanupBufferMinutes: 10 });
    expect(result.startAt.getTime()).toBe(start.getTime() - 15 * 60 * 1000);
    expect(result.endAt.getTime()).toBe(end.getTime() + 10 * 60 * 1000);
  });

  it("sin buffers retorna el rango original intacto", () => {
    const start = new Date("2025-06-15T10:00:00.000Z");
    const end = new Date("2025-06-15T11:00:00.000Z");
    const result = bufferedRange({ startAt: start, endAt: end });
    expect(result.startAt.getTime()).toBe(start.getTime());
    expect(result.endAt.getTime()).toBe(end.getTime());
  });
});

describe("appointmentRangeForDateKey", () => {
  const TZ = "America/Chihuahua";

  it("retorna null cuando la cita es un día diferente al dateKey", () => {
    // Cita: 2025-06-16 10:00-11:00 Chihuahua
    const appt = {
      startAt: new Date("2025-06-16T17:00:00.000Z"), // 10:00 Chihuahua UTC-7
      endAt: new Date("2025-06-16T18:00:00.000Z"),
      treatment: null,
    } as any;
    const result = appointmentRangeForDateKey(appt, "2025-06-15", TZ);
    expect(result).toBeNull();
  });

  it("retorna el rango en minutos cuando la cita pertenece al dateKey", () => {
    // Cita: 2025-06-16 11:00-12:00 Chihuahua (UTC-6) → startAt=17:00Z, endAt=18:00Z
    const appt = {
      startAt: new Date("2025-06-16T17:00:00.000Z"),
      endAt: new Date("2025-06-16T18:00:00.000Z"),
      treatment: null,
    } as any;
    const result = appointmentRangeForDateKey(appt, "2025-06-16", TZ);
    expect(result).not.toBeNull();
    expect(result!.startMinute).toBe(11 * 60); // 11:00
    expect(result!.endMinute).toBe(12 * 60);   // 12:00
  });

  it("aplica buffers del tratamiento al calcular el rango", () => {
    // Cita: 11:00-12:00 Chihuahua (UTC-6), con 15 min prep buffer
    // startAt buffered = 10:45 → startMinute = 10*60+45 = 645
    const appt = {
      startAt: new Date("2025-06-16T17:00:00.000Z"), // 11:00 Chihuahua
      endAt: new Date("2025-06-16T18:00:00.000Z"),   // 12:00 Chihuahua
      treatment: { prepBufferMinutes: 15, cleanupBufferMinutes: 0 },
    } as any;
    const result = appointmentRangeForDateKey(appt, "2025-06-16", TZ);
    expect(result).not.toBeNull();
    expect(result!.startMinute).toBe(10 * 60 + 45); // 10:45
    expect(result!.endMinute).toBe(12 * 60);         // 12:00
  });
});
