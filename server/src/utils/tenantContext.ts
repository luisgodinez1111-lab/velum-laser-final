import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contexto de tenant propagado a través del request.
 *
 * Reglas:
 *   - Todo controller/service que toque datos tenant-scoped DEBE leer el
 *     tenantId desde aquí, no desde body/query/params del cliente.
 *   - Si `getTenantId()` devuelve undefined fuera de un request (jobs, crons,
 *     scripts CLI), el caller debe envolver su trabajo en `runWithTenant()`.
 *   - Una vez activo RLS (Fase 0.4), Postgres bloqueará queries sin
 *     `app.tenant_id` seteado, así que olvidar este contexto = error explícito,
 *     no leak silencioso.
 */
export type TenantContext = {
  tenantId: string;
  userId?: string;
  role?: string;
  /** Origen del tenantId — útil para auditoría y debugging. */
  source: "jwt" | "host" | "system" | "test";
};

const storage = new AsyncLocalStorage<TenantContext>();

/** Devuelve el contexto actual o `undefined` si no hay request activo. */
export const getTenantContext = (): TenantContext | undefined => storage.getStore();

/** Atajo para el caso más común: leer el tenantId. */
export const getTenantId = (): string | undefined => storage.getStore()?.tenantId;

/**
 * Lee tenantId, lanza si no hay contexto. Usar en código que SIEMPRE corre
 * dentro de un request autenticado.
 */
export const requireTenantId = (): string => {
  const tenantId = getTenantId();
  if (!tenantId) {
    throw new Error(
      "Tenant context missing — toda operación tenant-scoped debe correr dentro de runWithTenant() o un request autenticado",
    );
  }
  return tenantId;
};

/**
 * Ejecuta `fn` con el contexto de tenant dado. Use desde middlewares HTTP,
 * workers de cola, crons y scripts CLI.
 */
export const runWithTenant = <T>(ctx: TenantContext, fn: () => T): T => storage.run(ctx, fn);
