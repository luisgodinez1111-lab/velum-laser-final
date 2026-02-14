import { prisma } from "../db/prisma.js";
import { notify } from "./notificationService.js";

/**
 * Finds appointments within the next N hours and sends reminders.
 * Designed to be called by a cron job or scheduled task.
 */
export const reminderService = {
  async sendUpcomingReminders(hoursAhead = 24) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const appointments = await prisma.appointment.findMany({
      where: {
        scheduledAt: { gte: now, lte: cutoff },
        status: { in: ["pending", "confirmed"] },
      },
      include: {
        user: { include: { profile: true } },
        staff: { include: { profile: true } },
      },
    });

    const results = [];
    for (const appt of appointments) {
      // Check if we already sent a reminder for this appointment
      const existing = await prisma.notification.findFirst({
        where: {
          userId: appt.userId,
          metadata: { path: ["appointmentId"], equals: appt.id },
          title: { contains: "Recordatorio" },
        },
      });

      if (existing) continue;

      const date = new Date(appt.scheduledAt);
      const dateStr = date.toLocaleDateString("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const timeStr = date.toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const typeLabel =
        appt.type === "valuation"
          ? "Valoración"
          : appt.type === "treatment"
            ? "Tratamiento"
            : "Seguimiento";

      await notify({
        userId: appt.userId,
        type: "in_app",
        title: `Recordatorio: Cita de ${typeLabel}`,
        body: `Tu cita de ${typeLabel.toLowerCase()} es el ${dateStr} a las ${timeStr}. ¡Te esperamos!`,
        metadata: { appointmentId: appt.id },
      });

      results.push({ appointmentId: appt.id, userId: appt.userId });
    }

    return { sent: results.length, appointments: results };
  },

  async sendNoShowFollowUp() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dayBefore = new Date();
    dayBefore.setDate(dayBefore.getDate() - 2);

    const noShows = await prisma.appointment.findMany({
      where: {
        status: "no_show",
        scheduledAt: { gte: dayBefore, lte: yesterday },
      },
    });

    const results = [];
    for (const appt of noShows) {
      await notify({
        userId: appt.userId,
        type: "in_app",
        title: "Cita perdida",
        body: "Notamos que no pudiste asistir a tu última cita. Puedes reagendar desde tu panel.",
        metadata: { appointmentId: appt.id },
      });
      results.push(appt.id);
    }

    return { sent: results.length };
  },
};
