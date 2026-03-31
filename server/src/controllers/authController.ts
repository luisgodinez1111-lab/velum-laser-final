import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { registerSchema, loginSchema, forgotSchema, resetSchema, verifyEmailSchema, consentOtpVerifySchema } from "../validators/auth";
import { createUser, getUserByEmail } from "../services/userService";
import { verifyTotpCode } from "../utils/totp";
import { hashPassword, signToken, verifyPassword, createRefreshToken, rotateRefreshToken, revokeRefreshToken, revokeAllRefreshTokens, recordPasswordHistory, isPasswordReused, validatePasswordStrength } from "../utils/auth";
import { env, isProduction } from "../utils/env";
import { createEmailVerification, createPasswordReset, consumeEmailVerification, consumePasswordReset, createConsentOtp, consumeConsentOtp } from "../services/authService";
import { prisma } from "../db/prisma";
import { createAuditLog } from "../services/auditService";
import { sendPasswordResetEmail, sendEmailVerificationEmail, sendConsentOtpEmail } from "../services/emailService";
import { onNewMember } from "../services/notificationService";
import { logger } from "../utils/logger";
import { safeIp } from "../utils/request";
import {
  LOGIN_LOCKOUT_MS,
  _forceLoginLockout,
  isAccountLocked,
  recordLoginFailure,
  clearLoginFailures,
} from "../services/loginSecurityService";
import { parseDurationMs } from "../utils/time";

// Re-exportar para compatibilidad con tests que importan desde este módulo
export { LOGIN_LOCKOUT_MS, _forceLoginLockout };

const setAccessCookie = (res: Response, token: string) => {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: parseDurationMs(env.jwtExpiresIn),
  });
};

const setRefreshCookie = (res: Response, raw: string) => {
  res.cookie(env.refreshCookieName, raw, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: env.refreshTokenExpiresDays * 86_400_000,
    path: "/auth/refresh", // restrict cookie to the refresh endpoint only
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

  onNewMember({
    userId: user.id,
    userEmail: user.email,
    userName: [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(" ") || user.email,
  }).catch((err: unknown) => logger.warn({ err }, "[auth] new_member notification failed"));

  const token = signToken({ sub: user.id, role: user.role });
  setAccessCookie(res, token);
  const rawRefreshReg = await createRefreshToken(user.id);
  setRefreshCookie(res, rawRefreshReg);
  await createAuditLog({
    userId: user.id,
    action: "auth.register",
    resourceType: "user",
    resourceId: user.id,
    ip: safeIp(req),
    metadata: { email: user.email }
  });
  return res.status(201).json({
    user: { id: user.id, email: user.email, role: user.role },
    requiresEmailVerification: true
  });
};

export const login = async (req: Request, res: Response) => {
  const payload = loginSchema.parse(req.body);

  // Per-account lockout check (prevents credential stuffing)
  if (await isAccountLocked(payload.email)) {
    res.set("Retry-After", String(Math.ceil(LOGIN_LOCKOUT_MS / 1000)));
    return res.status(429).json({ message: "Demasiados intentos fallidos. Intenta de nuevo en 15 minutos." });
  }

  const user = await getUserByEmail(payload.email);
  if (!user) {
    await recordLoginFailure(payload.email);
    return res.status(401).json({ message: "Credenciales inválidas" });
  }
  const valid = await verifyPassword(payload.password, user.passwordHash);
  if (!valid) {
    await recordLoginFailure(payload.email);
    return res.status(401).json({ message: "Credenciales inválidas" });
  }
  if (user.isActive === false) {
    return res.status(403).json({ message: "Tu cuenta ha sido desactivada. Contacta a la clínica para más información." });
  }

  // Verificar 2FA si está habilitado
  if (user.totpEnabled) {
    const totpCode = String((req.body as Record<string, unknown>)?.totpCode ?? "").trim();
    if (!totpCode) {
      return res.status(200).json({ requiresTotp: true });
    }
    if (!user.totpSecret || !verifyTotpCode(user.totpSecret, totpCode)) {
      return res.status(401).json({ message: "Código 2FA incorrecto" });
    }
  }

  await clearLoginFailures(payload.email);
  const token = signToken({ sub: user.id, role: user.role });
  setAccessCookie(res, token);
  const rawRefresh = await createRefreshToken(user.id);
  setRefreshCookie(res, rawRefresh);
  await createAuditLog({
    userId: user.id,
    action: "auth.login",
    resourceType: "user",
    resourceId: user.id,
    ip: safeIp(req),
    metadata: { email: user.email }
  });
  return res.json({ user: { id: user.id, email: user.email, role: user.role } });
};

export const logout = async (req: Request, res: Response) => {
  // Revoke refresh token so it can't be used after logout
  const rawRefresh = (req.cookies as Record<string, string>)?.[env.refreshCookieName];
  if (rawRefresh) {
    await revokeRefreshToken(rawRefresh).catch((err) => logger.warn({ err }, "[auth] logout: failed to revoke refresh token"));
  }
  res.clearCookie(env.cookieName);
  res.clearCookie(env.refreshCookieName, { path: "/auth/refresh" });
  return res.status(204).send();
};

export const refreshToken = async (req: Request, res: Response) => {
  const rawRefresh = (req.cookies as Record<string, string>)?.[env.refreshCookieName];
  if (!rawRefresh) {
    return res.status(401).json({ message: "No hay sesión activa" });
  }

  const result = await rotateRefreshToken(rawRefresh);
  if (!result) {
    res.clearCookie(env.cookieName);
    res.clearCookie(env.refreshCookieName, { path: "/auth/refresh" });
    return res.status(401).json({ message: "Sesión expirada. Inicia sesión de nuevo." });
  }

  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: { id: true, email: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    await revokeAllRefreshTokens(result.userId).catch((err) => logger.warn({ err, userId: result.userId }, "[auth] refresh: failed to revoke all tokens for inactive user"));
    return res.status(401).json({ message: "Cuenta inactiva o no encontrada" });
  }

  const newAccessToken = signToken({ sub: user.id, role: user.role });
  setAccessCookie(res, newAccessToken);
  setRefreshCookie(res, result.newRaw);

  return res.json({ user: { id: user.id, email: user.email, role: user.role } });
};

export const forgotPassword = async (req: Request, res: Response) => {
  const payload = forgotSchema.parse(req.body);

  // Always return the same response to prevent user enumeration
  const genericMsg = "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.";

  const user = await getUserByEmail(payload.email);
  if (user) {
    const reset = await createPasswordReset(user.id);
    const resetUrl = `${env.appUrl}/#/reset-password?token=${reset.token}`;
    sendPasswordResetEmail(user.email, resetUrl).catch((err: unknown) => {
      logger.warn({ err, email: user.email }, "[auth] No se pudo enviar correo de recuperación");
    });
  }

  return res.json({ message: genericMsg });
};

export const resetPassword = async (req: Request, res: Response) => {
  const payload = resetSchema.parse(req.body);

  const reset = await consumePasswordReset(payload.token);
  if (!reset) {
    return res.status(400).json({ message: "El enlace es inválido o ya expiró." });
  }

  // Prevent reuse of recent passwords
  const reused = await isPasswordReused(reset.userId, payload.password);
  if (reused) {
    await createAuditLog({
      userId: reset.userId,
      action: "auth.password_reset_reuse_blocked",
      resourceType: "user",
      resourceId: reset.userId,
      ip: safeIp(req),
      metadata: {}
    });
    return res.status(400).json({ message: "No puedes reutilizar una contraseña reciente. Elige una diferente." });
  }

  const newHash = await hashPassword(payload.password);
  await prisma.user.update({
    where: { id: reset.userId },
    data: { passwordHash: newHash, passwordChangedAt: new Date() }
  });
  await recordPasswordHistory(reset.userId, newHash);

  await createAuditLog({
    userId: reset.userId,
    action: "auth.password_reset",
    resourceType: "user",
    resourceId: reset.userId,
    ip: safeIp(req),
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
    ip: safeIp(req),
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
    ip: safeIp(req),
    metadata: { signedAt }
  });

  return res.json({ signedAt });
};

// ── Cambio de contraseña inicial (primer inicio de sesión con contraseña temporal) ──
export const changeInitialPassword = async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword) {
    return res.status(400).json({ message: "La contraseña es obligatoria" });
  }
  // Reutilizar el mismo validador fuerte que en registro/reset
  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) return res.status(400).json({ message: strengthError });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mustChangePassword: true }
  });

  if (!user?.mustChangePassword) {
    return res.status(400).json({ message: "No hay contraseña temporal pendiente de cambio" });
  }

  // Prevent reuse of recent passwords
  const reusedInitial = await isPasswordReused(userId, newPassword);
  if (reusedInitial) {
    await createAuditLog({
      userId,
      action: "auth.initial_password_reuse_blocked",
      resourceType: "user",
      resourceId: userId,
      ip: safeIp(req),
      metadata: {}
    });
    return res.status(400).json({ message: "No puedes reutilizar una contraseña reciente. Elige una diferente." });
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
  await recordPasswordHistory(userId, passwordHash);

  await createAuditLog({
    userId,
    action: "auth.initial_password_changed",
    resourceType: "user",
    resourceId: userId,
    ip: safeIp(req),
    metadata: {}
  });

  return res.json({ message: "Contraseña establecida correctamente" });
};
