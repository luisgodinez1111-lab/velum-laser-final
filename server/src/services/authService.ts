import { addHours } from "../utils/date";
import { prisma } from "../db/prisma";
import crypto from "crypto";

export const createEmailVerification = async (userId: string) => {
  const token = crypto.randomBytes(32).toString("hex");
  return prisma.emailVerificationToken.create({
    data: {
      userId,
      token,
      expiresAt: addHours(24)
    }
  });
};

export const consumeEmailVerification = async (token: string) => {
  const record = await prisma.emailVerificationToken.findUnique({ where: { token } });
  if (!record || record.expiresAt < new Date()) {
    return null;
  }
  await prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  await prisma.emailVerificationToken.delete({ where: { token } });
  return record;
};

export const createPasswordReset = async (userId: string) => {
  const token = crypto.randomBytes(32).toString("hex");
  return prisma.passwordResetToken.create({
    data: {
      userId,
      token,
      expiresAt: addHours(2)
    }
  });
};

export const consumePasswordReset = async (token: string) => {
  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.expiresAt < new Date()) {
    return null;
  }
  await prisma.passwordResetToken.delete({ where: { token } });
  return record;
};
