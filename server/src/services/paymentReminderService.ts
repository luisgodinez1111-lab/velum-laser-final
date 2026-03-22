import cron from "node-cron";
import { prisma } from "../db/prisma";
import { sendPaymentReminderEmail } from "./emailService";
import { readStripePlanCatalog } from "./stripePlanCatalogService";
import { sendWhatsappPaymentReminder } from "./whatsappMetaService";
import { logger } from "../utils/logger";

// Days before renewal to send reminders
const REMINDER_DAYS = [3, 1];
const LOCK_KEY = "payment_reminder_lock";
const LOCK_TTL_MINUTES = 30;

const formatDate = (d: Date): string =>
  d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const formatMoney = (amount: number): string =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);

// ── Distributed lock via AppSetting ──────────────────────────────────────────
// Prevents duplicate sends when multiple API instances run simultaneously.
async function acquireLock(): Promise<boolean> {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() + LOCK_TTL_MINUTES * 60 * 1000);

  // Check if lock exists and is still valid
  const existing = await prisma.appSetting.findUnique({ where: { key: LOCK_KEY } });
  if (existing) {
    const lockData = existing.value as { lockedAt: string; expiresAt: string };
    if (new Date(lockData.expiresAt) > now) {
      return false; // Lock held by another instance
    }
  }

  // Attempt to acquire lock with upsert
  try {
    await prisma.appSetting.upsert({
      where: { key: LOCK_KEY },
      create: { key: LOCK_KEY, value: { lockedAt: now.toISOString(), expiresAt: lockExpiry.toISOString() } },
      update: { value: { lockedAt: now.toISOString(), expiresAt: lockExpiry.toISOString() } },
    });
    return true;
  } catch {
    return false;
  }
}

async function releaseLock(): Promise<void> {
  await prisma.appSetting.delete({ where: { key: LOCK_KEY } }).catch(() => {});
}

export const runPaymentReminders = async (): Promise<void> => {
  const locked = await acquireLock();
  if (!locked) {
    logger.info("[payment-reminder] Lock held by another instance — skipping");
    return;
  }

  try {
    const now = new Date();
    const catalog = await readStripePlanCatalog().catch(() => []);

    for (const daysLeft of REMINDER_DAYS) {
      const windowStart = new Date(now);
      windowStart.setDate(windowStart.getDate() + daysLeft);
      windowStart.setHours(0, 0, 0, 0);

      const windowEnd = new Date(windowStart);
      windowEnd.setHours(23, 59, 59, 999);

      const cutoff = new Date(now.getTime() - 20 * 60 * 60 * 1000);

      const memberships = await prisma.membership.findMany({
        where: {
          status: "active",
          currentPeriodEnd: { gte: windowStart, lte: windowEnd },
          OR: [
            { lastReminderSentAt: null },
            { lastReminderSentAt: { lt: cutoff } },
          ],
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { firstName: true, lastName: true, phone: true } },
            },
          },
        },
      });

      for (const ms of memberships) {
        try {
          const firstName = ms.user.profile?.firstName ?? "";
          const lastName  = ms.user.profile?.lastName  ?? "";
          const name      = `${firstName} ${lastName}`.trim() || ms.user.email;

          const planCode = (ms.planId ?? "").toLowerCase();
          const catalogEntry = catalog.find(
            (p) => p.planCode === planCode || p.stripePriceId === ms.planId
          );
          const planName = catalogEntry?.name ?? planCode ?? "Velum Laser";
          const amount   = catalogEntry?.amount
            ? formatMoney(catalogEntry.amount)
            : "Tu plan mensual";

          const renewalDate = ms.currentPeriodEnd ? formatDate(ms.currentPeriodEnd) : "próximamente";

          await sendPaymentReminderEmail(ms.user.email, {
            name,
            planName,
            amount,
            renewalDate,
            daysLeft,
          });

          const phone = ms.user.profile?.phone;
          if (phone) {
            try {
              await sendWhatsappPaymentReminder(phone, { name, amount, renewalDate, daysLeft });
              logger.info({ email: ms.user.email, daysLeft }, "[payment-reminder] WhatsApp reminder sent");
            } catch (waErr) {
              logger.warn({ err: waErr, email: ms.user.email }, "[payment-reminder] WhatsApp reminder failed (non-fatal)");
            }
          }

          await prisma.membership.update({
            where: { id: ms.id },
            data: { lastReminderSentAt: now },
          });

          logger.info({ email: ms.user.email, daysLeft }, "[payment-reminder] Reminder sent");
        } catch (err: unknown) {
          logger.error({ err, email: ms.user.email }, "[payment-reminder] Failed to send reminder");
        }
      }
    }
  } catch (err: unknown) {
    logger.error({ err }, "[payment-reminder] Cron run error");
  } finally {
    await releaseLock();
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

export const startPaymentReminderCron = (): void => {
  // "0 9 * * *" with timezone: fires at 09:00 AM Mexico City time (node-cron interprets in given timezone)
  cron.schedule("0 9 * * *", () => {
    runWithRetry(runPaymentReminders, "payment-reminder");
  }, { timezone: "America/Mexico_City" });

  logger.info("[payment-reminder] Cron scheduled — daily at 09:00 AM Mexico City time");
};
