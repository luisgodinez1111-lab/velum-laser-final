import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../utils/auth";
import { env } from "../utils/env";
import { prisma } from "../db/prisma";
import { runWithTenant } from "../utils/tenantContext";

export type AuthRequest = Request & {
  user?: { id: string; role: string };
  tenantId?: string;
};

// ── Caché de validación de usuarios (TTL: 30s) ────────────────────────────────
// Reduce una query DB por cada request autenticado.
// TTL corto garantiza que cambios de contraseña/desactivación se reflejan rápido.
type CachedUserAuth = { passwordChangedAt: Date | null; isActive: boolean; clinicId: string; cachedAt: number };
const userAuthCache = new Map<string, CachedUserAuth>();
const AUTH_CACHE_TTL_MS = 30_000;

const getCachedUserAuth = (userId: string): CachedUserAuth | null => {
  const cached = userAuthCache.get(userId);
  if (!cached || Date.now() - cached.cachedAt > AUTH_CACHE_TTL_MS) {
    userAuthCache.delete(userId);
    return null;
  }
  return cached;
};

const setCachedUserAuth = (
  userId: string,
  data: { passwordChangedAt: Date | null; isActive: boolean; clinicId: string },
): void => {
  userAuthCache.set(userId, { ...data, cachedAt: Date.now() });
};

/** Invalida la caché de un usuario (llamar tras cambio de contraseña o desactivación). */
export const invalidateUserAuthCache = (userId: string): void => {
  userAuthCache.delete(userId);
};

// Limpieza periódica para evitar memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of userAuthCache.entries()) {
    if (now - val.cachedAt > AUTH_CACHE_TTL_MS) userAuthCache.delete(key);
  }
}, 60_000).unref();

const getToken = (req: Request) => req.cookies?.[env.cookieName] ?? req.headers.authorization?.replace("Bearer ", "");

// ── Resultado de validación de token ─────────────────────────────────────────
type TokenValidationResult =
  | { ok: true; userId: string; role: string; tenantId: string }
  | { ok: false; reason: "missing" | "invalid" | "inactive" | "expired" };

/**
 * Valida el token JWT de la request: verifica firma, estado activo del usuario,
 * y que el token sea posterior al último cambio de contraseña.
 * Compartido entre requireAuth y optionalAuth para evitar duplicación.
 */
const validateAuthToken = async (req: Request): Promise<TokenValidationResult> => {
  const token = getToken(req);
  if (!token) return { ok: false, reason: "missing" };

  try {
    const payload = verifyToken(token);

    let userAuth = getCachedUserAuth(payload.sub);
    if (!userAuth) {
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { passwordChangedAt: true, isActive: true, clinicId: true },
      });
      if (dbUser) {
        setCachedUserAuth(payload.sub, dbUser);
        userAuth = { ...dbUser, cachedAt: Date.now() };
      }
    }
    if (!userAuth || userAuth.isActive === false) return { ok: false, reason: "inactive" };
    if (payload.iat !== undefined && userAuth.passwordChangedAt) {
      const changedAtSec = Math.floor(userAuth.passwordChangedAt.getTime() / 1000);
      if (payload.iat < changedAtSec) return { ok: false, reason: "expired" };
    }

    return { ok: true, userId: payload.sub, role: payload.role, tenantId: userAuth.clinicId };
  } catch {
    return { ok: false, reason: "invalid" };
  }
};

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const result = await validateAuthToken(req);
  if (!result.ok) {
    const message = result.reason === "expired"
      ? "Sesión expirada. Inicia sesión de nuevo."
      : "No autorizado";
    return res.status(401).json({ message });
  }
  req.user = { id: result.userId, role: result.role };
  req.tenantId = result.tenantId;
  // Propaga el tenant context a todo el resto del request — controllers, services
  // y queries Prisma que corran dentro pueden leerlo vía getTenantId() sin
  // pasarlo por parámetros. Imprescindible para Fase 0.4 (RLS).
  return runWithTenant(
    { tenantId: result.tenantId, userId: result.userId, role: result.role, source: "jwt" },
    () => next(),
  );
};

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const result = await validateAuthToken(req);
  if (!result.ok) return next();
  req.user = { id: result.userId, role: result.role };
  req.tenantId = result.tenantId;
  return runWithTenant(
    { tenantId: result.tenantId, userId: result.userId, role: result.role, source: "jwt" },
    () => next(),
  );
};

export const requireRole = (roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: "No autorizado" });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: "Acceso denegado" });
  }
  return next();
};
