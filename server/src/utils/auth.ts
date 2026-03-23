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
