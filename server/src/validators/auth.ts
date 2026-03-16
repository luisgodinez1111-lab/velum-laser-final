import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(7).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD requerido").optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const forgotSchema = z.object({
  email: z.string().email()
});

export const resetSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(12)
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d{6}$/, "El código debe ser de 6 dígitos")
});

export const consentOtpVerifySchema = z.object({
  otp: z.string().length(6).regex(/^\d{6}$/, "El código debe ser de 6 dígitos")
});
