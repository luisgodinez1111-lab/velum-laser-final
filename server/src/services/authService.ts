import { randomBytes } from "crypto";
import { addHours } from "../utils/date";
import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { generateOtp } from "../utils/crypto";

// El token almacenado en DB combina userId + OTP para garantizar unicidad
function buildToken(userId: string, otp: string): string {
  return `${userId}|${otp}`;
}

// ──────────────────────────────────────────────────────────────────────
// Verificación de correo
// ──────────────────────────────────────────────────────────────────────
export const createEmailVerification = async (userId: string) => {
  const otp = generateOtp();
  const token = buildToken(userId, otp);

  // Eliminar tokens anteriores del mismo usuario para evitar duplicados
  await prisma.emailVerificationToken.deleteMany({ where: { userId } });

  const record = await prisma.emailVerificationToken.create({
    data: {
      userId,
      token,
      expiresAt: addHours(24)
    }
  });

  return { ...record, otp };
};

export const consumeEmailVerification = async (userId: string, otp: string) => {
  const token = buildToken(userId, otp);
  const record = await prisma.emailVerificationToken.findUnique({ where: { token } });

  if (!record || record.expiresAt < new Date()) {
    return null;
  }

  await withTenantContext(async (tx) => tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }));
  await prisma.emailVerificationToken.delete({ where: { token } });
  return record;
};

// ──────────────────────────────────────────────────────────────────────
// Recuperación de contraseña
// ──────────────────────────────────────────────────────────────────────
export const createPasswordReset = async (userId: string) => {
  const token = randomBytes(32).toString("hex");

  // Eliminar resets anteriores del mismo usuario
  await prisma.passwordResetToken.deleteMany({ where: { userId } });

  const record = await prisma.passwordResetToken.create({
    data: {
      userId,
      token,
      expiresAt: addHours(2)
    }
  });

  return { ...record, token };
};

export const consumePasswordReset = async (token: string) => {
  const record = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!record || record.expiresAt < new Date()) {
    return null;
  }

  await prisma.passwordResetToken.delete({ where: { token } });
  return record;
};

// ──────────────────────────────────────────────────────────────────────
// OTP de firma de consentimiento informado
// ──────────────────────────────────────────────────────────────────────
export const createConsentOtp = async (userId: string) => {
  const otp = generateOtp();
  const token = buildToken(userId, otp);

  // Eliminar OTPs anteriores del mismo usuario
  await prisma.consentOtpToken.deleteMany({ where: { userId } });

  const record = await prisma.consentOtpToken.create({
    data: {
      userId,
      token,
      expiresAt: addHours(1)
    }
  });

  return { ...record, otp };
};

export const consumeConsentOtp = async (userId: string, otp: string) => {
  const token = buildToken(userId, otp);
  const record = await prisma.consentOtpToken.findUnique({ where: { token } });

  if (!record || record.expiresAt < new Date()) {
    return null;
  }

  await prisma.consentOtpToken.delete({ where: { token } });
  return record;
};
