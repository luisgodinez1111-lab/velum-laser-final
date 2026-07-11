import { PrismaClient } from "@prisma/client";
import { isInTenantTx, isInSystemCtx } from "../utils/tenantContext";
import { logger } from "../utils/logger";

// Ajuste del pool + compatibilidad con PgBouncer (endpoint pooled de Neon).
//
// - connection_limit: conexiones simultáneas por proceso. Con el endpoint
//   pooled de Neon (`-pooler` = PgBouncer en transaction mode) conviene un
//   límite BAJO por instancia y dejar que el pooler multiplexe; sin pooler se
//   mantiene el 10 previo. Override vía DB_CONNECTION_LIMIT.
// - pool_timeout=20: segundos a esperar una conexión libre antes de lanzar.
// - pgbouncer=true: OBLIGATORIO con el endpoint pooled — deshabilita los
//   prepared statements de Prisma; sin él aparecen errores
//   `prepared statement "s0" already exists` bajo concurrencia.
const RAW_DATABASE_URL = process.env.DATABASE_URL ?? "";
const isPooled = RAW_DATABASE_URL.includes("-pooler");
const connectionLimit = process.env.DB_CONNECTION_LIMIT ?? (isPooled ? "5" : "10");

// Agrega un query param solo si aún no está presente (idempotente).
const withParam = (url: string, key: string, value: string): string =>
  new RegExp(`[?&]${key}=`).test(url)
    ? url
    : `${url}${url.includes("?") ? "&" : "?"}${key}=${value}`;

let dbUrl = withParam(RAW_DATABASE_URL, "connection_limit", connectionLimit);
dbUrl = withParam(dbUrl, "pool_timeout", "20");
if (isPooled) dbUrl = withParam(dbUrl, "pgbouncer", "true");

const basePrisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
});

// ── Auditoría RLS (Etapa 2 del plan de multi-tenancy) ────────────────────────
// Con RLS_AUDIT=true (o RLS_ENFORCE=true), loggea UNA vez por (modelo, operación)
// cada query de modelo que corre FUERA de withTenantContext — es decir, sin
// SET LOCAL app.tenant_id. Son las candidatas a fail-closed cuando se quite el
// fallback permisivo (Etapa 4). NO cambia comportamiento: pura observabilidad.
// Se puede activar incluso en prod (solo genera warnings) para mapear los
// call-sites reales en tráfico vivo, sin riesgo.
const RLS_AUDIT = process.env.RLS_AUDIT === "true" || process.env.RLS_ENFORCE === "true";
const warnedDirectQueries = new Set<string>();

// El $extends solo agrega un hook de observabilidad (no nueva API). Casteamos de
// vuelta a PrismaClient para que el resto del código vea el tipo familiar; en
// runtime el cliente extendido (con el hook) es el que se usa.
export const prisma = basePrisma.$extends({
  name: "rls-audit",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // Se contabiliza como "OK" si corre dentro de withTenantContext (SET LOCAL)
        // o dentro de withSystemContext (cross-tenant intencional). Lo demás es un
        // wrap olvidado — candidato a fail-closed en Etapa 4.
        if (RLS_AUDIT && !isInTenantTx() && !isInSystemCtx()) {
          const key = `${model ?? "raw"}.${operation}`;
          if (!warnedDirectQueries.has(key)) {
            warnedDirectQueries.add(key);
            logger.warn({ model, operation }, "[rls-audit] query sin withTenantContext/withSystemContext — candidata a envolver para Etapa 4");
          }
        }
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;
