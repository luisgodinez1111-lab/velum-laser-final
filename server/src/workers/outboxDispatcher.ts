import type { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { runWithTenant } from "../utils/tenantContext";
import { captureException } from "../utils/sentry";

/**
 * Outbox Dispatcher (Fase 1.2.b).
 *
 * Despacho: `SELECT ... FOR UPDATE SKIP LOCKED` — patrón canónico de queue
 * Postgres. Múltiples workers pueden correr en paralelo sin coordinación
 * externa: cada uno toma un batch que ningún otro tiene.
 *
 * Backoff exponencial:
 *   attempt 1 fallido → reintentar en  30s
 *   attempt 2 fallido → reintentar en   1m
 *   attempt 3 fallido → reintentar en   5m
 *   attempt 4 fallido → reintentar en  30m
 *   attempt 5 fallido → reintentar en   2h
 *   attempt 6+ fallido → reintentar en  6h (cap)
 *   attempt > maxAttempts → status='dead' (no se reintenta más, alertar)
 */

export type OutboxEventRow = {
  id: string;
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
};

export type OutboxHandler = (
  event: OutboxEventRow,
  tx: Prisma.TransactionClient,
) => Promise<void>;

const handlers = new Map<string, OutboxHandler>();

/**
 * Registra un handler para un eventType. Llamar al inicio del worker antes
 * de iniciar el loop. Si llega un evento sin handler registrado, se loguea
 * warn y se marca 'done' (no bloquea la cola). Esto permite añadir nuevos
 * tipos de evento sin desplegar el worker antes que los emisores.
 */
export function registerOutboxHandler(eventType: string, handler: OutboxHandler): void {
  if (handlers.has(eventType)) {
    throw new Error(`Outbox handler ya registrado para ${eventType}`);
  }
  handlers.set(eventType, handler);
}

const BACKOFF_SCHEDULE_SECONDS = [30, 60, 300, 1800, 7200, 21600]; // 30s, 1m, 5m, 30m, 2h, 6h

function nextRetryDelaySeconds(attempts: number): number {
  const idx = Math.min(attempts - 1, BACKOFF_SCHEDULE_SECONDS.length - 1);
  return BACKOFF_SCHEDULE_SECONDS[Math.max(0, idx)];
}

export interface DispatcherOptions {
  prisma: PrismaClient;
  /** Filas a tomar por iteración. Default 50. */
  batchSize?: number;
  /** Espera entre iteraciones cuando NO hay trabajo. Default 2s. */
  idleSleepMs?: number;
  /** Timeout por handler. Default 30s — un handler que cuelga no debe bloquear el worker. */
  handlerTimeoutMs?: number;
}

/**
 * Procesa un único batch. Devuelve número de filas procesadas.
 * Diseñado para ser llamado desde un loop o desde tests aislados.
 */
export async function processBatch(opts: DispatcherOptions): Promise<number> {
  const batchSize = opts.batchSize ?? 50;
  const handlerTimeoutMs = opts.handlerTimeoutMs ?? 30_000;

  // SKIP LOCKED requiere SQL raw — Prisma no lo expone vía findMany().
  // La transacción comenzada aquí ABRE el lock; cada UPDATE lo libera al COMMIT.
  return opts.prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxEventRow[]>`
      SELECT id, "tenantId", "eventType", "aggregateType", "aggregateId",
             payload, attempts, "maxAttempts", "createdAt"
      FROM "OutboxEvent"
      WHERE status IN ('pending', 'failed')
        AND "availableAt" <= NOW()
      ORDER BY "availableAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `;

    if (rows.length === 0) return 0;

    for (const row of rows) {
      await dispatchOne(row, tx, handlerTimeoutMs);
    }
    return rows.length;
  });
}

async function dispatchOne(
  event: OutboxEventRow,
  tx: Prisma.TransactionClient,
  handlerTimeoutMs: number,
): Promise<void> {
  const handler = handlers.get(event.eventType);

  // Sin handler: marcar 'done' con un warn — no bloquea la cola.
  if (!handler) {
    logger.warn(
      { eventType: event.eventType, eventId: event.id, tenantId: event.tenantId },
      "[outbox] handler no registrado — evento descartado como done",
    );
    await tx.outboxEvent.update({
      where: { id: event.id },
      data: { status: "done", processedAt: new Date(), lastError: "no handler registered" },
    });
    return;
  }

  // Marcar 'processing' antes de invocar — defensa visible para introspección.
  await tx.outboxEvent.update({
    where: { id: event.id },
    data: { status: "processing", lockedUntil: new Date(Date.now() + handlerTimeoutMs) },
  });

  // Ejecutar handler con tenant context (RLS-aware) y timeout duro.
  try {
    await runWithTenant(
      { tenantId: event.tenantId, source: "system" },
      () => withTimeout(handler(event, tx), handlerTimeoutMs, event.eventType),
    );

    await tx.outboxEvent.update({
      where: { id: event.id },
      data: { status: "done", processedAt: new Date(), lastError: null },
    });
    logger.debug(
      { eventType: event.eventType, eventId: event.id, tenantId: event.tenantId },
      "[outbox] dispatched",
    );
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const newAttempts = event.attempts + 1;
    const isDead = newAttempts >= event.maxAttempts;
    const nextDelaySec = nextRetryDelaySeconds(newAttempts);

    await tx.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: isDead ? "dead" : "failed",
        attempts: newAttempts,
        lastError: error.message.slice(0, 1000),
        availableAt: isDead ? undefined : new Date(Date.now() + nextDelaySec * 1000),
        lockedUntil: null,
      },
    });

    if (isDead) {
      logger.error(
        { err: error, eventType: event.eventType, eventId: event.id, tenantId: event.tenantId, attempts: newAttempts },
        "[outbox] DEAD — sin reintentos restantes",
      );
      captureException(error, {
        outbox_event_id: event.id,
        outbox_event_type: event.eventType,
        outbox_tenant_id: event.tenantId,
        outbox_attempts: newAttempts,
      });
    } else {
      logger.warn(
        { err: error, eventType: event.eventType, eventId: event.id, tenantId: event.tenantId, attempts: newAttempts, retryInSec: nextDelaySec },
        "[outbox] handler falló — reintento programado",
      );
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Outbox handler "${label}" superó timeout de ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Run loop. Llama processBatch repetidamente hasta que stopSignal resuelva. */
export async function runDispatcher(opts: DispatcherOptions, stopSignal: Promise<void>): Promise<void> {
  const idleSleepMs = opts.idleSleepMs ?? 2000;
  let stopped = false;
  stopSignal.then(() => { stopped = true; });

  logger.info({ batchSize: opts.batchSize ?? 50, idleSleepMs }, "[outbox] dispatcher started");

  while (!stopped) {
    try {
      const processed = await processBatch(opts);
      if (processed === 0) {
        await sleep(idleSleepMs, () => stopped);
      }
      // Si processed > 0, loopeamos inmediato — puede haber más trabajo.
    } catch (err) {
      // Errores aquí son del query del batch, no del handler. Loguear y backoff.
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error({ err: error }, "[outbox] batch failure — pausando antes de reintentar");
      captureException(error);
      await sleep(idleSleepMs * 5, () => stopped);
    }
  }

  logger.info("[outbox] dispatcher stopped");
}

function sleep(ms: number, stopCheck: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (stopCheck() || Date.now() - start >= ms) return resolve();
      setTimeout(tick, Math.min(200, ms));
    };
    tick();
  });
}
