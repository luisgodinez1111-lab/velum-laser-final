import cron from "node-cron";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { sendAdminNotificationEmail } from "./notificationEmailService";

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

export const pruneExpiredRefreshTokens = async (): Promise<void> => {
  try {
    const { count } = await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) {
      logger.info({ count }, "[refresh-cleanup] Pruned expired RefreshTokens");
    }
  } catch (err) {
    logger.error({ err }, "[refresh-cleanup] Failed to prune RefreshTokens");
  }
};

export const expireCustomCharges = async (): Promise<void> => {
  try {
    const { count } = await prisma.customCharge.updateMany({
      where: { status: "PENDING_ACCEPTANCE", expiresAt: { lt: new Date() } },
      data: { status: "EXPIRED" },
    });
    if (count > 0) {
      logger.info({ count }, "[charge-cleanup] Marked expired CustomCharges as EXPIRED");
    }
  } catch (err) {
    logger.error({ err }, "[charge-cleanup] Failed to expire CustomCharges");
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

// ── WhatsApp token expiry warning ─────────────────────────────────────────────
// Meta WhatsApp tokens expire ~60 days after generation.
// This check warns the admin at 10 and 5 days before expiry.
export const checkWhatsappTokenExpiry = async (): Promise<void> => {
  const WARNING_DAYS = [10, 5];
  try {
    const rows = await prisma.$queryRaw<Array<{ updatedAt: Date }>>`
      SELECT "updatedAt" FROM "AppSetting" WHERE "key" = 'whatsapp_meta_config' LIMIT 1
    `;
    if (!rows?.length) return;

    const configuredAt = rows[0].updatedAt;
    const ageMs = Date.now() - configuredAt.getTime();
    const ageDays = Math.floor(ageMs / 86_400_000);
    const daysUntilExpiry = 60 - ageDays;

    if (WARNING_DAYS.includes(daysUntilExpiry)) {
      logger.warn({ daysUntilExpiry }, "[whatsapp-check] Token de WhatsApp próximo a expirar");
      await sendAdminNotificationEmail({
        subject: `Token de WhatsApp expira en ${daysUntilExpiry} día${daysUntilExpiry === 1 ? "" : "s"}`,
        title: `⚠️ Token de WhatsApp — Renovación requerida`,
        body: `El token de acceso de WhatsApp Cloud API fue configurado hace ${ageDays} días.
Los tokens de Meta expiran a los 60 días. Quedan aproximadamente ${daysUntilExpiry} día${daysUntilExpiry === 1 ? "" : "s"} para la expiración.
<br><br>
Renueva el token en el panel de admin: <strong>Ajustes → WhatsApp</strong>.`,
      }).catch((err) => logger.error({ err }, "[whatsapp-check] No se pudo enviar alerta de expiración"));
    } else if (daysUntilExpiry <= 0) {
      logger.error({ ageDays }, "[whatsapp-check] Token de WhatsApp posiblemente expirado");
    }
  } catch (err) {
    logger.warn({ err }, "[whatsapp-check] No se pudo verificar expiración del token (SystemSetting puede no existir)");
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
    runWithRetry(expireCustomCharges, "charge-cleanup");
    runWithRetry(pruneExpiredRefreshTokens, "refresh-cleanup");
    runWithRetry(checkWhatsappTokenExpiry, "whatsapp-token-check");
  }, { timezone: "America/Mexico_City" });

  // Run once on startup to clear existing backlog
  runWithRetry(pruneOldIntegrationJobs, "integration-cleanup");
  runWithRetry(pruneOldWebhookEvents, "webhook-cleanup");
  runWithRetry(expireCustomCharges, "charge-cleanup");
  runWithRetry(pruneExpiredRefreshTokens, "refresh-cleanup");

  logger.info("[integration-cleanup] Cron scheduled — daily at 03:00 AM (jobs + webhook events + charge expiry)");
};
