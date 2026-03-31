import { AgendaWeeklyRule, AgendaSpecialDateRule } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ensureAgendaDefaults } from "./agendaSetupService";
import { normalizeDateKey } from "./agendaTimezoneUtils";
import { AgendaValidationError } from "./agendaConflictService";

export type AgendaConfigPayload = {
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
