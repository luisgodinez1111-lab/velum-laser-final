import { Appointment, AppointmentStatus, AgendaBlockedSlot, AgendaCabin, AgendaPolicy, AgendaSpecialDateRule, AgendaTreatment, AgendaWeeklyRule } from "@prisma/client";
import { prisma } from "../db/prisma";

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const comparableStatuses: AppointmentStatus[] = ["scheduled", "confirmed"];

const activeAgendaStatuses: AppointmentStatus[] = ["scheduled", "confirmed", "completed", "no_show"];

type ZonedParts = {
  dateKey: string;
  dayOfWeek: number;
  minutesFromDay: number;
};

const toZonedParts = (date: Date, timeZone: string): ZonedParts => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short"
  });

  const parts = formatter.formatToParts(date);
  const byType = (type: string) => parts.find((part) => part.type === type)?.value;

  const year = byType("year") ?? "1970";
  const month = byType("month") ?? "01";
  const day = byType("day") ?? "01";
  const weekdayName = byType("weekday") ?? "Sun";

  const parsedHour = Number(byType("hour") ?? "0");
  const hour = parsedHour === 24 ? 0 : parsedHour;
  const minute = Number(byType("minute") ?? "0");

  return {
    dateKey: `${year}-${month}-${day}`,
    dayOfWeek: weekdayMap[weekdayName] ?? 0,
    minutesFromDay: hour * 60 + minute
  };
};

const dayOfWeekForDateKey = (dateKey: string, timeZone: string) => {
  const reference = new Date(`${dateKey}T12:00:00.000Z`);
  return toZonedParts(reference, timeZone).dayOfWeek;
};

const overlapsRange = (startA: number, endA: number, startB: number, endB: number) => startA < endB && endA > startB;

const appointmentRangeForDateKey = (
  appointment: Appointment & {
    treatment?: { prepBufferMinutes?: number | null; cleanupBufferMinutes?: number | null } | null;
  },
  dateKey: string,
  timeZone: string
) => {
  const padded = bufferedRange({
    startAt: new Date(appointment.startAt),
    endAt: new Date(appointment.endAt),
    prepBufferMinutes: appointment.treatment?.prepBufferMinutes ?? 0,
    cleanupBufferMinutes: appointment.treatment?.cleanupBufferMinutes ?? 0
  });
  const start = toZonedParts(padded.startAt, timeZone);
  const end = toZonedParts(padded.endAt, timeZone);

  if (end.dateKey < dateKey || start.dateKey > dateKey) {
    return null;
  }

  const startMinute = start.dateKey < dateKey ? 0 : start.minutesFromDay;
  const endMinute = end.dateKey > dateKey ? 1440 : end.minutesFromDay;

  return {
    startMinute,
    endMinute
  };
};

const normalizeDateKey = (value: string) => value.trim();

const defaultPolicy: Pick<
  AgendaPolicy,
  | "timezone"
  | "slotMinutes"
  | "autoConfirmHours"
  | "noShowGraceMinutes"
  | "maxActiveAppointmentsPerWeek"
  | "maxActiveAppointmentsPerMonth"
  | "minAdvanceMinutes"
  | "maxAdvanceDays"
> = {
  timezone: "America/Chihuahua",
  slotMinutes: 30,
  autoConfirmHours: 12,
  noShowGraceMinutes: 30,
  maxActiveAppointmentsPerWeek: 4,
  maxActiveAppointmentsPerMonth: 12,
  minAdvanceMinutes: 120,
  maxAdvanceDays: 60
};

const defaultWeeklyRules: Array<Pick<AgendaWeeklyRule, "dayOfWeek" | "isOpen" | "startHour" | "endHour">> = [
  { dayOfWeek: 0, isOpen: false, startHour: 9, endHour: 20 },
  { dayOfWeek: 1, isOpen: true, startHour: 9, endHour: 20 },
  { dayOfWeek: 2, isOpen: true, startHour: 9, endHour: 20 },
  { dayOfWeek: 3, isOpen: true, startHour: 9, endHour: 20 },
  { dayOfWeek: 4, isOpen: true, startHour: 9, endHour: 20 },
  { dayOfWeek: 5, isOpen: true, startHour: 9, endHour: 20 },
  { dayOfWeek: 6, isOpen: true, startHour: 9, endHour: 20 }
];

const defaultTreatments: Array<
  Pick<
    AgendaTreatment,
    | "name"
    | "code"
    | "description"
    | "durationMinutes"
    | "prepBufferMinutes"
    | "cleanupBufferMinutes"
    | "requiresSpecificCabin"
    | "isActive"
    | "sortOrder"
  >
> = [
  {
    name: "Valoración",
    code: "valuation",
    description: "Primera valoración clínica",
    durationMinutes: 45,
    prepBufferMinutes: 0,
    cleanupBufferMinutes: 0,
    requiresSpecificCabin: false,
    isActive: true,
    sortOrder: 1
  },
  {
    name: "Sesión Láser",
    code: "laser_session",
    description: "Sesión regular de tratamiento láser",
    durationMinutes: 45,
    prepBufferMinutes: 0,
    cleanupBufferMinutes: 0,
    requiresSpecificCabin: false,
    isActive: true,
    sortOrder: 2
  }
];

const ensurePolicy = async () => {
  const existing = await prisma.agendaPolicy.findFirst();
  if (existing) {
    return existing;
  }

  return prisma.agendaPolicy.create({
    data: defaultPolicy
  });
};

const ensureCabins = async () => {
  const count = await prisma.agendaCabin.count();
  if (count > 0) {
    return;
  }

  await prisma.agendaCabin.createMany({
    data: [
      { name: "Cabina 1", isActive: true, sortOrder: 1 },
      { name: "Cabina 2", isActive: true, sortOrder: 2 }
    ]
  });
};

const ensureWeeklyRules = async () => {
  const existing = await prisma.agendaWeeklyRule.findMany();
  if (existing.length === 7) {
    return;
  }

  const existingByDay = new Set(existing.map((rule) => rule.dayOfWeek));

  await Promise.all(
    defaultWeeklyRules
      .filter((rule) => !existingByDay.has(rule.dayOfWeek))
      .map((rule) =>
        prisma.agendaWeeklyRule.create({
          data: rule
        })
      )
  );
};

const ensureTreatments = async () => {
  const count = await prisma.agendaTreatment.count();
  if (count > 0) {
    return;
  }

  await prisma.agendaTreatment.createMany({
    data: defaultTreatments
  });
};

export const ensureAgendaDefaults = async () => {
  await ensurePolicy();
  await ensureCabins();
  await ensureWeeklyRules();
  await ensureTreatments();
};

type AgendaConfigPayload = {
  timezone?: string;
  slotMinutes?: number;
  autoConfirmHours?: number;
  noShowGraceMinutes?: number;
  maxActiveAppointmentsPerWeek?: number;
  maxActiveAppointmentsPerMonth?: number;
  minAdvanceMinutes?: number;
  maxAdvanceDays?: number;
  cabins?: Array<{ id?: string; name: string; isActive?: boolean; sortOrder?: number }>;
  treatments?: Array<{
    id?: string;
    name: string;
    code: string;
    description?: string | null;
    durationMinutes: number;
    prepBufferMinutes?: number;
    cleanupBufferMinutes?: number;
    cabinId?: string | null;
    allowedCabinIds?: string[];
    requiresSpecificCabin?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  }>;
  weeklyRules?: Array<{ dayOfWeek: number; isOpen: boolean; startHour?: number; endHour?: number }>;
  specialDateRules?: Array<{ dateKey: string; isOpen: boolean; startHour?: number | null; endHour?: number | null; note?: string | null }>;
};

export const getAgendaConfig = async () => {
  await ensureAgendaDefaults();

  const [policy, cabins, treatments, weeklyRules, specialDateRules] = await Promise.all([
    prisma.agendaPolicy.findFirstOrThrow(),
    prisma.agendaCabin.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.agendaTreatment.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        cabinRules: {
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
        }
      }
    }),
    prisma.agendaWeeklyRule.findMany({ orderBy: { dayOfWeek: "asc" } }),
    prisma.agendaSpecialDateRule.findMany({ orderBy: { dateKey: "asc" }, take: 365 })
  ]);

  return {
    policy,
    cabins,
    treatments: treatments.map(({ cabinRules, ...treatment }) => ({
      ...treatment,
      allowedCabinIds: cabinRules.map((rule) => rule.cabinId)
    })),
    weeklyRules,
    specialDateRules
  };
};

export const updateAgendaConfig = async (payload: AgendaConfigPayload) => {
  await ensureAgendaDefaults();

  const policy = await prisma.agendaPolicy.findFirstOrThrow();
  const effectiveSlotMinutes = payload.slotMinutes ?? policy.slotMinutes;

  await prisma.$transaction(async (tx) => {
    const normalizeTreatmentCabinAssignments = async () => {
      const treatments = await tx.agendaTreatment.findMany({
        select: {
          id: true,
          cabinId: true,
          requiresSpecificCabin: true,
          cabinRules: {
            select: { cabinId: true, priority: true },
            orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
          }
        }
      });

      for (const treatment of treatments) {
        const orderedCabinIds = treatment.cabinRules.map((rule) => rule.cabinId);
        const nextPrimaryCabinId = orderedCabinIds[0] ?? null;
        const nextRequiresSpecific = treatment.requiresSpecificCabin && orderedCabinIds.length > 0;

        if (treatment.cabinId === nextPrimaryCabinId && treatment.requiresSpecificCabin === nextRequiresSpecific) {
          continue;
        }

        await tx.agendaTreatment.update({
          where: { id: treatment.id },
          data: {
            cabinId: nextPrimaryCabinId,
            requiresSpecificCabin: nextRequiresSpecific
          }
        });
      }
    };

    await tx.agendaPolicy.update({
      where: { id: policy.id },
      data: {
        timezone: payload.timezone ?? undefined,
        slotMinutes: payload.slotMinutes ?? undefined,
        autoConfirmHours: payload.autoConfirmHours ?? undefined,
        noShowGraceMinutes: payload.noShowGraceMinutes ?? undefined,
        maxActiveAppointmentsPerWeek: payload.maxActiveAppointmentsPerWeek ?? undefined,
        maxActiveAppointmentsPerMonth: payload.maxActiveAppointmentsPerMonth ?? undefined,
        minAdvanceMinutes: payload.minAdvanceMinutes ?? undefined,
        maxAdvanceDays: payload.maxAdvanceDays ?? undefined
      }
    });

    if (payload.cabins) {
      const existing = await tx.agendaCabin.findMany({ select: { id: true } });
      const keepIds = new Set<string>();

      for (const [index, cabin] of payload.cabins.entries()) {
        if (cabin.id) {
          keepIds.add(cabin.id);
          await tx.agendaCabin.update({
            where: { id: cabin.id },
            data: {
              name: cabin.name,
              isActive: cabin.isActive ?? true,
              sortOrder: cabin.sortOrder ?? index + 1
            }
          });
          continue;
        }

        const created = await tx.agendaCabin.create({
          data: {
            name: cabin.name,
            isActive: cabin.isActive ?? true,
            sortOrder: cabin.sortOrder ?? index + 1
          }
        });

        keepIds.add(created.id);
      }

      const toDelete = existing
        .map((record) => record.id)
        .filter((id) => !keepIds.has(id));

      if (toDelete.length > 0) {
        await tx.appointment.updateMany({
          where: { cabinId: { in: toDelete } },
          data: { cabinId: null }
        });

        await tx.agendaBlockedSlot.updateMany({
          where: { cabinId: { in: toDelete } },
          data: { cabinId: null }
        });

        await tx.agendaCabin.deleteMany({
          where: { id: { in: toDelete } }
        });

        await normalizeTreatmentCabinAssignments();
      }
    }

    if (payload.treatments) {
      const cabinRows = await tx.agendaCabin.findMany({ select: { id: true, isActive: true } });
      const cabinById = new Map(cabinRows.map((record) => [record.id, record]));
      const existing = await tx.agendaTreatment.findMany({ select: { id: true } });
      const keepIds = new Set<string>();
      const usedCodes = new Set<string>();

      for (const [index, treatment] of payload.treatments.entries()) {
        const code = treatment.code.trim().toLowerCase();
        const normalizedAllowedCabinIds = Array.from(
          new Set((treatment.allowedCabinIds ?? []).map((value) => value.trim()).filter(Boolean))
        );
        if (treatment.cabinId && !normalizedAllowedCabinIds.includes(treatment.cabinId)) {
          normalizedAllowedCabinIds.unshift(treatment.cabinId);
        }

        if (usedCodes.has(code)) {
          throw new AgendaValidationError("Los tratamientos no pueden repetir el mismo código", 400);
        }
        usedCodes.add(code);

        if (treatment.requiresSpecificCabin && normalizedAllowedCabinIds.length === 0) {
          throw new AgendaValidationError("Si el tratamiento requiere cabina específica, debes seleccionar una cabina", 400);
        }

        for (const cabinId of normalizedAllowedCabinIds) {
          if (!cabinById.has(cabinId)) {
            throw new AgendaValidationError("El tratamiento referencia una cabina que no existe", 400);
          }
          if (treatment.requiresSpecificCabin && !cabinById.get(cabinId)?.isActive) {
            throw new AgendaValidationError(
              "La cabina específica del tratamiento debe estar activa para poder guardar la configuración",
              400
            );
          }
        }

        if (treatment.durationMinutes % effectiveSlotMinutes !== 0) {
          throw new AgendaValidationError(
            `La duración del tratamiento debe ser múltiplo del intervalo (${effectiveSlotMinutes} min)`,
            400
          );
        }

        const data = {
          name: treatment.name.trim(),
          code,
          description: treatment.description ?? null,
          durationMinutes: treatment.durationMinutes,
          prepBufferMinutes: treatment.prepBufferMinutes ?? 0,
          cleanupBufferMinutes: treatment.cleanupBufferMinutes ?? 0,
          cabinId: normalizedAllowedCabinIds[0] ?? null,
          requiresSpecificCabin: treatment.requiresSpecificCabin ?? false,
          isActive: treatment.isActive ?? true,
          sortOrder: treatment.sortOrder ?? index + 1
        };

        let persistedTreatmentId: string;
        if (treatment.id) {
          await tx.agendaTreatment.update({
            where: { id: treatment.id },
            data
          });
          persistedTreatmentId = treatment.id;
        } else {
          const created = await tx.agendaTreatment.create({ data });
          persistedTreatmentId = created.id;
        }

        keepIds.add(persistedTreatmentId);

        await tx.agendaTreatmentCabinRule.deleteMany({
          where: { treatmentId: persistedTreatmentId }
        });

        if (normalizedAllowedCabinIds.length > 0) {
          const now = new Date();
          await tx.agendaTreatmentCabinRule.createMany({
            data: normalizedAllowedCabinIds.map((cabinId, cabinIndex) => ({
              treatmentId: persistedTreatmentId,
              cabinId,
              priority: cabinIndex + 1,
              updatedAt: now
            }))
          });
        }
      }

      const toDelete = existing
        .map((record) => record.id)
        .filter((id) => !keepIds.has(id));

      if (toDelete.length > 0) {
        const usedRows = await tx.appointment.findMany({
          where: { treatmentId: { in: toDelete } },
          select: { treatmentId: true },
          distinct: ["treatmentId"]
        });
        const usedIds = new Set(usedRows.map((row) => row.treatmentId).filter(Boolean) as string[]);

        const deactivateIds = toDelete.filter((id) => usedIds.has(id));
        const hardDeleteIds = toDelete.filter((id) => !usedIds.has(id));

        if (deactivateIds.length > 0) {
          await tx.agendaTreatment.updateMany({
            where: { id: { in: deactivateIds } },
            data: { isActive: false }
          });
        }

        if (hardDeleteIds.length > 0) {
          await tx.agendaTreatment.deleteMany({
            where: { id: { in: hardDeleteIds } }
          });
        }
      }

      await normalizeTreatmentCabinAssignments();
    }

    if (payload.weeklyRules) {
      for (const rule of payload.weeklyRules) {
        await tx.agendaWeeklyRule.upsert({
          where: { dayOfWeek: rule.dayOfWeek },
          create: {
            dayOfWeek: rule.dayOfWeek,
            isOpen: rule.isOpen,
            startHour: rule.startHour ?? 9,
            endHour: rule.endHour ?? 20
          },
          update: {
            isOpen: rule.isOpen,
            startHour: rule.startHour ?? 9,
            endHour: rule.endHour ?? 20
          }
        });
      }
    }

    if (payload.specialDateRules) {
      const incomingKeys = new Set(payload.specialDateRules.map((rule) => normalizeDateKey(rule.dateKey)));

      for (const rule of payload.specialDateRules) {
        await tx.agendaSpecialDateRule.upsert({
          where: { dateKey: normalizeDateKey(rule.dateKey) },
          create: {
            dateKey: normalizeDateKey(rule.dateKey),
            isOpen: rule.isOpen,
            startHour: rule.startHour ?? null,
            endHour: rule.endHour ?? null,
            note: rule.note ?? null
          },
          update: {
            isOpen: rule.isOpen,
            startHour: rule.startHour ?? null,
            endHour: rule.endHour ?? null,
            note: rule.note ?? null
          }
        });
      }

      await tx.agendaSpecialDateRule.deleteMany({
        where: {
          dateKey: {
            notIn: Array.from(incomingKeys)
          }
        }
      });
    }
  });

  return getAgendaConfig();
};

const getEffectiveRule = ({
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

const isBlockOverlapping = ({
  blocks,
  dateKey,
  startMinute,
  endMinute,
  cabinId
}: {
  blocks: AgendaBlockedSlot[];
  dateKey: string;
  startMinute: number;
  endMinute: number;
  cabinId: string;
}) => {
  return blocks.some((block) => {
    if (block.dateKey !== dateKey) return false;
    if (block.cabinId && block.cabinId !== cabinId) return false;
    return overlapsRange(block.startMinute, block.endMinute, startMinute, endMinute);
  });
};

function bufferedRange({
  startAt,
  endAt,
  prepBufferMinutes = 0,
  cleanupBufferMinutes = 0
}: {
  startAt: Date;
  endAt: Date;
  prepBufferMinutes?: number;
  cleanupBufferMinutes?: number;
}) {
  return {
    startAt: new Date(startAt.getTime() - prepBufferMinutes * 60 * 1000),
    endAt: new Date(endAt.getTime() + cleanupBufferMinutes * 60 * 1000)
  };
}

const hasCabinConflict = async ({
  startAt,
  endAt,
  cabinId,
  excludeAppointmentId,
  incomingPrepBufferMinutes,
  incomingCleanupBufferMinutes
}: {
  startAt: Date;
  endAt: Date;
  cabinId: string;
  excludeAppointmentId?: string;
  incomingPrepBufferMinutes?: number;
  incomingCleanupBufferMinutes?: number;
}) => {
  const incomingBuffered = bufferedRange({
    startAt,
    endAt,
    prepBufferMinutes: incomingPrepBufferMinutes ?? 0,
    cleanupBufferMinutes: incomingCleanupBufferMinutes ?? 0
  });
  const aroundWindowMs = 240 * 60 * 1000;

  const appointments = await prisma.appointment.findMany({
    where: {
      ...(excludeAppointmentId
        ? {
            id: {
              not: excludeAppointmentId
            }
          }
        : {}),
      status: {
        in: comparableStatuses
      },
      startAt: {
        lt: new Date(incomingBuffered.endAt.getTime() + aroundWindowMs)
      },
      endAt: {
        gt: new Date(incomingBuffered.startAt.getTime() - aroundWindowMs)
      },
      OR: [{ cabinId }, { cabinId: null }]
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      treatment: {
        select: {
          prepBufferMinutes: true,
          cleanupBufferMinutes: true
        }
      }
    }
  });

  return appointments.some((appointment) => {
    const existingBuffered = bufferedRange({
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      prepBufferMinutes: appointment.treatment?.prepBufferMinutes ?? 0,
      cleanupBufferMinutes: appointment.treatment?.cleanupBufferMinutes ?? 0
    });

    return overlapsRange(
      existingBuffered.startAt.getTime(),
      existingBuffered.endAt.getTime(),
      incomingBuffered.startAt.getTime(),
      incomingBuffered.endAt.getTime()
    );
  });
};

export class AgendaValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.statusCode = statusCode;
  }
}

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

    const overlap = await hasCabinConflict({
      startAt,
      endAt,
      cabinId: cabin.id,
      excludeAppointmentId,
      incomingPrepBufferMinutes: prepBufferMinutes ?? 0,
      incomingCleanupBufferMinutes: cleanupBufferMinutes ?? 0
    });

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

export const syncAppointmentWorkflow = async () => {
  const { policy } = await getAgendaConfig();
  const now = new Date();
  const autoConfirmUntil = new Date(now.getTime() + policy.autoConfirmHours * 60 * 60 * 1000);

  const autoConfirmed = await prisma.appointment.updateMany({
    where: {
      status: "scheduled",
      startAt: {
        lte: autoConfirmUntil
      },
      endAt: {
        gt: now
      }
    },
    data: {
      status: "confirmed",
      confirmedAt: now,
      autoConfirmedAt: now
    }
  });

  const noShowCutoff = new Date(now.getTime() - policy.noShowGraceMinutes * 60 * 1000);

  // Fetch only IDs of overdue appointments that have at least one session
  // to avoid N+1 updates — mark no-show in a single updateMany
  const overdueAll = await prisma.appointment.findMany({
    where: {
      status: { in: ["scheduled", "confirmed"] },
      endAt: { lte: noShowCutoff }
    },
    select: {
      id: true,
      sessions: { select: { id: true }, take: 1 }
    }
  });

  const noShowIds = overdueAll
    .filter((a) => a.sessions.length === 0)
    .map((a) => a.id);

  const noShowResult = noShowIds.length > 0
    ? await prisma.appointment.updateMany({
        where: { id: { in: noShowIds } },
        data: { status: "no_show", noShowAt: now }
      })
    : { count: 0 };

  const noShowMarked = noShowResult.count;

  return {
    autoConfirmed: autoConfirmed.count,
    noShowMarked
  };
};

const buildAgendaSlots = ({
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
        if (!activeAgendaStatuses.includes(appointment.status)) return false;
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

const cabinProductivityReport = ({
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
    prisma.appointment.findMany({
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
    })
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

export const createAgendaBlock = async ({
  dateKey,
  startMinute,
  endMinute,
  cabinId,
  reason,
  actorUserId
}: {
  dateKey: string;
  startMinute: number;
  endMinute: number;
  cabinId?: string | null;
  reason?: string;
  actorUserId?: string;
}) => {
  await ensureAgendaDefaults();

  if (cabinId) {
    const cabin = await prisma.agendaCabin.findUnique({ where: { id: cabinId } });
    if (!cabin || !cabin.isActive) {
      throw new AgendaValidationError("La cabina indicada no existe o no está activa", 404);
    }
  }

  return prisma.agendaBlockedSlot.create({
    data: {
      dateKey: normalizeDateKey(dateKey),
      startMinute,
      endMinute,
      cabinId: cabinId ?? null,
      reason,
      createdByUserId: actorUserId
    }
  });
};

export const deleteAgendaBlock = async (blockId: string) => {
  const block = await prisma.agendaBlockedSlot.findUnique({ where: { id: blockId } });
  if (!block) {
    throw new AgendaValidationError("Bloqueo no encontrado", 404);
  }

  await prisma.agendaBlockedSlot.delete({ where: { id: blockId } });
  return block;
};

export const getAgendaDailyReport = async (dateKey: string) => {
  const snapshot = await getAgendaDaySnapshot(dateKey);
  return snapshot.report;
};
