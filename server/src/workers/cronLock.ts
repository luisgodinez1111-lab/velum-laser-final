import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";

/**
 * Leader election trivial para crons en múltiples workers.
 *
 * Estrategia: cada cron name se mapea a un bigint determinístico (hash) y se
 * intenta tomar `pg_try_advisory_lock(key)`. Solo UN worker en todo el cluster
 * puede tener el lock en cada instante. Si lo tomas → ejecutas. Si no → otro
 * worker lo está corriendo, salida silenciosa.
 *
 * Por qué session-level y no xact-level:
 *   pg_advisory_xact_lock se libera al COMMIT. Para crons largos sin tx
 *   explícita, session-level es más apropiado — lo liberamos manualmente
 *   en el `finally`.
 *
 * Hoy hay 1 worker → el lock siempre se toma. Mañana, si escalamos a N
 * workers, esto Just Works™ sin cambiar el código.
 */

/**
 * Hash determinístico de un name → bigint para pg_advisory_lock.
 * FNV-1a 64-bit, suficiente para evitar colisiones entre los pocos crons
 * que tenemos (< 100).
 */
function nameToLockKey(name: string): bigint {
  // FNV-1a 64-bit constants
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK_64 = 0xffffffffffffffffn;
  let hash = FNV_OFFSET;
  for (let i = 0; i < name.length; i++) {
    hash = (hash ^ BigInt(name.charCodeAt(i))) & MASK_64;
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  // pg_advisory_lock acepta bigint con signo — convertir a rango [-2^63, 2^63-1].
  const SIGNED_MAX = 0x7fffffffffffffffn;
  return hash > SIGNED_MAX ? hash - (1n << 64n) : hash;
}

/**
 * Ejecuta `fn` solo si este proceso obtiene el advisory lock para `name`.
 * Si otro worker lo tiene, devuelve `false` sin ejecutar.
 *
 * Uso:
 *   await withCronLock("payment-reminder", async () => {
 *     await sendPendingReminders();
 *   });
 */
export async function withCronLock(name: string, fn: () => Promise<void>): Promise<boolean> {
  const key = nameToLockKey(name);
  const result = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_lock(${key}::bigint) AS acquired
  `;
  const acquired = result[0]?.acquired === true;
  if (!acquired) {
    logger.debug({ cron: name }, "[cron-lock] otro worker tiene el lock — skip");
    return false;
  }

  try {
    await fn();
    return true;
  } finally {
    // Liberar siempre, incluso si fn lanzó.
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${key}::bigint)`.catch((err) => {
      logger.warn({ err, cron: name }, "[cron-lock] failed to release advisory lock");
    });
  }
}
