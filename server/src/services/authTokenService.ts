/**
 * Servicio de tokens de refresco y historial de contraseñas.
 * Responsabilidades: ciclo de vida de refresh tokens (crear, rotar, revocar)
 * y gestión de historial de contraseñas (evitar reutilización).
 *
 * Extraído de utils/auth.ts — los imports existentes siguen funcionando
 * gracias a los re-exports en ese archivo.
 */
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { env } from "../utils/env";
import { logger } from "../utils/logger";

// ── Refresh token helpers ────────────────────────────────────────────────────
// Raw token is sent to client; only SHA-256 hash is stored in DB.
const hashRawToken = (raw: string): string =>
  crypto.createHash("sha256").update(raw).digest("hex");

const MAX_REFRESH_TOKENS_PER_USER = 5; // max concurrent sessions

export const createRefreshToken = async (userId: string): Promise<string> => {
  const raw = crypto.randomBytes(40).toString("hex");
  const tokenHash = hashRawToken(raw);
  const expiresAt = new Date(Date.now() + env.refreshTokenExpiresDays * 86_400_000);

  // Evict oldest tokens exceeding per-user limit
  const existing = await prisma.refreshToken.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing.length >= MAX_REFRESH_TOKENS_PER_USER) {
    const toDelete = existing.slice(0, existing.length - (MAX_REFRESH_TOKENS_PER_USER - 1));
    await prisma.refreshToken.deleteMany({ where: { id: { in: toDelete.map((t) => t.id) } } });
  }

  await prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  return raw;
};

export const rotateRefreshToken = async (
  rawToken: string
): Promise<{ userId: string; newRaw: string } | null> => {
  const tokenHash = hashRawToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    // Token not found — could be reuse of an already-rotated token (token theft).
    return null;
  }

  if (existing.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { tokenHash } }).catch((err: unknown) => {
      logger.warn({ userId: existing.userId, err }, "[auth] no se pudo eliminar refresh token expirado");
    });
    return null;
  }

  // Atomic rotation: delete old → create new in a single transaction
  const newRaw = crypto.randomBytes(40).toString("hex");
  const newHash = hashRawToken(newRaw);
  const expiresAt = new Date(Date.now() + env.refreshTokenExpiresDays * 86_400_000);

  try {
    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { tokenHash } }),
      prisma.refreshToken.create({ data: { userId: existing.userId, tokenHash: newHash, expiresAt } }),
    ]);
  } catch {
    // Concurrent rotation (race condition) — posible reutilización o robo
    logger.warn({ userId: existing.userId }, "[auth] token rotation conflict — possible token reuse or theft");
    return null;
  }

  return { userId: existing.userId, newRaw };
};

export const revokeRefreshToken = async (rawToken: string): Promise<void> => {
  const tokenHash = hashRawToken(rawToken);
  await prisma.refreshToken.deleteMany({ where: { tokenHash } });
};

export const revokeAllRefreshTokens = async (userId: string): Promise<void> => {
  await prisma.refreshToken.deleteMany({ where: { userId } });
};

// ── Password history ─────────────────────────────────────────────────────────
const PASSWORD_HISTORY_DEPTH = 5; // prevent reuse of last 5 passwords

export const recordPasswordHistory = async (userId: string, passwordHash: string): Promise<void> => {
  try {
    await prisma.passwordHistory.create({ data: { userId, passwordHash } });
    // Purge oldest entries beyond the history depth
    const entries = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (entries.length > PASSWORD_HISTORY_DEPTH) {
      const toDelete = entries.slice(PASSWORD_HISTORY_DEPTH).map((e) => e.id);
      await prisma.passwordHistory.deleteMany({ where: { id: { in: toDelete } } });
    }
  } catch (err) {
    logger.warn({ userId, err }, "[auth] recordPasswordHistory falló");
  }
};

export const isPasswordReused = async (userId: string, newPassword: string): Promise<boolean> => {
  try {
    const history = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: PASSWORD_HISTORY_DEPTH,
      select: { passwordHash: true },
    });
    for (const entry of history) {
      if (await bcrypt.compare(newPassword, entry.passwordHash)) return true;
    }
  } catch (err) {
    logger.warn({ userId, err }, "[auth] isPasswordReused falló");
  }
  return false;
};
