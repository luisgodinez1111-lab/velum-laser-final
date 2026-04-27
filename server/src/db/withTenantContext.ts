import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { env } from "../utils/env";
import { getTenantId } from "../utils/tenantContext";

/**
 * Ejecuta `fn` dentro de una transacción Postgres con `app.tenant_id` seteado
 * para que las RLS policies aplicadas en la migración 0.4 filtren correctamente.
 *
 * Patrón de uso:
 *
 *   await withTenantContext(async (tx) => {
 *     return tx.user.findMany();      // RLS aplica
 *   });
 *
 * Comportamiento:
 *   - Si `RLS_ENFORCE=false` (default actual) o no hay tenantContext, ejecuta
 *     `fn` con el cliente Prisma normal — sin overhead de transacción.
 *   - Si `RLS_ENFORCE=true` y hay tenantContext, abre transacción interactiva,
 *     ejecuta `set_config('app.tenant_id', <id>, true)` y luego `fn(tx)`.
 *     `is_local=true` hace que el GUC se libere al cerrar la tx.
 *
 * Limitación actual:
 *   Hoy la app conecta como `postgres` (superuser) — Postgres BYPASSEA RLS para
 *   superusers. Eso significa que `RLS_ENFORCE=true` setea el GUC pero las
 *   policies no filtran. La activación real ocurrirá en Fase 1 cuando creemos
 *   rol `app_user` no-superuser y cambiemos la connection string.
 *
 * Why $transaction y no $extends:
 *   Prisma `$extends({ query })` no garantiza que el SET LOCAL y el query del
 *   usuario corran en la misma conexión. La única forma robusta de que ambos
 *   compartan conexión es una transacción interactiva.
 */
export async function withTenantContext<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { tenantIdOverride?: string },
): Promise<T> {
  const tenantId = options?.tenantIdOverride ?? getTenantId();

  // Si RLS está apagado o no hay contexto, ejecuta fn con el cliente normal
  // — pasar `prisma` directamente cumple el tipo `TransactionClient`.
  if (!env.rlsEnforce || !tenantId) {
    return fn(prisma as unknown as Prisma.TransactionClient);
  }

  return prisma.$transaction(async (tx) => {
    // set_config(name, value, is_local) — equivalente a SET LOCAL pero usable
    // dentro de una expression. is_local=true: el setting expira al cerrar tx.
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

/**
 * Versión para jobs/crons que no tienen tenantContext de un request.
 * El caller PROVEE el tenantId explícitamente. Útil para iterar sobre todos
 * los tenants en un cron.
 */
export const withExplicitTenant = <T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => withTenantContext(fn, { tenantIdOverride: tenantId });
