import { Request, Response } from "express";
import { registerSchema, loginSchema, forgotSchema, resetSchema, verifyEmailSchema } from "../validators/auth";
import { createUser, getUserByEmail } from "../services/userService";
import { hashPassword, signToken, verifyPassword } from "../utils/auth";
import { env, isProduction } from "../utils/env";
import { createEmailVerification, createPasswordReset, consumeEmailVerification, consumePasswordReset } from "../services/authService";
import { prisma } from "../db/prisma";
import { createAuditLog } from "../services/auditService";
import { sendPasswordResetEmail, sendEmailVerificationEmail } from "../services/emailService";

const setAuthCookie = (res: Response, token: string) => {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
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
  sendEmailVerificationEmail(user.email, verification.otp).catch(() => {
    if (!isProduction) {
      console.log(`[auth] VERIFY OTP para ${user.email}: ${verification.otp}`);
    }
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
  // Respuesta genérica: no revelar si el email existe
  if (!user) {
    return res.status(200).json({ message: "Si el correo existe, recibirás un código en tu bandeja" });
  }

  const reset = await createPasswordReset(user.id);
  sendPasswordResetEmail(user.email, reset.otp).catch(() => {
    if (!isProduction) {
      console.log(`[auth] RESET OTP para ${user.email}: ${reset.otp}`);
    }
  });

  return res.json({ message: "Si el correo existe, recibirás un código en tu bandeja" });
};

export const resetPassword = async (req: Request, res: Response) => {
  const payload = resetSchema.parse(req.body);

  const user = await getUserByEmail(payload.email);
  if (!user) {
    return res.status(400).json({ message: "Código inválido o expirado" });
  }

  const reset = await consumePasswordReset(user.id, payload.otp);
  if (!reset) {
    return res.status(400).json({ message: "Código inválido o expirado" });
  }

  await prisma.user.update({
    where: { id: reset.userId },
    data: { passwordHash: await hashPassword(payload.password) }
  });

  await createAuditLog({
    userId: user.id,
    action: "auth.password_reset",
    resourceType: "user",
    resourceId: user.id,
    ip: req.ip,
    metadata: { email: user.email }
  });

  return res.json({ message: "Contraseña actualizada correctamente" });
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
  sendEmailVerificationEmail(user.email, verification.otp).catch(() => {
    if (!isProduction) {
      console.log(`[auth] RESEND VERIFY OTP para ${user.email}: ${verification.otp}`);
    }
  });
  return res.json({ message: "Código reenviado. Revisa tu bandeja de entrada." });
};
