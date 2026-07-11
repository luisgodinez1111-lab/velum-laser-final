import { normalizeDateKey } from "./agendaTimezoneUtils";
import { AgendaValidationError } from "./agendaConflictService";
import { ensureAgendaDefaults } from "./agendaSetupService";
import { getTenantIdOr } from "../utils/tenantContext";
import { env } from "../utils/env";
import { withTenantContext } from "../db/withTenantContext";

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
    const cabin = await withTenantContext(async (tx) => tx.agendaCabin.findUnique({ where: { id: cabinId } }));
    if (!cabin || !cabin.isActive) {
      throw new AgendaValidationError("La cabina indicada no existe o no está activa", 404);
    }
  }

  return withTenantContext(async (tx) => tx.agendaBlockedSlot.create({
    data: {
      dateKey: normalizeDateKey(dateKey),
      startMinute,
      endMinute,
      cabinId: cabinId ?? null,
      reason,
      createdByUserId: actorUserId,
      tenantId: getTenantIdOr(env.defaultClinicId),
    }
  }));
};

export const deleteAgendaBlock = async (blockId: string) => {
  const block = await withTenantContext(async (tx) => tx.agendaBlockedSlot.findUnique({ where: { id: blockId } }));
  if (!block) {
    throw new AgendaValidationError("Bloqueo no encontrado", 404);
  }

  await withTenantContext(async (tx) => tx.agendaBlockedSlot.delete({ where: { id: blockId } }));
  return block;
};
