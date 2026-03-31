/**
 * loginSecurityService.ts — Protección contra fuerza bruta en el login.
 *
 * Estrategia dual:
 *   1. Fast-path en memoria: evita la DB en requests sucesivos durante el lockout.
 *   2. DB como source of truth: persiste entre reinicios del servidor.
 *
 * Extraído de authController para que sea testeable de forma aislada y reutilizable.
 */
import { prisma } from "../db/prisma";

export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutos

// Mapa en memoria — fast-path + permite forzar lockout en tests sin DB
const inMemoryLockout = new Map<string, number>(); // email → expiresAt (ms)

/** Helper de tests: fuerza lockout en memoria para un email dado. No usar en producción. */
export const _forceLoginLockout = (email: string): void => {
  inMemoryLockout.set(email.toLowerCase(), Date.now() + LOGIN_LOCKOUT_MS);
};

/**
 * Verifica si la cuenta está bloqueada por exceso de intentos fallidos.
 * Consulta primero el mapa en memoria y luego la DB como fuente de verdad.
 */
export const isAccountLocked = async (email: string): Promise<boolean> => {
  const key = email.toLowerCase();

  // Fast-path: mapa en memoria
  const memExpiry = inMemoryLockout.get(key);
  if (memExpiry !== undefined) {
    if (Date.now() < memExpiry) return true;
    inMemoryLockout.delete(key);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: key },
      select: { loginLockedUntil: true },
    });
    if (!user?.loginLockedUntil) return false;
    if (user.loginLockedUntil > new Date()) return true;
    // Lockout expirado — limpiar en background
    await prisma.user.update({
      where: { email: key },
      data: { loginLockedUntil: null, loginFailedCount: 0 },
    }).catch(() => {});
    return false;
  } catch {
    return false;
  }
};

/**
 * Registra un intento fallido de login. Si se alcanza el límite, activa el lockout.
 */
export const recordLoginFailure = async (email: string): Promise<void> => {
  try {
    const user = await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { loginFailedCount: { increment: 1 } },
      select: { loginFailedCount: true },
    });
    if (user.loginFailedCount >= LOGIN_MAX_FAILURES) {
      const expiresAt = new Date(Date.now() + LOGIN_LOCKOUT_MS);
      await prisma.user.update({
        where: { email: email.toLowerCase() },
        data: { loginLockedUntil: expiresAt },
      });
      // Sincronizar fast-path en memoria
      inMemoryLockout.set(email.toLowerCase(), expiresAt.getTime());
    }
  } catch { /* usuario no encontrado — ignorar */ }
};

/**
 * Limpia el contador de fallos tras un login exitoso.
 */
export const clearLoginFailures = async (email: string): Promise<void> => {
  inMemoryLockout.delete(email.toLowerCase());
  await prisma.user.updateMany({
    where: { email: email.toLowerCase() },
    data: { loginFailedCount: 0, loginLockedUntil: null },
  }).catch(() => {});
};
