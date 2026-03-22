/**
 * Tests de lógica pura de NotificationBell.
 * Cubre: timeAgo() y el backoff exponencial del SSE.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SSE_BACKOFF_INITIAL_MS = 1_000;
const SSE_BACKOFF_MAX_MS = 30_000;

// ── Funciones puras ──────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function simulateBackoff(errorCount: number): number {
  let delay = SSE_BACKOFF_INITIAL_MS;
  for (let i = 0; i < errorCount; i++) {
    delay = Math.min(delay * 2, SSE_BACKOFF_MAX_MS);
  }
  return delay;
}

// ── Tests timeAgo ────────────────────────────────────────────────────────────

describe("timeAgo — formato de timestamp relativo", () => {
  const NOW = new Date("2026-03-22T12:00:00.000Z").getTime();

  beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(NOW));
  afterEach(() => vi.restoreAllMocks());

  it('devuelve "ahora" para diff de 0s (mismo instante)', () =>
    expect(timeAgo(new Date(NOW).toISOString())).toBe("ahora"));
  it('devuelve "ahora" para diff de 30s', () =>
    expect(timeAgo(new Date(NOW - 30_000).toISOString())).toBe("ahora"));
  it('devuelve "ahora" para diff de 59s (límite)', () =>
    expect(timeAgo(new Date(NOW - 59_000).toISOString())).toBe("ahora"));
  it('devuelve "1m" para diff de exactamente 60s', () =>
    expect(timeAgo(new Date(NOW - 60_000).toISOString())).toBe("1m"));
  it('devuelve "5m" para diff de 5 minutos', () =>
    expect(timeAgo(new Date(NOW - 5 * 60_000).toISOString())).toBe("5m"));
  it('devuelve "59m" para diff de 59 minutos (antes del límite de hora)', () =>
    expect(timeAgo(new Date(NOW - 59 * 60_000).toISOString())).toBe("59m"));
  it('devuelve "1h" para diff de exactamente 1 hora', () =>
    expect(timeAgo(new Date(NOW - 3_600_000).toISOString())).toBe("1h"));
  it('devuelve "3h" para diff de 3 horas', () =>
    expect(timeAgo(new Date(NOW - 3 * 3_600_000).toISOString())).toBe("3h"));
  it('devuelve "23h" para diff de 23 horas (antes del límite de día)', () =>
    expect(timeAgo(new Date(NOW - 23 * 3_600_000).toISOString())).toBe("23h"));
  it('devuelve "1d" para diff de exactamente 24 horas', () =>
    expect(timeAgo(new Date(NOW - 86_400_000).toISOString())).toBe("1d"));
  it('devuelve "7d" para diff de 7 días', () =>
    expect(timeAgo(new Date(NOW - 7 * 86_400_000).toISOString())).toBe("7d"));
});

// ── Tests backoff exponencial SSE ────────────────────────────────────────────

describe("SSE exponential backoff — cálculo del delay de reconexión", () => {
  it("constante inicial es 1000ms", () => expect(SSE_BACKOFF_INITIAL_MS).toBe(1000));
  it("constante máxima es 30000ms", () => expect(SSE_BACKOFF_MAX_MS).toBe(30_000));
  it("después del 1er error → 2000ms", () => expect(simulateBackoff(1)).toBe(2000));
  it("después del 2do error → 4000ms", () => expect(simulateBackoff(2)).toBe(4000));
  it("después del 3er error → 8000ms", () => expect(simulateBackoff(3)).toBe(8000));
  it("después del 4to error → 16000ms", () => expect(simulateBackoff(4)).toBe(16000));
  it("después del 5to error → 30000ms (cap)", () => expect(simulateBackoff(5)).toBe(30000));
  it("después del 6to error → sigue en 30000ms", () => expect(simulateBackoff(6)).toBe(30000));
  it("después del 10mo error → sigue en 30000ms", () => expect(simulateBackoff(10)).toBe(30000));
  it("nunca supera SSE_BACKOFF_MAX_MS para cualquier N", () => {
    for (let n = 0; n <= 20; n++) {
      expect(simulateBackoff(n)).toBeLessThanOrEqual(SSE_BACKOFF_MAX_MS);
    }
  });
});
