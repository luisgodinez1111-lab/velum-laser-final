import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "./env";
import { prisma } from "../db/prisma";

export const hashPassword = async (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = async (password: string, hash: string) => bcrypt.compare(password, hash);

export const signToken = (payload: object) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] });

export const verifyToken = (token: string) => jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as {
  sub: string;
  role: string;
  iat: number;
};

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
    // Revoke ALL tokens for the user if we can detect the userId via a different mechanism.
    // Here we can't know the userId, so we just return null and let the caller clear cookies.
    return null;
  }

  if (existing.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { tokenHash } }).catch(() => {});
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
    // Concurrent rotation (race condition) — token already consumed, treat as invalid
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
// NOTE: requires running `prisma generate` after applying migration 20260323000000_add_password_history
const PASSWORD_HISTORY_DEPTH = 5; // prevent reuse of last 5 passwords

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const passwordHistoryDelegate = (): any => (prisma as unknown as Record<string, unknown>).passwordHistory;

export const recordPasswordHistory = async (userId: string, passwordHash: string): Promise<void> => {
  const delegate = passwordHistoryDelegate();
  if (!delegate) return; // model not yet migrated
  try {
    await delegate.create({ data: { userId, passwordHash } });
    // Purge oldest entries beyond the history depth
    const entries: { id: string }[] = await delegate.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (entries.length > PASSWORD_HISTORY_DEPTH) {
      const toDelete = entries.slice(PASSWORD_HISTORY_DEPTH).map((e: { id: string }) => e.id);
      await delegate.deleteMany({ where: { id: { in: toDelete } } });
    }
  } catch {
    // Non-fatal: history table may not exist until migration runs
  }
};

export const isPasswordReused = async (userId: string, newPassword: string): Promise<boolean> => {
  const delegate = passwordHistoryDelegate();
  if (!delegate) return false; // model not yet migrated — allow any password
  try {
    const history: { passwordHash: string }[] = await delegate.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: PASSWORD_HISTORY_DEPTH,
      select: { passwordHash: true },
    });
    for (const entry of history) {
      const match = await bcrypt.compare(newPassword, entry.passwordHash);
      if (match) return true;
    }
  } catch {
    // Non-fatal: history table may not exist until migration runs
  }
  return false;
};
