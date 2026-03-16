import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { registerSchema, loginSchema, forgotSchema, resetSchema, verifyEmailSchema, consentOtpVerifySchema } from "../validators/auth";
import { createUser, getUserByEmail } from "../services/userService";
import { hashPassword, signToken, verifyPassword } from "../utils/auth";
import { env, isProduction } from "../utils/env";
import { createEmailVerification, createPasswordReset, consumeEmailVerification, consumePasswordReset, createConsentOtp, consumeConsentOtp } from "../services/authService";
import { prisma } from "../db/prisma";
import { createAuditLog } from "../services/auditService";
import { sendPasswordResetEmail, sendEmailVerificationEmail, sendConsentOtpEmail } from "../services/emailService";
import { logger } from "../utils/logger";

const setAuthCookie = (res: Response, token: string) => {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24
  });
};

export const register = async (req: Request, res: Response) => {
  const payload = registerSchema.parse(req.body);
  const existing = await getUserByEmail(payload.email);
  if (existing) {
    return res.status(409).json({ message: "El correo ya existe" });
  }
  const user = await createUser({
    email: payload.email,
    passwordHash: await hashPassword(payload.password),
    firstName: payload.firstName,
    lastName: payload.lastName,
    phone: payload.phone,
    birthDate: payload.birthDate
  });

  const latestLead = await prisma.lead.findFirst({
    where: { email: user.email, convertedUserId: null },
    orderBy: { createdAt: "desc" }
  });

  if (latestLead) {
    await prisma.lead.update({
      where: { id: latestLead.id },
      data: { convertedUserId: user.id }
    });

    await prisma.marketingAttribution.updateMany({
      where: { leadId: latestLead.id },
      data: { userId: user.id }
    });
  }

  // Enviar OTP de verificación de correo
  const verification = await createEmailVerification(user.id);
  sendEmailVerificationEmail(user.email, verification.otp).catch((err: unknown) => {
    logger.warn({ err, email: user.email }, "[auth] No se pudo enviar correo de verificación");
  });

  const token = signToken({ sub: user.id, role: user.role });
  setAuthCookie(res, token);
  await createAuditLog({
    userId: user.id,
    action: "auth.register",
    resourceType: "user",
    resourceId: user.id,
    ip: req.ip,
    metadata: { email: user.email }
  });
  return res.status(201).json({
    user: { id: user.id, email: user.email, role: user.role },
    requiresEmailVerification: true
  });
};

export const login = async (req: Request, res: Response) => {
  const payload = loginSchema.parse(req.body);
  const user = await getUserByEmail(payload.email);
  if (!user) {
    return res.status(401).json({ message: "Credenciales inválidas" });
  }
  const valid = await verifyPassword(payload.password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Credenciales inválidas" });
  }
  if (user.isActive === false) {
    return res.status(403).json({ message: "Tu cuenta ha sido desactivada. Contacta a la clínica para más información." });
  }
  const token = signToken({ sub: user.id, role: user.role });
  setAuthCookie(res, token);
  await createAuditLog({
    userId: user.id,
    action: "auth.login",
    resourceType: "user",
    resourceId: user.id,
    ip: req.ip,
    metadata: { email: user.email }
  });
  return res.json({ user: { id: user.id, email: user.email, role: user.role } });
};

export const logout = async (_req: Request, res: Response) => {
  res.clearCookie(env.cookieName);
  return res.status(204).send();
};

export const forgotPassword = async (req: Request, res: Response) => {
  const payload = forgotSchema.parse(req.body);
  const user = await getUserByEmail(payload.email);

  if (!user) {
    return res.status(404).json({ message: "No encontramos una cuenta con ese correo electrónico." });
  }

  const reset = await createPasswordReset(user.id);
  const resetUrl = `${env.appUrl}/#/reset-password?token=${reset.token}`;
  sendPasswordResetEmail(user.email, resetUrl).catch((err: unknown) => {
    logger.warn({ err, email: user.email }, "[auth] No se pudo enviar correo de recuperación");
  });

  return res.json({ message: "Te enviamos un enlace a tu correo para restablecer tu contraseña." });
};

export const resetPassword = async (req: Request, res: Response) => {
  const payload = resetSchema.parse(req.body);

  const reset = await consumePasswordReset(payload.token);
  if (!reset) {
    return res.status(400).json({ message: "El enlace es inválido o ya expiró." });
  }

  await prisma.user.update({
    where: { id: reset.userId },
    data: { passwordHash: await hashPassword(payload.password), passwordChangedAt: new Date() }
  });

  await createAuditLog({
    userId: reset.userId,
    action: "auth.password_reset",
    resourceType: "user",
    resourceId: reset.userId,
    ip: req.ip,
    metadata: {}
  });

  return res.json({ message: "Contraseña actualizada correctamente." });
};

export const verifyEmail = async (req: Request, res: Response) => {
  const payload = verifyEmailSchema.parse(req.body);

  const user = await getUserByEmail(payload.email);
  if (!user) {
    return res.status(400).json({ message: "Código inválido o expirado" });
  }

  const verification = await consumeEmailVerification(user.id, payload.otp);
  if (!verification) {
    return res.status(400).json({ message: "Código inválido o expirado" });
  }

  await createAuditLog({
    userId: user.id,
    action: "auth.email_verified",
    resourceType: "user",
    resourceId: user.id,
    ip: req.ip,
    metadata: { email: user.email }
  });

  return res.json({ message: "Correo verificado correctamente" });
};

export const resendVerification = async (req: Request, res: Response) => {
  const { email } = forgotSchema.parse(req.body); // mismo shape: { email }
  const user = await getUserByEmail(email);
  // Respuesta genérica para no revelar si el email existe
  if (!user) {
    return res.json({ message: "Si el correo existe, recibirás un nuevo código" });
  }
  const verification = await createEmailVerification(user.id);
  sendEmailVerificationEmail(user.email, verification.otp).catch((err: unknown) => {
    logger.warn({ err, email: user.email }, "[auth] No se pudo reenviar correo de verificación");
  });
  return res.json({ message: "Código reenviado. Revisa tu bandeja de entrada." });
};

// ── OTP para firma de consentimiento informado ────────────────────────
export const sendConsentOtp = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, profile: { select: { firstName: true, lastName: true } } }
  });
  if (!user) {
    return res.status(404).json({ message: "Usuario no encontrado" });
  }

  const consent = await createConsentOtp(userId);
  const name = [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(" ") || user.email;

  sendConsentOtpEmail(user.email, { name, otp: consent.otp }).catch((err: unknown) => {
    logger.warn({ err, email: user.email }, "[auth] No se pudo enviar OTP de consentimiento");
  });

  return res.json({ message: "Código enviado a tu correo electrónico." });
};

export const verifyConsentOtp = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const payload = consentOtpVerifySchema.parse(req.body);

  const record = await consumeConsentOtp(userId, payload.otp);
  if (!record) {
    return res.status(400).json({ message: "Código incorrecto o expirado." });
  }

  const signedAt = new Date().toISOString();

  await createAuditLog({
    userId,
    action: "auth.consent_signed",
    resourceType: "medicalIntake",
    resourceId: userId,
    ip: req.ip,
    metadata: { signedAt }
  });

  return res.json({ signedAt });
};

// ── Cambio de contraseña inicial (primer inicio de sesión con contraseña temporal) ──
export const changeInitialPassword = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mustChangePassword: true }
  });

  if (!user?.mustChangePassword) {
    return res.status(400).json({ message: "No hay contraseña temporal pendiente de cambio" });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date()
    }
  });

  await createAuditLog({
    userId,
    action: "auth.initial_password_changed",
    resourceType: "user",
    resourceId: userId,
    ip: req.ip,
    metadata: {}
  });

  return res.json({ message: "Contraseña establecida correctamente" });
};
