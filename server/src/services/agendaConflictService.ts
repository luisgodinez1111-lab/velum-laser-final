import { AgendaBlockedSlot } from "@prisma/client";
import { prisma } from "../db/prisma";
import { bufferedRange, overlapsRange, comparableStatuses } from "./agendaTimezoneUtils";
import { AppError } from "../utils/AppError";

export const isBlockOverlapping = ({
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

export const hasCabinConflict = async ({
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
        in: comparableStatuses as unknown as ("scheduled" | "confirmed")[]
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

/**
 * Versión batch de hasCabinConflict: hace UNA sola query para todas las cabinas
 * candidatas y retorna un Map<cabinId, tieneConflicto>.
 * Úsala en lugar de llamar hasCabinConflict dentro de un loop por cabina.
 */
export const hasCabinConflictBatch = async ({
  startAt,
  endAt,
  cabinIds,
  excludeAppointmentId,
  incomingPrepBufferMinutes,
  incomingCleanupBufferMinutes
}: {
  startAt: Date;
  endAt: Date;
  cabinIds: string[];
  excludeAppointmentId?: string;
  incomingPrepBufferMinutes?: number;
  incomingCleanupBufferMinutes?: number;
}): Promise<Map<string, boolean>> => {
  const result = new Map<string, boolean>(cabinIds.map((id) => [id, false]));

  if (cabinIds.length === 0) {
    return result;
  }

  const incomingBuffered = bufferedRange({
    startAt,
    endAt,
    prepBufferMinutes: incomingPrepBufferMinutes ?? 0,
    cleanupBufferMinutes: incomingCleanupBufferMinutes ?? 0
  });
  const aroundWindowMs = 240 * 60 * 1000;

  // Una sola query trae los appointments de TODAS las cabinas candidatas
  const appointments = await prisma.appointment.findMany({
    where: {
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      status: {
        in: comparableStatuses as unknown as ("scheduled" | "confirmed")[]
      },
      startAt: {
        lt: new Date(incomingBuffered.endAt.getTime() + aroundWindowMs)
      },
      endAt: {
        gt: new Date(incomingBuffered.startAt.getTime() - aroundWindowMs)
      },
      // Incluye los que no tienen cabina asignada (cabinId: null) más los de las cabinas candidatas
      OR: [
        { cabinId: null },
        ...cabinIds.map((id) => ({ cabinId: id }))
      ]
    },
    select: {
      id: true,
      cabinId: true,
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

  for (const appointment of appointments) {
    const existingBuffered = bufferedRange({
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      prepBufferMinutes: appointment.treatment?.prepBufferMinutes ?? 0,
      cleanupBufferMinutes: appointment.treatment?.cleanupBufferMinutes ?? 0
    });

    const overlaps = overlapsRange(
      existingBuffered.startAt.getTime(),
      existingBuffered.endAt.getTime(),
      incomingBuffered.startAt.getTime(),
      incomingBuffered.endAt.getTime()
    );

    if (!overlaps) continue;

    if (appointment.cabinId === null) {
      // Sin cabina asignada: afecta a TODAS las candidatas
      for (const id of cabinIds) {
        result.set(id, true);
      }
    } else if (result.has(appointment.cabinId)) {
      result.set(appointment.cabinId, true);
    }
  }

  return result;
};

export class AgendaValidationError extends AppError {
  constructor(message: string, statusCode = 409) {
    super(message, "AGENDA_CONFLICT", statusCode);
  }
}
