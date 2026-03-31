/**
 * Tests para utils/circuitBreaker.ts
 * Cubre: estado closed → open → half-open → closed, configuración, instancias compartidas.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { CircuitBreaker } from "../src/utils/circuitBreaker";

// Usar timers falsos para controlar el tiempo de recovery sin esperas reales
vi.useFakeTimers();
afterAll(() => vi.useRealTimers());

const fail = () => Promise.reject(new Error("fallo simulado"));
const succeed = () => Promise.resolve("ok");

describe("CircuitBreaker — estado inicial (closed)", () => {
  it("inicia en estado 'closed'", () => {
    const cb = new CircuitBreaker({ name: "test" });
    expect(cb.getState()).toBe("closed");
  });

  it("getName devuelve el nombre configurado", () => {
    const cb = new CircuitBreaker({ name: "mi-servicio" });
    expect(cb.getName()).toBe("mi-servicio");
  });

  it("ejecuta la función y retorna el resultado en estado closed", async () => {
    const cb  = new CircuitBreaker({ name: "test" });
    const res = await cb.execute(() => Promise.resolve(42));
    expect(res).toBe(42);
  });
});

describe("CircuitBreaker — transición closed → open", () => {
  it("abre después de alcanzar el failureThreshold", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 3 });

    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }

    expect(cb.getState()).toBe("open");
  });

  it("NO abre antes de alcanzar el threshold", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 3 });

    for (let i = 0; i < 2; i++) {
      await cb.execute(fail).catch(() => {});
    }

    expect(cb.getState()).toBe("closed");
  });

  it("threshold por defecto es 5", async () => {
    const cb = new CircuitBreaker({ name: "default-threshold" });

    for (let i = 0; i < 4; i++) {
      await cb.execute(fail).catch(() => {});
    }
    expect(cb.getState()).toBe("closed");

    await cb.execute(fail).catch(() => {});
    expect(cb.getState()).toBe("open");
  });

  it("re-lanza el error original al fallar", async () => {
    const cb  = new CircuitBreaker({ name: "test" });
    const err = new Error("error específico");
    await expect(cb.execute(() => Promise.reject(err))).rejects.toThrow("error específico");
  });
});

describe("CircuitBreaker — estado open", () => {
  it("lanza error inmediato sin ejecutar la función cuando está abierto", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 1, recoveryTimeMs: 60_000 });
    await cb.execute(fail).catch(() => {});

    expect(cb.getState()).toBe("open");

    const spy = vi.fn().mockResolvedValue("ok");
    await expect(cb.execute(spy)).rejects.toThrow(/abierto/);
    // La función NO debe haberse llamado
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("CircuitBreaker — transición open → half-open → closed", () => {
  it("pasa a half-open después del recoveryTimeMs", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 1, recoveryTimeMs: 5_000 });
    await cb.execute(fail).catch(() => {});
    expect(cb.getState()).toBe("open");

    // Avanzar el tiempo más allá del recovery
    vi.advanceTimersByTime(6_000);

    // El próximo execute activa la transición a half-open
    await cb.execute(succeed).catch(() => {});
    // Después de 1 éxito en half-open con successThreshold=2, sigue en half-open o cerrado
    expect(["half-open", "closed"]).toContain(cb.getState());
  });

  it("cierra después de successThreshold éxitos en half-open", async () => {
    const cb = new CircuitBreaker({
      name: "test",
      failureThreshold: 1,
      recoveryTimeMs: 1_000,
      successThreshold: 2,
    });

    // Abrir el circuit
    await cb.execute(fail).catch(() => {});
    expect(cb.getState()).toBe("open");

    // Avanzar tiempo → half-open
    vi.advanceTimersByTime(2_000);

    // Primer éxito en half-open
    await cb.execute(succeed);
    expect(cb.getState()).toBe("half-open");

    // Segundo éxito → cierra
    await cb.execute(succeed);
    expect(cb.getState()).toBe("closed");
  });

  it("vuelve a open si falla en estado half-open", async () => {
    const cb = new CircuitBreaker({
      name: "test",
      failureThreshold: 1,
      recoveryTimeMs: 1_000,
      successThreshold: 3,
    });

    await cb.execute(fail).catch(() => {});
    vi.advanceTimersByTime(2_000);

    // Un éxito lleva a half-open
    await cb.execute(succeed);
    expect(cb.getState()).toBe("half-open");

    // Un fallo en half-open vuelve a open
    await cb.execute(fail).catch(() => {});
    expect(cb.getState()).toBe("open");
  });
});

describe("CircuitBreaker — éxito resetea el contador de fallas", () => {
  it("un éxito en closed resetea failures (no acumula entre sesiones)", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 3 });

    // 2 fallas
    await cb.execute(fail).catch(() => {});
    await cb.execute(fail).catch(() => {});
    expect(cb.getState()).toBe("closed");

    // 1 éxito — debe resetear el contador
    await cb.execute(succeed);

    // 2 fallas más (total acumulado sería 4, pero reseteado → solo 2)
    await cb.execute(fail).catch(() => {});
    await cb.execute(fail).catch(() => {});
    expect(cb.getState()).toBe("closed"); // no debería haberse abierto
  });
});
