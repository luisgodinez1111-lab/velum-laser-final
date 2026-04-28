import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { env } from "./env";

/**
 * Resuelve el clinicId a usar para un nuevo usuario.
 * Prioriza el clinicId del actor; si no tiene, usa el primer usuario del sistema.
 * Retorna null si no se puede determinar (sistema sin usuarios).
 */
export const resolveClinicId = async (actorClinicId: string | null | undefined): Promise<string | null> => {
  if (actorClinicId) return actorClinicId;
  const seed = await withTenantContext(async (tx) => tx.user.findFirst({ select: { clinicId: true } }));
  return seed?.clinicId ?? null;
};

/**
 * Devuelve el clinicId del usuario dado su userId.
 * Fallback al DEFAULT_CLINIC_ID si el usuario no tiene uno asignado.
 */
export const getClinicIdByUserId = async (userId: string): Promise<string> => {
  const user = await withTenantContext(async (tx) => tx.user.findUnique({
    where: { id: userId },
    select: { clinicId: true },
  }));
  return user?.clinicId || env.defaultClinicId;
};
