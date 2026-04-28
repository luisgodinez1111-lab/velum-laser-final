import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { logger } from "../utils/logger";

// SQLSTATE codes que disparan tagging RLS:
//   42501 — insufficient_privilege (policy USING denegó SELECT/UPDATE/DELETE)
//   23514 — check_violation (puede dispararse por WITH CHECK en INSERT/UPDATE)
//   28000 — invalid_authorization_specification (rol sin permisos)
const RLS_RELATED_SQLSTATES = new Set(["42501", "23514", "28000"]);

// Mensajes de Postgres que indican RLS aún sin SQLSTATE típico
const RLS_MESSAGE_PATTERNS = [
  /row.{1,15}security/i,
  /policy.{1,30}for.{1,30}table/i,
  /new row violates row-level security/i,
  /permission denied for table/i,
];

// Contador in-memory con ventana deslizante de 5 min
type RlsErrorEvent = { ts: number; sqlstate: string; path: string; tenantId?: string };
const rlsErrorEvents: RlsErrorEvent[] = [];
const WINDOW_MS = 5 * 60 * 1000;

const pruneOldEvents = (now: number): void => {
  const cutoff = now - WINDOW_MS;
  while (rlsErrorEvents.length > 0 && rlsErrorEvents[0].ts < cutoff) {
    rlsErrorEvents.shift();
  }
};

export const getRlsErrorStats = (): {
  totalLast5Min: number;
  byPath: Record<string, number>;
  bySqlstate: Record<string, number>;
} => {
  const now = Date.now();
  pruneOldEvents(now);
  const byPath: Record<string, number> = {};
  const bySqlstate: Record<string, number> = {};
  for (const ev of rlsErrorEvents) {
    byPath[ev.path] = (byPath[ev.path] ?? 0) + 1;
    bySqlstate[ev.sqlstate] = (bySqlstate[ev.sqlstate] ?? 0) + 1;
  }
  return { totalLast5Min: rlsErrorEvents.length, byPath, bySqlstate };
};

const extractSqlstate = (err: unknown): string | null => {
  // PrismaClientKnownRequestError → meta.code suele tener el SQLSTATE crudo
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = err.meta as { code?: string } | undefined;
    if (meta?.code && /^[0-9A-Z]{5}$/.test(meta.code)) return meta.code;
    // Algunos códigos Prisma son indicativos: P2010 (raw query failed)
    // pero el sqlstate real está en meta.code o en el mensaje
  }
  // Errores raw: a veces llegan como objeto plano con `code`
  const candidate = (err as { code?: unknown })?.code;
  if (typeof candidate === "string" && /^[0-9A-Z]{5}$/.test(candidate)) return candidate;
  return null;
};

const isRlsError = (err: unknown): { matched: boolean; sqlstate: string } => {
  const sqlstate = extractSqlstate(err);
  if (sqlstate && RLS_RELATED_SQLSTATES.has(sqlstate)) {
    return { matched: true, sqlstate };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (RLS_MESSAGE_PATTERNS.some((re) => re.test(msg))) {
    return { matched: true, sqlstate: sqlstate ?? "UNKNOWN" };
  }
  return { matched: false, sqlstate: "" };
};

/**
 * Middleware error handler que detecta errores relacionados con Row Level
 * Security y los etiqueta `[RLS-ERROR]` en logs + actualiza contador in-memory.
 * NO consume el error — siempre llama next(err) para que el errorHandler
 * principal responda al cliente normalmente.
 *
 * Debe registrarse ANTES de `errorHandler` en la cadena de middlewares.
 */
export const rlsErrorLogger = (
  err: Error,
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const { matched, sqlstate } = isRlsError(err);
  if (matched) {
    const reqWithTenant = req as Request & { tenantId?: string };
    const event: RlsErrorEvent = {
      ts: Date.now(),
      sqlstate,
      path: req.path,
      tenantId: reqWithTenant.tenantId,
    };
    rlsErrorEvents.push(event);
    pruneOldEvents(event.ts);

    logger.error(
      {
        err,
        sqlstate,
        path: req.path,
        method: req.method,
        tenantId: reqWithTenant.tenantId,
        requestId: req.headers["x-request-id"],
        rlsErrorsLast5Min: rlsErrorEvents.length,
      },
      "[RLS-ERROR] Postgres rechazó query por policy",
    );
  }
  next(err);
};
