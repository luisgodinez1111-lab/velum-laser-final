import { AgendaBlockedSlot } from "@prisma/client";
import { prisma } from "../db/prisma";
import { bufferedRange, overlapsRange, comparableStatuses } from "./agendaTimezoneUtils";

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

export class AgendaValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.statusCode = statusCode;
  }
}
