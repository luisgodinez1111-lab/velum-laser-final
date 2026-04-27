import { z } from "zod";

const strongPassword = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres")
  .refine((p) => /[A-Z]/.test(p), { message: "Debe incluir al menos una letra mayúscula" })
  .refine((p) => /[a-z]/.test(p), { message: "Debe incluir al menos una letra minúscula" })
  .refine((p) => /[0-9]/.test(p), { message: "Debe incluir al menos un número" })
  .refine((p) => /[^A-Za-z0-9]/.test(p), { message: "Debe incluir al menos un símbolo" });

export const registerSchema = z.object({
  email: z.string().email(),
  password: strongPassword,
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(7).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD requerido").optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().length(6).regex(/^\d{6}$/, "El código 2FA debe ser de 6 dígitos").optional()
});

export const forgotSchema = z.object({
  email: z.string().email()
});

export const resetSchema = z.object({
  token: z.string().min(32),
  password: strongPassword,
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d{6}$/, "El código debe ser de 6 dígitos")
});

export const consentOtpVerifySchema = z.object({
  otp: z.string().length(6).regex(/^\d{6}$/, "El código debe ser de 6 dígitos")
});
