import { addHours } from "../utils/date";
import { prisma } from "../db/prisma";

// Genera un OTP de 6 dígitos numéricos
function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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

  await prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  await prisma.emailVerificationToken.delete({ where: { token } });
  return record;
};

// ──────────────────────────────────────────────────────────────────────
// Recuperación de contraseña
// ──────────────────────────────────────────────────────────────────────
export const createPasswordReset = async (userId: string) => {
  const otp = generateOtp();
  const token = buildToken(userId, otp);

  // Eliminar resets anteriores del mismo usuario
  await prisma.passwordResetToken.deleteMany({ where: { userId } });

  const record = await prisma.passwordResetToken.create({
    data: {
      userId,
      token,
      expiresAt: addHours(2)
    }
  });

  return { ...record, otp };
};

export const consumePasswordReset = async (userId: string, otp: string) => {
  const token = buildToken(userId, otp);
  const record = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!record || record.expiresAt < new Date()) {
    return null;
  }

  await prisma.passwordResetToken.delete({ where: { token } });
  return record;
};
