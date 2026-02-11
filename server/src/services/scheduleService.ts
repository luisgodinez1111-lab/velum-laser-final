import { prisma } from "../db/prisma";

export const getScheduleConfigs = () =>
  prisma.scheduleConfig.findMany({ orderBy: { dayOfWeek: "asc" } });

export const bulkUpsertSchedule = async (
  items: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    slotDurationMin: number;
    maxSlots: number;
    isActive: boolean;
  }[]
) => {
  const ops = items.map((item) =>
    prisma.scheduleConfig.upsert({
      where: { dayOfWeek: item.dayOfWeek },
      update: item,
      create: item
    })
  );
  return prisma.$transaction(ops);
};

export const getBlockedDates = (from?: Date, to?: Date) =>
  prisma.blockedDate.findMany({
    where: from && to ? { date: { gte: from, lte: to } } : undefined,
    orderBy: { date: "asc" }
  });

export const createBlockedDate = (date: Date, reason?: string) =>
  prisma.blockedDate.create({ data: { date, reason } });

export const deleteBlockedDate = (id: string) =>
  prisma.blockedDate.delete({ where: { id } });

/**
 * Calculate available time slots for a given date.
 * 1. Look up the ScheduleConfig for that day of week
 * 2. If inactive or date is blocked, return empty
 * 3. Generate slots from startTime to endTime
 * 4. Remove slots already booked
 */
export const getAvailableSlots = async (date: Date) => {
  const dayOfWeek = date.getDay(); // 0-6

  const config = await prisma.scheduleConfig.findUnique({
    where: { dayOfWeek }
  });

  if (!config || !config.isActive) return [];

  // Check if date is blocked
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const blocked = await prisma.blockedDate.findFirst({
    where: { date: { gte: startOfDay, lte: endOfDay } }
  });
  if (blocked) return [];

  // Generate all possible slots
  const [startH, startM] = config.startTime.split(":").map(Number);
  const [endH, endM] = config.endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  const slots: { time: string; available: boolean }[] = [];
  for (let m = startMinutes; m + config.slotDurationMin <= endMinutes; m += config.slotDurationMin) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    slots.push({ time, available: true });
  }

  // Get existing appointments for this date (not canceled)
  const existingAppointments = await prisma.appointment.findMany({
    where: {
      scheduledAt: { gte: startOfDay, lte: endOfDay },
      status: { notIn: ["canceled"] }
    }
  });

  // Count appointments per slot and check against maxSlots
  for (const slot of slots) {
    const [sh, sm] = slot.time.split(":").map(Number);
    const slotStart = new Date(date);
    slotStart.setHours(sh, sm, 0, 0);

    const count = existingAppointments.filter((appt) => {
      const apptH = appt.scheduledAt.getHours();
      const apptM = appt.scheduledAt.getMinutes();
      return apptH === sh && apptM === sm;
    }).length;

    if (count >= config.maxSlots) {
      slot.available = false;
    }
  }

  return slots;
};
