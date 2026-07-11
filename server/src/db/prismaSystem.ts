import { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Cliente Prisma PRIVILEGIADO para operaciones cross-tenant intencionales
 * (las que hace `withSystemContext`): resolver login por email global, localizar
 * el recurso de un webhook por id/token, barridos de mantenimiento, etc.
 *
 * Debe apuntar (vía SYSTEM_DATABASE_URL) a un rol con BYPASSRLS — en Neon,
 * `neondb_owner`. Ese rol IGNORA las policies RLS, así que puede leer/mantener
 * datos sin `app.tenant_id` seteado incluso bajo fail-closed (Etapa 4).
 *
 * Fallback seguro: si SYSTEM_DATABASE_URL NO está seteado, se reexporta el
 * cliente normal (`prisma`, rol app_user). Esto mantiene el comportamiento
 * actual mientras la policy aún tenga fallback permisivo (pre-Etapa 4) y en los
 * tests (que mockean `prisma`). El orden de despliegue de Etapa 4 exige setear
 * SYSTEM_DATABASE_URL ANTES de aplicar la migración fail-closed.
 *
 * ⚠️  Este cliente BYPASSEA RLS. Úsalo EXCLUSIVAMENTE desde withSystemContext.
 *     Jamás para queries tenant-scoped de un request — sería una fuga total.
 */
const SYSTEM_URL = process.env.SYSTEM_DATABASE_URL;

// Mismos ajustes de pool/PgBouncer que db/prisma.ts, pero con un límite bajo:
// la ruta system es de bajo tráfico (resolvers puntuales).
const withParam = (url: string, key: string, value: string): string =>
  new RegExp(`[?&]${key}=`).test(url)
    ? url
    : `${url}${url.includes("?") ? "&" : "?"}${key}=${value}`;

const buildSystemClient = (rawUrl: string): PrismaClient => {
  const isPooled = rawUrl.includes("-pooler");
  const connectionLimit = process.env.SYSTEM_DB_CONNECTION_LIMIT ?? "3";
  let url = withParam(rawUrl, "connection_limit", connectionLimit);
  url = withParam(url, "pool_timeout", "20");
  if (isPooled) url = withParam(url, "pgbouncer", "true");
  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["warn", "error"],
  });
};

export const prismaSystem: PrismaClient = SYSTEM_URL
  ? buildSystemClient(SYSTEM_URL)
  : prisma;

/** true si hay una conexión privilegiada real (no el fallback a app_user). */
export const hasSystemConnection = (): boolean => Boolean(SYSTEM_URL);
