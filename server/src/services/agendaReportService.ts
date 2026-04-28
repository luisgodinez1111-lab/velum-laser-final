import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { toZonedParts, normalizeDateKey } from "./agendaTimezoneUtils";
import { getEffectiveRule, buildAgendaSlots, cabinProductivityReport } from "./agendaAvailabilityService";
import { getAgendaConfig } from "./agendaConfigService";
import { ensureAgendaDefaults } from "./agendaSetupService";
import { syncAppointmentWorkflow } from "./agendaSyncService";

export const getAgendaDaySnapshot = async (dateKeyRaw: string) => {
  await ensureAgendaDefaults();
  await syncAppointmentWorkflow();

  const dateKey = normalizeDateKey(dateKeyRaw);
  const config = await getAgendaConfig();
  const { policy } = config;

  const [blocks, appointments] = await Promise.all([
    prisma.agendaBlockedSlot.findMany({
      where: { dateKey },
      orderBy: [{ startMinute: "asc" }, { cabinId: "asc" }]
    }),
    withTenantContext(async (tx) => tx.appointment.findMany({
      where: {
        startAt: {
          gte: new Date(new Date(dateKey + "T00:00:00Z").getTime() - 2 * 86400000),
          lte: new Date(new Date(dateKey + "T00:00:00Z").getTime() + 3 * 86400000)
        }
      },
      orderBy: { startAt: "asc" },
      include: {
        user: {
          select: { id: true, email: true }
        },
        createdBy: {
          select: { id: true, email: true, role: true }
        },
        cabin: {
          select: { id: true, name: true }
        },
        treatment: {
          select: {
            id: true,
            name: true,
            code: true,
            durationMinutes: true,
            prepBufferMinutes: true,
            cleanupBufferMinutes: true
          }
        }
      }
    }))
  ]);

  const dayAppointments = appointments.filter((appointment) => {
    const start = toZonedParts(new Date(appointment.startAt), policy.timezone);
    const end = toZonedParts(new Date(appointment.endAt), policy.timezone);
    return start.dateKey === dateKey || end.dateKey === dateKey;
  });

  const effectiveRule = getEffectiveRule({
    dateKey,
    weeklyRules: config.weeklyRules,
    specialDateRules: config.specialDateRules,
    timezone: policy.timezone
  });

  const activeCabins = config.cabins.filter((cabin) => cabin.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

  const slots = buildAgendaSlots({
    dateKey,
    policy,
    cabins: activeCabins,
    blocks,
    appointments: dayAppointments,
    effectiveRule
  });

  const totalCapacity = slots.reduce((acc, slot) => acc + slot.capacity, 0);
  const usedUnits = slots.reduce((acc, slot) => acc + Math.min(slot.booked, slot.capacity), 0);
  const availableUnits = slots.reduce((acc, slot) => acc + slot.available, 0);
  const blockedSlots = slots.filter((slot) => slot.blocked).length;

  const report = cabinProductivityReport({
    dateKey,
    policy,
    cabins: activeCabins,
    slots,
    appointments: dayAppointments
  });

  return {
    dateKey,
    policy,
    effectiveRule,
    cabins: activeCabins,
    blocks,
    slots,
    appointments: dayAppointments,
    summary: {
      totalSlots: slots.length,
      blockedSlots,
      totalCapacity,
      usedUnits,
      availableUnits,
      occupancy: totalCapacity > 0 ? (usedUnits / totalCapacity) * 100 : 0,
      appointmentsToday: dayAppointments.length,
      canceledToday: dayAppointments.filter((appointment) => appointment.status === "canceled").length,
      noShowToday: dayAppointments.filter((appointment) => appointment.status === "no_show").length,
      completedToday: dayAppointments.filter((appointment) => appointment.status === "completed").length
    },
    report
  };
};

export const getAgendaDailyReport = async (dateKey: string) => {
  const snapshot = await getAgendaDaySnapshot(dateKey);
  return snapshot.report;
};
