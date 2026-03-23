import { Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { normalizePhone, sendWhatsappOtpCode } from "../services/whatsappMetaService";
import { recordPasswordHistory, isPasswordReused } from "../utils/auth";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const getPasswordChecks = (value: string) => ({
  length: value.length >= 8,
  upper: /[A-Z]/.test(value),
  lower: /[a-z]/.test(value),
  number: /[0-9]/.test(value),
  special: /[^A-Za-z0-9]/.test(value)
});

const isStrongPassword = (value: string): boolean => {
  const c = getPasswordChecks(value);
  return c.length && c.upper && c.lower && c.number && c.special;
};

const randomCode = (): string => String(100000 + crypto.randomInt(900000));

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
  prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, passwordHash: true }
  });

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

  const fullName = asString((req.body as any)?.fullName);
  const phone = normalizePhone(asString((req.body as any)?.phone));
  const requestedEmail = asString((req.body as any)?.email);
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

  const user = await getCurrentUser(userId);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

  const phone = await resolvePhoneForUser(userId, asString((req.body as any)?.phone));
  if (!phone) {
    return res.status(400).json({ message: "No hay telefono registrado para enviar el codigo" });
  }

  const code = randomCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.whatsappOtp.upsert({
    where: { userId },
    create: { userId, codeHash, phone, expiresAt, attempts: 0 },
    update: { codeHash, phone, expiresAt, attempts: 0 },
  });

  try {
    await sendWhatsappOtpCode(phone, code);
  } catch (error: any) {
    await prisma.whatsappOtp.delete({ where: { userId } }).catch(() => {});
    return res.status(500).json({
      message: "No se pudo enviar el codigo por WhatsApp",
      detail: asString(error?.message || "")
    });
  }

  return res.json({
    message: "Codigo enviado por WhatsApp",
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000)
  });
};

export const changeMyPassword = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "No autorizado" });

  const currentPassword = asString((req.body as any)?.currentPassword);
  const newPassword = asString((req.body as any)?.newPassword);
  const whatsappCode = asString((req.body as any)?.whatsappCode);

  if (!currentPassword || !newPassword || !whatsappCode) {
    return res.status(400).json({ message: "Debes enviar contrasena actual, nueva y codigo de WhatsApp" });
  }

  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({
      message: "La contrasena nueva debe incluir minimo 8 caracteres, mayuscula, minuscula, numero y simbolo"
    });
  }

  const user = await getCurrentUser(userId);
  if (!user || !user.passwordHash) {
    return res.status(404).json({ message: "Usuario no encontrado" });
  }

  const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
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

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt: new Date() }
  });
  await recordPasswordHistory(userId, passwordHash);

  return res.json({ message: "Contrasena actualizada correctamente" });
};
