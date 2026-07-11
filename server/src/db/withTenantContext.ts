import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { prismaSystem } from "./prismaSystem";
import { env } from "../utils/env";
import { getTenantId, runInTenantTx, runAsSystem } from "../utils/tenantContext";

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

  // Kill switch de emergencia: bypass total aún con rlsEnforce=true.
  // Enruta por `prismaSystem` (conexión owner/BYPASSRLS) — NO por `prisma`
  // (app_user), porque bajo policies fail-closed app_user sin app.tenant_id ve
  // 0 filas: correr como owner es lo único que ignora RLS de verdad. Si
  // SYSTEM_DATABASE_URL no está seteada, prismaSystem === prisma (irrelevante,
  // porque sin esa URL tampoco hay fail-closed activo).
  if (env.rlsBypassEmergency) {
    return fn(prismaSystem as unknown as Prisma.TransactionClient);
  }

  // Si RLS está apagado o no hay contexto, ejecuta fn con el cliente normal
  // — pasar `prisma` directamente cumple el tipo `TransactionClient`.
  if (!env.rlsEnforce || !tenantId) {
    return fn(prisma as unknown as Prisma.TransactionClient);
  }

  // runInTenantTx marca este scope como "con SET LOCAL activo" para que el hook
  // de auditoría en prisma.ts NO lo reporte como query sin contexto.
  return runInTenantTx(() =>
    prisma.$transaction(async (tx) => {
      // set_config(name, value, is_local) — equivalente a SET LOCAL pero usable
      // dentro de una expression. is_local=true: el setting expira al cerrar tx.
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    }),
  );
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

/**
 * Como withTenantContext, pero SIEMPRE abre una transacción — aunque RLS esté
 * apagado. Úsalo para bloques multi-statement que deben ser atómicos con
 * independencia de RLS (p.ej. crear Lead + MarketingAttribution juntos).
 *
 * A diferencia de withTenantContext/withExplicitTenant (que en el fallback
 * RLS-off corren `fn(prisma)` sin transacción), aquí la atomicidad se preserva
 * siempre. El `SET LOCAL app.tenant_id` solo se emite cuando `rlsEnforce` y hay
 * tenantId; el resto del tiempo es una transacción normal.
 */
export function withTenantTransaction<T>(
  tenantId: string | undefined,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  // Kill switch: transacciona sobre la conexión owner (BYPASSRLS) para ignorar
  // RLS de verdad bajo fail-closed (ver nota en withTenantContext).
  if (env.rlsBypassEmergency) {
    return prismaSystem.$transaction((tx) => fn(tx));
  }
  return runInTenantTx(() =>
    prisma.$transaction(async (tx) => {
      if (env.rlsEnforce && tenantId) {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      }
      return fn(tx);
    }),
  );
}

/**
 * Ejecuta `fn` DECLARANDO intención cross-tenant: corre SIN app.tenant_id.
 *
 * Úsalo únicamente cuando la operación no puede conocer el tenant todavía o
 * necesita cruzar tenants a propósito:
 *   - (B) pre-auth: buscar user por email global en login/reset.
 *   - (C) público/webhook: resolver el tenant desde un recurso por id/token
 *         (p.ej. localizar el Payment/CustomCharge de un evento Stripe) para
 *         luego continuar con `withExplicitTenant(clinicId, …)`.
 *   - (D) jobs/crons: listar todos los tenants antes de iterar cada uno.
 *
 * Corre contra `prismaSystem` — la conexión PRIVILEGIADA (rol con BYPASSRLS,
 * p.ej. neondb_owner vía SYSTEM_DATABASE_URL). Ese rol ignora las policies RLS,
 * así que resuelve recursos cross-tenant sin `app.tenant_id` incluso bajo
 * fail-closed (Etapa 4). Si SYSTEM_DATABASE_URL no está seteado, `prismaSystem`
 * es el cliente normal (app_user) — seguro mientras la policy tenga fallback
 * permisivo (pre-Etapa 4) y en tests.
 *
 * Marca `runAsSystem` para que el hook de auditoría no lo reporte como wrap
 * olvidado. Úsalo SOLO para reads-resolver/mantenimiento cross-tenant; las
 * escrituras tenant-scoped van por withExplicitTenant (app_user + tenant).
 */
export function withSystemContext<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return runAsSystem(() => fn(prismaSystem as unknown as Prisma.TransactionClient));
}
