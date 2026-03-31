import { prisma } from "../db/prisma";
import { normalizeDateKey } from "./agendaTimezoneUtils";
import { AgendaValidationError } from "./agendaConflictService";
import { ensureAgendaDefaults } from "./agendaSetupService";

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
