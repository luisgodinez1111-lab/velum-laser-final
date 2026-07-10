import { randomBytes } from "crypto";
import { addHours } from "../utils/date";
import { withSystemContext, withExplicitTenant } from "../db/withTenantContext";
import { generateOtp } from "../utils/crypto";
import { getTenantIdOr } from "../utils/tenantContext";
import { env } from "../utils/env";

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

  // Pre-auth: tenant conocido (default) → withExplicitTenant. deleteMany+create
  // en una tx atómica.
  const tenantId = getTenantIdOr(env.defaultClinicId);
  const record = await withExplicitTenant(tenantId, async (tx) => {
    await tx.emailVerificationToken.deleteMany({ where: { userId } });
    return tx.emailVerificationToken.create({
      data: { userId, token, expiresAt: addHours(24), tenantId },
    });
  });

  return { ...record, otp };
};

export const consumeEmailVerification = async (userId: string, otp: string) => {
  const token = buildToken(userId, otp);
  // Pre-auth: resolvemos el token global → withSystemContext.
  const record = await withSystemContext((tx) => tx.emailVerificationToken.findUnique({ where: { token } }));

  if (!record || record.expiresAt < new Date()) {
    return null;
  }

  // Conocido el tenant del token → writes scoped en una tx atómica.
  await withExplicitTenant(record.tenantId, async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    await tx.emailVerificationToken.delete({ where: { token } });
  });
  return record;
};

// ──────────────────────────────────────────────────────────────────────
// Recuperación de contraseña
// ──────────────────────────────────────────────────────────────────────
export const createPasswordReset = async (userId: string) => {
  const token = randomBytes(32).toString("hex");

  // Pre-auth: tenant conocido (default) → withExplicitTenant, tx atómica.
  const tenantId = getTenantIdOr(env.defaultClinicId);
  const record = await withExplicitTenant(tenantId, async (tx) => {
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    return tx.passwordResetToken.create({
      data: { userId, token, expiresAt: addHours(2), tenantId },
    });
  });

  return { ...record, token };
};

export const consumePasswordReset = async (token: string) => {
  // Pre-auth: resolvemos el token global → withSystemContext.
  const record = await withSystemContext((tx) => tx.passwordResetToken.findUnique({ where: { token } }));

  if (!record || record.expiresAt < new Date()) {
    return null;
  }

  await withExplicitTenant(record.tenantId, (tx) => tx.passwordResetToken.delete({ where: { token } }));
  return record;
};

// ──────────────────────────────────────────────────────────────────────
// OTP de firma de consentimiento informado
// ──────────────────────────────────────────────────────────────────────
export const createConsentOtp = async (userId: string) => {
  const otp = generateOtp();
  const token = buildToken(userId, otp);

  // Pre-auth: tenant conocido (default) → withExplicitTenant, tx atómica.
  const tenantId = getTenantIdOr(env.defaultClinicId);
  const record = await withExplicitTenant(tenantId, async (tx) => {
    await tx.consentOtpToken.deleteMany({ where: { userId } });
    return tx.consentOtpToken.create({
      data: { userId, token, expiresAt: addHours(1), tenantId },
    });
  });

  return { ...record, otp };
};

export const consumeConsentOtp = async (userId: string, otp: string) => {
  const token = buildToken(userId, otp);
  // Pre-auth: resolvemos el token global → withSystemContext.
  const record = await withSystemContext((tx) => tx.consentOtpToken.findUnique({ where: { token } }));

  if (!record || record.expiresAt < new Date()) {
    return null;
  }

  await withExplicitTenant(record.tenantId, (tx) => tx.consentOtpToken.delete({ where: { token } }));
  return record;
};
