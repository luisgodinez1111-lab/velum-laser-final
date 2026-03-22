import cron from "node-cron";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";

const DONE_MAX_DAYS = 7;
const FAILED_MAX_DAYS = 14;
const WEBHOOK_EVENT_MAX_DAYS = 30;

export const pruneOldIntegrationJobs = async (): Promise<void> => {
  const sevenDaysAgo  = new Date(Date.now() - DONE_MAX_DAYS   * 86400000);
  const thirtyDaysAgo = new Date(Date.now() - FAILED_MAX_DAYS * 86400000);

  try {
    const [done, failed] = await Promise.all([
      prisma.integrationJob.deleteMany({
        where: { status: "done", finishedAt: { lte: sevenDaysAgo } }
      }),
      prisma.integrationJob.deleteMany({
        where: { status: "failed", createdAt: { lte: thirtyDaysAgo } }
      })
    ]);

    if (done.count + failed.count > 0) {
      logger.info(
        { done: done.count, failed: failed.count },
        "[integration-cleanup] Pruned old integration jobs"
      );
    }
  } catch (err) {
    logger.error({ err }, "[integration-cleanup] Failed to prune jobs");
  }
};

export const pruneOldWebhookEvents = async (): Promise<void> => {
  const cutoff = new Date(Date.now() - WEBHOOK_EVENT_MAX_DAYS * 86400000);
  try {
    const { count } = await prisma.webhookEvent.deleteMany({
      where: { processedAt: { lte: cutoff } },
    });
    if (count > 0) {
      logger.info({ count }, "[webhook-cleanup] Pruned old WebhookEvent records");
    }
  } catch (err) {
    logger.error({ err }, "[webhook-cleanup] Failed to prune WebhookEvent records");
  }
};

const runWithRetry = (fn: () => Promise<void>, jobName: string): void => {
  fn().catch((err) => {
    logger.error({ err }, `[${jobName}] Error en primera ejecución — reintentando en 5s`);
    setTimeout(() => {
      fn().catch((retryErr) => {
        logger.error({ err: retryErr }, `[${jobName}] Error en retry`);
      });
    }, 5000);
  });
};

export const startIntegrationJobCleanupCron = (): void => {
  // Runs every day at 03:00 AM Mexico City time
  cron.schedule("0 3 * * *", () => {
    runWithRetry(pruneOldIntegrationJobs, "integration-cleanup");
    runWithRetry(pruneOldWebhookEvents, "webhook-cleanup");
  }, { timezone: "America/Mexico_City" });

  // Run once on startup to clear existing backlog
  runWithRetry(pruneOldIntegrationJobs, "integration-cleanup");
  runWithRetry(pruneOldWebhookEvents, "webhook-cleanup");

  logger.info("[integration-cleanup] Cron scheduled — daily at 03:00 AM (jobs + webhook events)");
};
