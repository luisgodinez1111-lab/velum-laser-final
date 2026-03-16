import { Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { normalizePhone, sendWhatsappOtpCode } from "../services/whatsappMetaService";

type OtpEntry = {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  phone: string;
};

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const otpByUserId = new Map<string, OtpEntry>();

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

const randomCode = (): string => `${Math.floor(100000 + Math.random() * 900000)}`;

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
    await prisma.user.update({ where: { id: userId }, data: { email } });
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

  otpByUserId.set(userId, {
    codeHash,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    phone
  });

  try {
    await sendWhatsappOtpCode(phone, code);
  } catch (error: any) {
    otpByUserId.delete(userId);
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

  const otp = otpByUserId.get(userId);
  if (!otp || otp.expiresAt < Date.now()) {
    otpByUserId.delete(userId);
    return res.status(400).json({ message: "Codigo de WhatsApp expirado o no solicitado" });
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    otpByUserId.delete(userId);
    return res.status(429).json({ message: "Demasiados intentos de codigo, solicita uno nuevo" });
  }

  const codeOk = await bcrypt.compare(whatsappCode, otp.codeHash);
  if (!codeOk) {
    otp.attempts += 1;
    otpByUserId.set(userId, otp);
    return res.status(400).json({ message: "Codigo de WhatsApp invalido" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash }
  });

  otpByUserId.delete(userId);

  return res.json({ message: "Contrasena actualizada correctamente" });
};
