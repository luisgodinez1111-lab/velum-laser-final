/**
 * Tests del Outbox Dispatcher (Fase 1.2.b).
 *
 * Estrategia: mock del PrismaClient — testeamos lógica del dispatcher
 * (despacho, backoff, marca dead, handler timeout, idempotencia de evento
 * sin handler) sin tocar Postgres real. La integración real con SKIP LOCKED
 * vive en un test E2E aparte.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  processBatch,
  registerOutboxHandler,
  type OutboxEventRow,
} from "../src/workers/outboxDispatcher";

// Helper para crear un mock que simule un transaction client.
function makeFakePrisma(rows: OutboxEventRow[]) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(rows),
    outboxEvent: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: where.id, data });
        return { id: where.id, ...data };
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: typeof tx) => Promise<number>) => fn(tx)),
  };
  return { prisma: prisma as never, tx, updates };
}

const baseEvent: OutboxEventRow = {
  id: "evt_1",
  tenantId: "default",
  eventType: "test.dispatch",
  aggregateType: "Test",
  aggregateId: "agg_1",
  payload: { foo: "bar" },
  attempts: 0,
  maxAttempts: 3,
  createdAt: new Date(),
};

describe("outbox dispatcher", () => {
  beforeEach(() => {
    // Limpiar handlers entre tests para no filtrar registros previos.
    // (registerOutboxHandler no expone unregister; usamos un eventType único por test).
  });

  it("despacha evento exitoso → status='done'", async () => {
    const eventType = "test.success_" + Math.random();
    const handler = vi.fn().mockResolvedValue(undefined);
    registerOutboxHandler(eventType, handler);

    const { prisma, updates } = makeFakePrisma([{ ...baseEvent, eventType }]);
    const processed = await processBatch({ prisma });

    expect(processed).toBe(1);
    expect(handler).toHaveBeenCalledOnce();
    // Update 1 = 'processing', update 2 = 'done'
    expect(updates).toHaveLength(2);
    expect(updates[1].data).toMatchObject({ status: "done", lastError: null });
  });

  it("evento sin handler registrado → done con warn (no bloquea cola)", async () => {
    const { prisma, updates } = makeFakePrisma([{ ...baseEvent, eventType: "no.handler.registered.xyz" }]);
    const processed = await processBatch({ prisma });

    expect(processed).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].data).toMatchObject({ status: "done", lastError: "no handler registered" });
  });

  it("handler que falla → attempts++, status='failed', backoff programado", async () => {
    const eventType = "test.fail_" + Math.random();
    registerOutboxHandler(eventType, async () => { throw new Error("boom"); });

    const { prisma, updates } = makeFakePrisma([{ ...baseEvent, eventType, attempts: 0, maxAttempts: 3 }]);
    await processBatch({ prisma });

    // Update 1 = 'processing'; update 2 = 'failed' con attempts=1.
    expect(updates).toHaveLength(2);
    expect(updates[1].data).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: expect.stringContaining("boom"),
    });
    expect(updates[1].data.availableAt).toBeInstanceOf(Date);
  });

  it("handler que falla con attempts == maxAttempts-1 → status='dead'", async () => {
    const eventType = "test.dead_" + Math.random();
    registerOutboxHandler(eventType, async () => { throw new Error("permanent"); });

    const { prisma, updates } = makeFakePrisma([{ ...baseEvent, eventType, attempts: 2, maxAttempts: 3 }]);
    await processBatch({ prisma });

    expect(updates[1].data).toMatchObject({ status: "dead", attempts: 3 });
    // Dead events no llevan availableAt nuevo — no se reintentan más.
    expect(updates[1].data.availableAt).toBeUndefined();
  });

  it("registerOutboxHandler dup → throw", () => {
    const eventType = "test.dup_" + Math.random();
    registerOutboxHandler(eventType, async () => {});
    expect(() => registerOutboxHandler(eventType, async () => {})).toThrow(/ya registrado/);
  });

  it("processBatch sin filas → 0 sin invocar handlers", async () => {
    const { prisma } = makeFakePrisma([]);
    const processed = await processBatch({ prisma });
    expect(processed).toBe(0);
  });

  it("handler con timeout → marca failed con error de timeout", async () => {
    const eventType = "test.timeout_" + Math.random();
    registerOutboxHandler(eventType, () => new Promise((resolve) => setTimeout(resolve, 1000)));

    const { prisma, updates } = makeFakePrisma([{ ...baseEvent, eventType }]);
    await processBatch({ prisma, handlerTimeoutMs: 50 });

    expect(updates[1].data).toMatchObject({ status: "failed" });
    expect(updates[1].data.lastError).toMatch(/timeout/);
  });
});
