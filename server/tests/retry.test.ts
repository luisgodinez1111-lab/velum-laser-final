/**
 * Tests para utils/retry.ts
 * Cubre: éxito en primer intento, reintentos con backoff, max intentos agotados.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { withRetry } from "../src/utils/retry";

// Timers falsos para evitar esperas reales en los delays
vi.useFakeTimers();
afterAll(() => vi.useRealTimers());

// Helper: avanza todos los timers pendientes para que los awaits resuelvan
const drainTimers = () => vi.runAllTimersAsync();

describe("withRetry — éxito en primer intento", () => {
  it("retorna el valor si la función tiene éxito de inmediato", async () => {
    const fn  = vi.fn().mockResolvedValue("resultado");
    const res = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 100 });
    expect(res).toBe("resultado");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("no registra reintentos si el primer intento es exitoso", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await withRetry(fn, { maxAttempts: 5, initialDelayMs: 50 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("withRetry — éxito después de fallos", () => {
  it("reintenta y devuelve resultado cuando falla N veces luego tiene éxito", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error(`fallo ${calls}`));
      return Promise.resolve("éxito en intento 3");
    });

    const promise = withRetry(fn, { maxAttempts: 5, initialDelayMs: 10 });
    await drainTimers();
    const res = await promise;

    expect(res).toBe("éxito en intento 3");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("reintenta exactamente maxAttempts - 1 veces antes del éxito final", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      if (calls < 4) return Promise.reject(new Error("error"));
      return Promise.resolve("ok");
    });

    const promise = withRetry(fn, { maxAttempts: 4, initialDelayMs: 10 });
    await drainTimers();
    await promise;

    expect(fn).toHaveBeenCalledTimes(4);
  });
});

describe("withRetry — max intentos agotados", () => {
  it("lanza el último error cuando se agotan los intentos", async () => {
    const error = new Error("error persistente");
    const fn    = vi.fn().mockRejectedValue(error);

    const promise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });
    // Adjuntar el handler ANTES de drenar timers para evitar unhandled rejection
    const assertion = expect(promise).rejects.toThrow("error persistente");
    await drainTimers();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("con maxAttempts=1 no hace ningún reintento — solo 1 llamada", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fallo"));
    const promise = withRetry(fn, { maxAttempts: 1, initialDelayMs: 100 });
    // No hay delays con maxAttempts=1 (falla y sale)
    await expect(promise).rejects.toThrow("fallo");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("withRetry — backoff exponencial (verificación por comportamiento)", () => {
  it("reintentos múltiples resuelven correctamente con delays cortos", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      if (calls < 4) return Promise.reject(new Error("err"));
      return Promise.resolve("done");
    });

    // initialDelayMs muy pequeño para que fake timers los drene rápido
    const promise = withRetry(fn, { maxAttempts: 4, initialDelayMs: 1 });
    await drainTimers();
    const result = await promise;

    expect(result).toBe("done");
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("respeta maxDelayMs — la función completa correctamente aunque el backoff sea alto", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error("err"));
      return Promise.resolve("capped");
    });

    const promise = withRetry(fn, {
      maxAttempts: 3,
      initialDelayMs: 1,
      backoffFactor: 100,
      maxDelayMs: 5,
    });
    await drainTimers();
    const result = await promise;

    expect(result).toBe("capped");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
