import { PrismaClient } from "@prisma/client";

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

export const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
});
