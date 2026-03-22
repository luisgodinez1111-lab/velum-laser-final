import cron from "node-cron";
import { prisma } from "../db/prisma";
import { sendAppointmentReminderEmail } from "./emailService";
import { sendWhatsappAppointmentReminder } from "./whatsappMetaService";
import { logger } from "../utils/logger";

const LOCK_KEY = "appointment_reminder_lock";
const LOCK_TTL_MINUTES = 30;
const TIMEZONE = "America/Mexico_City";

// ── Distributed lock via AppSetting ──────────────────────────────────────────
async function acquireLock(): Promise<boolean> {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() + LOCK_TTL_MINUTES * 60 * 1000);

  const existing = await prisma.appSetting.findUnique({ where: { key: LOCK_KEY } });
  if (existing) {
    const lockData = existing.value as { expiresAt: string };
    if (new Date(lockData.expiresAt) > now) return false;
  }

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

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: TIMEZONE,
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: TIMEZONE,
  });
}

export const runAppointmentReminders = async (): Promise<void> => {
  const locked = await acquireLock();
  if (!locked) {
    logger.info("[appointment-reminder] Lock held by another instance — skipping");
    return;
  }

  try {
    const now = new Date();

    // Window: appointments starting between 20h and 28h from now (catches ~24h ahead)
    const windowStart = new Date(now.getTime() + 20 * 60 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + 28 * 60 * 60 * 1000);

    const appointments = await prisma.appointment.findMany({
      where: {
        startAt: { gte: windowStart, lte: windowEnd },
        status: { in: ["scheduled", "confirmed"] },
        reminderSentAt: null,
      },
      include: {
        user: {
          select: {
            email: true,
            profile: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
        treatment: { select: { name: true } },
        cabin:     { select: { name: true } },
      },
    });

    logger.info({ count: appointments.length }, "[appointment-reminder] Appointments to remind");

    for (const appt of appointments) {
      try {
        const firstName = appt.user.profile?.firstName ?? "";
        const lastName  = appt.user.profile?.lastName  ?? "";
        const name      = `${firstName} ${lastName}`.trim() || appt.user.email;

        const date = formatDate(appt.startAt);
        const time = formatTime(appt.startAt);

        await sendAppointmentReminderEmail(appt.user.email, {
          name,
          date,
          time,
          treatment: appt.treatment?.name,
          cabin:     appt.cabin?.name,
        });

        // WhatsApp reminder — only if phone is available and template is configured
        const phone = appt.user.profile?.phone;
        if (phone) {
          await sendWhatsappAppointmentReminder(phone, {
            name,
            date,
            time,
            treatment: appt.treatment?.name,
          }).catch((err) =>
            logger.warn({ err, appointmentId: appt.id }, "[appointment-reminder] WhatsApp send failed (non-critical)")
          );
        }

        await prisma.appointment.update({
          where: { id: appt.id },
          data:  { reminderSentAt: now },
        });

        logger.info({ email: appt.user.email, appointmentId: appt.id }, "[appointment-reminder] Reminder sent");
      } catch (err) {
        logger.error({ err, appointmentId: appt.id }, "[appointment-reminder] Failed to send reminder");
      }
    }
  } catch (err) {
    logger.error({ err }, "[appointment-reminder] Cron run error");
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

export const startAppointmentReminderCron = (): void => {
  // Fires at 08:00 AM Chihuahua time — catches appointments for the following day
  cron.schedule("0 8 * * *", () => {
    runWithRetry(runAppointmentReminders, "appointment-reminder");
  }, { timezone: TIMEZONE });

  logger.info("[appointment-reminder] Cron scheduled — daily at 08:00 AM Mexico City time");
};
