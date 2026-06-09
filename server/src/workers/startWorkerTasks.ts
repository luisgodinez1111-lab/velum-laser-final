import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { env } from "../utils/env";
import { runDispatcher } from "./outboxDispatcher";
import { registerAllOutboxHandlers } from "./outboxHandlers";
import { startPaymentReminderCron } from "../services/paymentReminderService";
import { startAppointmentReminderCron } from "../services/appointmentReminderService";
import { startIntegrationJobCleanupCron } from "../services/integrationJobCleanupService";
import { startIntegrationWorker, stopIntegrationWorker } from "../services/integrationWorker";
import { renewRecurringCharges } from "../services/customChargeService";

/**
 * Arranca TODAS las tareas de background: outbox dispatcher + crons +
 * integration worker. Es la única fuente de verdad, reutilizada por:
 *
 *   - worker.ts             → proceso dedicado (deploy con 2 procesos, ideal)
 *   - index.ts (inline)     → cuando RUN_WORKER_INLINE=true (deploy $0, 1 proceso)
 *
 * En inline NO se debe `await` esta función desde el flujo de arranque del API:
 * `runDispatcher` corre en un loop hasta que `stopSignal` resuelve. Llamarla
 * fire-and-forget y dejar que el dispatcher viva en background.
 *
 * `stopSignal` resuelve en shutdown → el dispatcher draina el batch en curso,
 * se limpia el timer de recurring charges y se detiene el integration worker.
 * La promesa resuelve cuando el dispatcher terminó de drenar.
 */
export async function startWorkerTasks(stopSignal: Promise<void>): Promise<void> {
  // Registrar todos los handlers conocidos. Si un nuevo evento llega sin
  // handler, el dispatcher lo marca 'done' con warn — no bloquea la cola.
  registerAllOutboxHandlers();

  // ── Crons ──────────────────────────────────────────────────────────
  startPaymentReminderCron();
  startAppointmentReminderCron();
  startIntegrationJobCleanupCron();

  // Recurring charge renewal — corría en setInterval del API original.
  const recurringTimer = setInterval(() => {
    renewRecurringCharges()
      .then((n) => { if (n > 0) logger.info({ renewed: n }, "[recurring-charges] renewed"); })
      .catch((err) => logger.error({ err }, "[recurring-charges] cron error"));
  }, env.recurringChargeRenewMs);
  recurringTimer.unref();

  // Integration worker — poller del IntegrationJob queue.
  await startIntegrationWorker().catch((err) => {
    logger.error({ err }, "[worker-tasks] failed to start integration worker");
  });

  // Limpieza en shutdown: node-cron no expone shutdown global y sus timers
  // están desreferenciados (.unref()), así que no bloquean. El recurringTimer
  // y el integrationWorker sí requieren stop explícito.
  void stopSignal.then(() => {
    clearInterval(recurringTimer);
    stopIntegrationWorker();
  });

  // Bloquea hasta shutdown: drena el outbox con SELECT ... FOR UPDATE SKIP LOCKED.
  await runDispatcher(
    {
      prisma,
      batchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? 50),
      idleSleepMs: Number(process.env.OUTBOX_IDLE_SLEEP_MS ?? 2000),
      handlerTimeoutMs: Number(process.env.OUTBOX_HANDLER_TIMEOUT_MS ?? 30_000),
    },
    stopSignal,
  );
}
