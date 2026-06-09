/**
 * VELUM Worker — process separado del API que despacha eventos del Outbox.
 *
 * Por qué un proceso separado:
 *   - El API es stateless y escala horizontalmente. Si los crons/workers
 *     viven dentro, escalar el API ejecuta el mismo cron N veces.
 *   - Un handler que cuelga un consumer externo (email, GCal) no debe
 *     degradar la latencia de los requests de usuario.
 *   - Permite monitorear y escalar workers independientemente.
 *
 * Coordinación entre múltiples workers: SELECT ... FOR UPDATE SKIP LOCKED
 * en outboxDispatcher.ts. Cada worker toma filas que ningún otro tiene.
 *
 * Shutdown: SIGTERM/SIGINT cierran el loop limpiamente, esperando que el
 * batch en curso termine antes de salir. Docker compose espera 10s antes
 * de SIGKILL — suficiente para drainear un batch típico.
 */

// Telemetry primero — antes de cualquier import a instrumentar.
import { initTelemetry } from "./utils/telemetry";
initTelemetry();
import { initSentry } from "./utils/sentry";
initSentry();

import { prisma } from "./db/prisma";
import { logger } from "./utils/logger";
import { startWorkerTasks } from "./workers/startWorkerTasks";

async function main(): Promise<void> {
  logger.info({ pid: process.pid, node: process.version }, "[worker] booting");

  // Verifica conectividad DB antes de empezar a polear.
  await prisma.$queryRaw`SELECT 1`;
  logger.info("[worker] DB reachable");

  // Promise que resuelve en shutdown.
  let triggerStop: (() => void) | null = null;
  const stopSignal = new Promise<void>((resolve) => { triggerStop = resolve; });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "[worker] shutdown initiated");
    triggerStop?.();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Health endpoint mínimo si OUTBOX_HEALTH_PORT está seteado — útil para
  // que docker compose/k8s puedan saber si el worker sigue vivo.
  const healthPort = Number(process.env.OUTBOX_HEALTH_PORT ?? 0);
  if (healthPort > 0) {
    const { createServer } = await import("node:http");
    const server = createServer(async (req, res) => {
      if (req.url === "/health") {
        try {
          await prisma.$queryRaw`SELECT 1`;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, service: "worker" }));
        } catch {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, service: "worker" }));
        }
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(healthPort, () => {
      logger.info({ port: healthPort }, "[worker] health endpoint ready");
    });
    stopSignal.then(() => server.close());
  }

  // Outbox dispatcher + crons + integration worker. Fuente única en
  // startWorkerTasks, compartida con el modo inline del API (RUN_WORKER_INLINE).
  // Bloquea hasta que stopSignal resuelva (shutdown) y drene el batch en curso.
  await startWorkerTasks(stopSignal);

  await prisma.$disconnect();
  logger.info("[worker] exited cleanly");
  process.exit(0);
}

main().catch((err) => {
  logger.fatal({ err }, "[worker] fatal — saliendo");
  process.exit(1);
});
