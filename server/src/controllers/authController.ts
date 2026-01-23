import { Request, Response } from "express";
import { registerSchema, loginSchema, forgotSchema, resetSchema, verifyEmailSchema } from "../validators/auth";
import { createUser, getUserByEmail } from "../services/userService";
import { hashPassword, signToken, verifyPassword } from "../utils/auth";
import { env, isProduction } from "../utils/env";
import { createEmailVerification, createPasswordReset, consumeEmailVerification, consumePasswordReset } from "../services/authService";
import { prisma } from "../db/prisma";

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
    lastName: payload.lastName
  });
  const verification = await createEmailVerification(user.id);
  const token = signToken({ sub: user.id, role: user.role });
  setAuthCookie(res, token);
  return res.status(201).json({
    user: { id: user.id, email: user.email, role: user.role },
    verificationToken: verification.token
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
    return res.status(200).json({ message: "Si el correo existe, se enviará un enlace" });
  }
  const reset = await createPasswordReset(user.id);
  return res.json({ resetToken: reset.token });
};

export const resetPassword = async (req: Request, res: Response) => {
  const payload = resetSchema.parse(req.body);
  const reset = await consumePasswordReset(payload.token);
  if (!reset) {
    return res.status(400).json({ message: "Token inválido" });
  }
  await prisma.user.update({
    where: { id: reset.userId },
    data: { passwordHash: await hashPassword(payload.password) }
  });
  return res.json({ message: "Contraseña actualizada" });
};

export const verifyEmail = async (req: Request, res: Response) => {
  const payload = verifyEmailSchema.parse(req.body);
  const verification = await consumeEmailVerification(payload.token);
  if (!verification) {
    return res.status(400).json({ message: "Token inválido" });
  }
  return res.json({ message: "Correo verificado" });
};
