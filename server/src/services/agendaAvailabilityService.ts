import { Appointment, AgendaPolicy, AgendaCabin, AgendaBlockedSlot, AgendaWeeklyRule, AgendaSpecialDateRule } from "@prisma/client";
import { prisma } from "../db/prisma";
import { toZonedParts, overlapsRange, dayOfWeekForDateKey, appointmentRangeForDateKey, activeAgendaStatuses } from "./agendaTimezoneUtils";
import { isBlockOverlapping, hasCabinConflictBatch, AgendaValidationError } from "./agendaConflictService";
import { getAgendaConfig } from "./agendaConfigService";

export const getEffectiveRule = ({
  dateKey,
  weeklyRules,
  specialDateRules,
  timezone
}: {
  dateKey: string;
  weeklyRules: AgendaWeeklyRule[];
  specialDateRules: AgendaSpecialDateRule[];
  timezone: string;
}) => {
  const special = specialDateRules.find((rule) => rule.dateKey === dateKey);
  const dayOfWeek = dayOfWeekForDateKey(dateKey, timezone);
  const weekly = weeklyRules.find((rule) => rule.dayOfWeek === dayOfWeek);

  if (special) {
    if (!special.isOpen) {
      return {
        source: "special" as const,
        dayOfWeek,
        isOpen: false,
        startHour: null,
        endHour: null
      };
    }

    return {
      source: "special" as const,
      dayOfWeek,
      isOpen: true,
      startHour: special.startHour ?? weekly?.startHour ?? 9,
      endHour: special.endHour ?? weekly?.endHour ?? 20
    };
  }

  if (!weekly || !weekly.isOpen) {
    return {
      source: "weekly" as const,
      dayOfWeek,
      isOpen: false,
      startHour: null,
      endHour: null
    };
  }

  return {
    source: "weekly" as const,
    dayOfWeek,
    isOpen: true,
    startHour: weekly.startHour,
    endHour: weekly.endHour
  };
};

export const resolveAppointmentPlacement = async ({
  startAt,
  endAt,
  requestedCabinIds,
  requestedCabinId,
  excludeAppointmentId,
  prepBufferMinutes,
  cleanupBufferMinutes
}: {
  startAt: Date;
  endAt: Date;
  requestedCabinIds?: string[];
  requestedCabinId?: string;
  excludeAppointmentId?: string;
  prepBufferMinutes?: number;
  cleanupBufferMinutes?: number;
}) => {
  const config = await getAgendaConfig();
  const { policy } = config;
  const now = new Date();

  const start = toZonedParts(startAt, policy.timezone);
  const end = toZonedParts(endAt, policy.timezone);

  if (endAt <= startAt) {
    throw new AgendaValidationError("La fecha de fin debe ser mayor a la de inicio", 400);
  }

  const minAdvanceBoundary = new Date(now.getTime() + policy.minAdvanceMinutes * 60 * 1000);
  if (startAt < minAdvanceBoundary) {
    throw new AgendaValidationError(
      `La cita debe reservarse con al menos ${policy.minAdvanceMinutes} minutos de anticipación`,
      409
    );
  }

  const maxAdvanceBoundary = new Date(now.getTime() + policy.maxAdvanceDays * 24 * 60 * 60 * 1000);
  if (startAt > maxAdvanceBoundary) {
    throw new AgendaValidationError(
      `La cita no puede reservarse con más de ${policy.maxAdvanceDays} días de anticipación`,
      409
    );
  }

  if (start.dateKey !== end.dateKey) {
    throw new AgendaValidationError("La cita debe iniciar y terminar el mismo día operativo");
  }

  const effectiveRule = getEffectiveRule({
    dateKey: start.dateKey,
    weeklyRules: config.weeklyRules,
    specialDateRules: config.specialDateRules,
    timezone: policy.timezone
  });

  if (!effectiveRule.isOpen || effectiveRule.startHour == null || effectiveRule.endHour == null) {
    throw new AgendaValidationError("La clínica está cerrada para la fecha seleccionada");
  }

  const openingMinute = effectiveRule.startHour * 60;
  const closingMinute = effectiveRule.endHour * 60;

  if (start.minutesFromDay < openingMinute || end.minutesFromDay > closingMinute) {
    throw new AgendaValidationError("El horario solicitado está fuera de la jornada configurada");
  }

  if ((start.minutesFromDay - openingMinute) % policy.slotMinutes !== 0 || (end.minutesFromDay - start.minutesFromDay) % policy.slotMinutes !== 0) {
    throw new AgendaValidationError(`La cita debe respetar el intervalo operativo de ${policy.slotMinutes} minutos`);
  }

  const cabins = config.cabins.filter((cabin) => cabin.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

  if (cabins.length === 0) {
    throw new AgendaValidationError("No hay cabinas activas configuradas");
  }

  const blocks = await prisma.agendaBlockedSlot.findMany({
    where: { dateKey: start.dateKey }
  });

  const priorityCabinIds = Array.from(
    new Set(
      (requestedCabinIds ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
  if (requestedCabinId && !priorityCabinIds.includes(requestedCabinId)) {
    priorityCabinIds.unshift(requestedCabinId);
  }

  const candidateCabins =
    priorityCabinIds.length > 0
      ? cabins
          .filter((cabin) => priorityCabinIds.includes(cabin.id))
          .sort((a, b) => priorityCabinIds.indexOf(a.id) - priorityCabinIds.indexOf(b.id))
      : cabins;

  if (candidateCabins.length === 0) {
    throw new AgendaValidationError("La cabina seleccionada no está disponible");
  }

  // Una sola query para todas las cabinas candidatas (evita N+1)
  const conflictMap = await hasCabinConflictBatch({
    startAt,
    endAt,
    cabinIds: candidateCabins.map((c) => c.id),
    excludeAppointmentId,
    incomingPrepBufferMinutes: prepBufferMinutes ?? 0,
    incomingCleanupBufferMinutes: cleanupBufferMinutes ?? 0
  });

  for (const cabin of candidateCabins) {
    const blocked = isBlockOverlapping({
      blocks,
      dateKey: start.dateKey,
      startMinute: start.minutesFromDay,
      endMinute: end.minutesFromDay,
      cabinId: cabin.id
    });

    if (blocked) {
      continue;
    }

    const overlap = conflictMap.get(cabin.id) ?? false;

    if (!overlap) {
      return {
        cabinId: cabin.id,
        dateKey: start.dateKey,
        startMinute: start.minutesFromDay,
        endMinute: end.minutesFromDay,
        policy,
        effectiveRule
      };
    }
  }

  throw new AgendaValidationError("No hay cabinas disponibles en el horario seleccionado");
};

export const buildAgendaSlots = ({
  dateKey,
  policy,
  cabins,
  blocks,
  appointments,
  effectiveRule
}: {
  dateKey: string;
  policy: AgendaPolicy;
  cabins: AgendaCabin[];
  blocks: AgendaBlockedSlot[];
  appointments: Appointment[];
  effectiveRule: {
    source: "weekly" | "special";
    dayOfWeek: number;
    isOpen: boolean;
    startHour: number | null;
    endHour: number | null;
  };
}) => {
  const slots: Array<{
    key: string;
    startMinute: number;
    endMinute: number;
    label: string;
    booked: number;
    capacity: number;
    available: number;
    blocked: boolean;
    cabins: Array<{
      cabinId: string;
      cabinName: string;
      blocked: boolean;
      booked: number;
      capacity: number;
      available: number;
      appointmentIds: string[];
    }>;
  }> = [];

  if (!effectiveRule.isOpen || effectiveRule.startHour == null || effectiveRule.endHour == null) {
    return slots;
  }

  const startMinute = effectiveRule.startHour * 60;
  const endMinute = effectiveRule.endHour * 60;

  for (let minute = startMinute; minute < endMinute; minute += policy.slotMinutes) {
    const slotStart = minute;
    const slotEnd = minute + policy.slotMinutes;

    const cabinRows = cabins.map((cabin) => {
      const isBlocked = blocks.some((block) => {
        if (block.dateKey !== dateKey) return false;
        if (block.cabinId && block.cabinId !== cabin.id) return false;
        return overlapsRange(block.startMinute, block.endMinute, slotStart, slotEnd);
      });

      const cabinAppointments = appointments.filter((appointment) => {
        if (appointment.cabinId !== cabin.id) return false;
        if (!activeAgendaStatuses.includes(appointment.status as any)) return false;
        const range = appointmentRangeForDateKey(appointment, dateKey, policy.timezone);
        if (!range) return false;
        return overlapsRange(range.startMinute, range.endMinute, slotStart, slotEnd);
      });

      const capacity = isBlocked ? 0 : 1;
      const booked = cabinAppointments.length;

      return {
        cabinId: cabin.id,
        cabinName: cabin.name,
        blocked: isBlocked,
        booked,
        capacity,
        available: Math.max(capacity - booked, 0),
        appointmentIds: cabinAppointments.map((appointment) => appointment.id)
      };
    });

    const capacity = cabinRows.reduce((acc, row) => acc + row.capacity, 0);
    const booked = cabinRows.reduce((acc, row) => acc + Math.min(row.booked, row.capacity), 0);
    const available = cabinRows.reduce((acc, row) => acc + row.available, 0);

    const startLabelHour = String(Math.floor(slotStart / 60)).padStart(2, "0");
    const startLabelMinute = String(slotStart % 60).padStart(2, "0");
    const endLabelHour = String(Math.floor(slotEnd / 60)).padStart(2, "0");
    const endLabelMinute = String(slotEnd % 60).padStart(2, "0");

    slots.push({
      key: `${dateKey}-${startLabelHour}:${startLabelMinute}`,
      startMinute: slotStart,
      endMinute: slotEnd,
      label: `${startLabelHour}:${startLabelMinute} - ${endLabelHour}:${endLabelMinute}`,
      booked,
      capacity,
      available,
      blocked: cabinRows.every((row) => row.blocked),
      cabins: cabinRows
    });
  }

  return slots;
};

export const cabinProductivityReport = ({
  dateKey,
  policy,
  cabins,
  slots,
  appointments
}: {
  dateKey: string;
  policy: AgendaPolicy;
  cabins: AgendaCabin[];
  slots: Array<{ cabins: Array<{ cabinId: string; blocked: boolean }> }>;
  appointments: Appointment[];
}) => {
  const report = cabins.map((cabin) => {
    const dayAppointments = appointments.filter((appointment) => {
      if (appointment.cabinId !== cabin.id) return false;
      const start = toZonedParts(new Date(appointment.startAt), policy.timezone);
      return start.dateKey === dateKey;
    });

    const blockedSlots = slots.filter((slot) => slot.cabins.some((row) => row.cabinId === cabin.id && row.blocked)).length;
    const bookableSlots = slots.length - blockedSlots;

    const scheduledOrConfirmed = dayAppointments.filter((appointment) => appointment.status === "scheduled" || appointment.status === "confirmed").length;
    const completed = dayAppointments.filter((appointment) => appointment.status === "completed").length;
    const noShow = dayAppointments.filter((appointment) => appointment.status === "no_show").length;
    const canceled = dayAppointments.filter((appointment) => appointment.status === "canceled").length;

    const consumedUnits = scheduledOrConfirmed + completed + noShow;
    const utilizationPct = bookableSlots > 0 ? (consumedUnits / bookableSlots) * 100 : 0;
    const productivityPct = consumedUnits > 0 ? (completed / consumedUnits) * 100 : 0;

    return {
      cabinId: cabin.id,
      cabinName: cabin.name,
      blockedSlots,
      bookableSlots,
      scheduledOrConfirmed,
      completed,
      noShow,
      canceled,
      utilizationPct,
      productivityPct
    };
  });

  const totals = report.reduce(
    (acc, row) => {
      acc.bookableSlots += row.bookableSlots;
      acc.blockedSlots += row.blockedSlots;
      acc.scheduledOrConfirmed += row.scheduledOrConfirmed;
      acc.completed += row.completed;
      acc.noShow += row.noShow;
      acc.canceled += row.canceled;
      return acc;
    },
    {
      bookableSlots: 0,
      blockedSlots: 0,
      scheduledOrConfirmed: 0,
      completed: 0,
      noShow: 0,
      canceled: 0
    }
  );

  return {
    dateKey,
    cabins: report,
    totals,
    utilizationPct: totals.bookableSlots > 0 ? ((totals.scheduledOrConfirmed + totals.completed + totals.noShow) / totals.bookableSlots) * 100 : 0,
    productivityPct:
      totals.scheduledOrConfirmed + totals.completed + totals.noShow > 0
        ? (totals.completed / (totals.scheduledOrConfirmed + totals.completed + totals.noShow)) * 100
        : 0
  };
};
