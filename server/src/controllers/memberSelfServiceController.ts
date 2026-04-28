import { Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { AuthRequest } from "../middlewares/auth";
import { normalizePhone, sendWhatsappOtpCode } from "../services/whatsappMetaService";
import { recordPasswordHistory, isPasswordReused, validatePasswordStrength, hashPassword, verifyPassword } from "../utils/auth";
import { generateOtp } from "../utils/crypto";
import { safeIp } from "../utils/request";
import { logger } from "../utils/logger";
import { stripe } from "../services/stripeService";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_LIMIT_MAX = 3;
const OTP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const otpRequestRateMap = new Map<string, { count: number; windowStart: number }>();

// Limpieza periódica de entradas expiradas para evitar memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of otpRequestRateMap.entries()) {
    if (now - val.windowStart > OTP_RATE_LIMIT_WINDOW_MS * 2) {
      otpRequestRateMap.delete(key);
    }
  }
}, OTP_RATE_LIMIT_WINDOW_MS * 2).unref();

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const getProfileRecord = async (userId: string) =>
  prisma.profile.findUnique({ where: { userId } });

const upsertProfileRecord = async (
  userId: string,
  _email: string,
  fullName: string,
  phone: string
) => {
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  const lastName = rest.join(" ") || undefined;
  return prisma.profile.upsert({
    where: { userId },
    update: { firstName: firstName ?? null, lastName: lastName ?? null, phone },
    create: { userId, firstName: firstName ?? null, lastName: lastName ?? null, phone },
  });
};

const getCurrentUser = async (userId: string) =>
  withTenantContext(async (tx) => tx.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, passwordHash: true, totpEnabled: true }
  }));

const resolvePhoneForUser = async (userId: string, incomingPhone: string): Promise<string> => {
  const direct = normalizePhone(incomingPhone);
  if (direct) return direct;

  const profile = await getProfileRecord(userId);
  return normalizePhone(asString(profile?.phone));
};

export const getMyProfile = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "No autorizado" });

  const user = await getCurrentUser(userId);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

  const profile = await getProfileRecord(userId);

  return res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    totpEnabled: user.totpEnabled ?? false,
    fullName: [profile?.firstName, profile?.lastName].filter(Boolean).join(" "),
    phone: profile?.phone ?? null,
    profile
  });
};

export const updateMyProfile = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "No autorizado" });

  const user = await getCurrentUser(userId);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

  const body = req.body as Record<string, unknown>;
  const fullName = asString(body?.fullName);
  const phone = normalizePhone(asString(body?.phone));
  const requestedEmail = asString(body?.email);
  const email = requestedEmail || asString(user.email);

  if (!fullName || !phone || !email) {
    return res.status(400).json({ message: "Nombre completo, correo y telefono son obligatorios" });
  }

  if (email !== user.email) {
    // Block email changes — require a dedicated email-change verification flow
    return res.status(400).json({
      message: "El cambio de correo electrónico requiere verificación adicional. Contacta al equipo de Velum Laser para actualizarlo.",
    });
  }

  await upsertProfileRecord(userId, email, fullName, phone);

  return res.json({
    message: "Perfil actualizado",
    profile: { fullName, email, phone }
  });
};

export const requestMyPasswordWhatsappCode = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "No autorizado" });

  // In-memory rate limit: max 3 OTP requests per userId per 10 minutes
  const now = Date.now();
  const rateEntry = otpRequestRateMap.get(userId);
  if (rateEntry && now - rateEntry.windowStart < OTP_RATE_LIMIT_WINDOW_MS) {
    if (rateEntry.count >= OTP_RATE_LIMIT_MAX) {
      return res.status(429).json({ message: "Demasiados intentos. Espera 10 minutos antes de solicitar otro código." });
    }
    rateEntry.count += 1;
  } else {
    otpRequestRateMap.set(userId, { count: 1, windowStart: now });
  }

  const user = await getCurrentUser(userId);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

  const phone = await resolvePhoneForUser(userId, asString((req.body as Record<string, unknown>)?.phone));
  if (!phone) {
    return res.status(400).json({ message: "No hay telefono registrado para enviar el codigo" });
  }

  const code = generateOtp();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.whatsappOtp.upsert({
    where: { userId },
    create: { userId, codeHash, phone, expiresAt, attempts: 0 },
    update: { codeHash, phone, expiresAt, attempts: 0 },
  });

  try {
    await sendWhatsappOtpCode(phone, code);
  } catch (error: unknown) {
    await prisma.whatsappOtp.delete({ where: { userId } }).catch(() => {});
    logger.error({ err: error }, "[selfService] WhatsApp OTP send failed");
    return res.status(500).json({ message: "No se pudo enviar el codigo por WhatsApp" });
  }

  return res.json({
    message: "Codigo enviado por WhatsApp",
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000)
  });
};

export const changeMyPassword = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "No autorizado" });

  const changeBody = req.body as Record<string, unknown>;
  const currentPassword = asString(changeBody?.currentPassword);
  const newPassword = asString(changeBody?.newPassword);
  const whatsappCode = asString(changeBody?.whatsappCode);

  if (!currentPassword || !newPassword || !whatsappCode) {
    return res.status(400).json({ message: "Debes enviar contrasena actual, nueva y codigo de WhatsApp" });
  }

  if (validatePasswordStrength(newPassword) !== null) {
    return res.status(400).json({
      message: "La contraseña nueva debe incluir mínimo 12 caracteres, mayúscula, minúscula, número y símbolo"
    });
  }

  const user = await getCurrentUser(userId);
  if (!user || !user.passwordHash) {
    return res.status(404).json({ message: "Usuario no encontrado" });
  }

  const currentOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentOk) {
    return res.status(400).json({ message: "La contrasena actual es incorrecta" });
  }

  // Purge expired OTPs before lookup
  await prisma.whatsappOtp.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const otp = await prisma.whatsappOtp.findUnique({ where: { userId } });
  if (!otp || otp.expiresAt < new Date()) {
    if (otp) await prisma.whatsappOtp.delete({ where: { userId } }).catch(() => {});
    return res.status(400).json({ message: "Codigo de WhatsApp expirado o no solicitado" });
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.whatsappOtp.delete({ where: { userId } }).catch(() => {});
    return res.status(429).json({ message: "Demasiados intentos de codigo, solicita uno nuevo" });
  }

  const codeOk = await bcrypt.compare(whatsappCode, otp.codeHash);
  if (!codeOk) {
    await prisma.whatsappOtp.update({
      where: { userId },
      data: { attempts: { increment: 1 } },
    });
    return res.status(400).json({ message: "Codigo de WhatsApp invalido" });
  }

  // Consume OTP before updating password (prevent replay)
  await prisma.whatsappOtp.delete({ where: { userId } }).catch(() => {});

  // Prevent reuse of recent passwords
  const reused = await isPasswordReused(userId, newPassword);
  if (reused) {
    return res.status(400).json({ message: "No puedes reutilizar una contraseña reciente. Elige una diferente." });
  }

  const passwordHash = await hashPassword(newPassword);
  await withTenantContext(async (tx) => tx.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt: new Date() }
  }));
  await recordPasswordHistory(userId, passwordHash);

  return res.json({ message: "Contrasena actualizada correctamente" });
};

// ── GDPR: portabilidad de datos ───────────────────────────────────────────────

/**
 * GET /api/v1/users/me/my-data
 * Exporta todos los datos personales del usuario autenticado (GDPR Art. 20).
 * Excluye campos de seguridad (passwordHash, totpSecret) y datos sensibles de terceros.
 */
export const getMyData = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "No autorizado" });

  const [user, profile, membership, appointments, payments, intake, documents] = await Promise.all([
    withTenantContext(async (tx) => tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        emailVerifiedAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })),
    prisma.profile.findUnique({
      where: { userId },
      select: { firstName: true, lastName: true, phone: true, birthDate: true, timezone: true, createdAt: true },
    }),
    prisma.membership.findUnique({
      where: { userId },
      select: { status: true, planCode: true, amount: true, currency: true, currentPeriodEnd: true, createdAt: true },
    }),
    withTenantContext(async (tx) => tx.appointment.findMany({
      where: { userId },
      select: { id: true, startAt: true, endAt: true, status: true, reason: true, createdAt: true },
      orderBy: { startAt: "desc" },
    })),
    prisma.payment.findMany({
      where: { userId },
      select: { id: true, amount: true, currency: true, status: true, paidAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.medicalIntake.findUnique({
      where: { userId },
      select: {
        status: true,
        phototype: true,
        consentAccepted: true,
        submittedAt: true,
        approvedAt: true,
        createdAt: true,
        // signatureImageData excluida — contiene datos biométricos sensibles
      },
    }),
    prisma.document.findMany({
      where: { userId },
      select: { id: true, type: true, status: true, signedAt: true, createdAt: true },
    }),
  ]);

  return res.json({
    exportedAt: new Date(),
    user,
    profile,
    membership,
    appointments,
    payments,
    medicalIntake: intake,
    documents,
  });
};

// ── GDPR: derecho al olvido ───────────────────────────────────────────────────

/**
 * DELETE /api/v1/users/me/account
 * Anonimiza y desactiva la cuenta del usuario autenticado (GDPR Art. 17).
 * Cancela la suscripción de Stripe activa, revoca todos los tokens y borra datos personales.
 * Requiere { confirmDelete: true } en el body como salvaguarda explícita.
 */
export const deleteMyAccount = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "No autorizado" });

  const body = req.body as Record<string, unknown>;
  if (body?.confirmDelete !== true) {
    return res.status(400).json({
      message: "Debes confirmar enviando { confirmDelete: true } para eliminar tu cuenta.",
      code: "CONFIRMATION_REQUIRED",
    });
  }

  const user = await getCurrentUser(userId);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

  // Cancelar suscripción Stripe activa
  const membership = await prisma.membership.findUnique({
    where: { userId },
    select: { stripeSubscriptionId: true, status: true },
  });
  if (membership?.stripeSubscriptionId && membership.status === "active") {
    try {
      await stripe.subscriptions.cancel(membership.stripeSubscriptionId);
    } catch (err) {
      // No bloqueamos la eliminación si Stripe falla; se registra para revisión manual
      logger.warn({ err, userId }, "[gdpr] Failed to cancel Stripe subscription during account deletion");
    }
  }

  // Revocar todos los refresh tokens (fuerza cierre de sesión en todos los dispositivos)
  await prisma.refreshToken.deleteMany({ where: { userId } });

  // Anonimizar datos personales en una transacción atómica
  const anonymizedEmail = `deleted-${userId}@velum.invalid`;
  await withTenantContext(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email: anonymizedEmail,
        passwordHash: "DELETED",
        isActive: false,
        deletedAt: new Date(),
        totpSecret: null,
        totpEnabled: false,
        stripeCustomerId: null,
      },
    });
    await tx.profile.updateMany({
      where: { userId },
      data: { firstName: null, lastName: null, phone: null, birthDate: null },
    });
  });

  // Limpiar cookies de autenticación
  res.clearCookie("token", { httpOnly: true, sameSite: "lax" });
  res.clearCookie("refreshToken", { httpOnly: true, sameSite: "lax" });

  logger.info({ userId }, "[gdpr] Account anonymized and deleted");

  return res.json({ message: "Cuenta eliminada correctamente. Tus datos personales han sido anonimizados." });
};
