import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "./env";

// Refresh token y password history delegados al servicio especializado.
// Re-exportados aquí para no romper imports existentes en controllers.
export {
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  recordPasswordHistory,
  isPasswordReused,
} from "../services/authTokenService";

export const hashPassword = async (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = async (password: string, hash: string) => bcrypt.compare(password, hash);

/** Valida fortaleza de contraseña. Retorna mensaje de error o null si es válida. */
export const validatePasswordStrength = (password: string): string | null => {
  if (password.length < 12) return "La contraseña debe tener al menos 12 caracteres";
  if (!/[A-Z]/.test(password)) return "Debe incluir al menos una letra mayúscula";
  if (!/[a-z]/.test(password)) return "Debe incluir al menos una letra minúscula";
  if (!/[0-9]/.test(password)) return "Debe incluir al menos un número";
  if (!/[^A-Za-z0-9]/.test(password)) return "Debe incluir al menos un símbolo";
  return null;
};

/** Genera contraseña temporal segura de 12 caracteres. */
export const generateTempPassword = (): string => {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '@#$!';
  const pool    = upper + lower + digits + special;
  const arr = Array.from({ length: 12 }, () => pool[crypto.randomInt(pool.length)]);
  arr[0] = upper[crypto.randomInt(upper.length)];
  arr[1] = lower[crypto.randomInt(lower.length)];
  arr[2] = digits[crypto.randomInt(digits.length)];
  arr[3] = special[crypto.randomInt(special.length)];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
};

export const signToken = (payload: object) =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] });

export const verifyToken = (token: string) => jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as {
  sub: string;
  role: string;
  iat: number;
};

