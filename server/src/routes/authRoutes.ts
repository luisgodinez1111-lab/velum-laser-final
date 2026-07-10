import { Router } from "express";
import rateLimit from "express-rate-limit";
import { forgotPassword, login, logout, register, resendVerification, resetPassword, verifyEmail, sendConsentOtp, verifyConsentOtp, changeInitialPassword, refreshToken } from "../controllers/authController";
import { requireAuth } from "../middlewares/auth";

export const authRoutes = Router();

// Rate limiter específico para registro — 5 intentos por IP por hora
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,                    // máximo 5 registros por IP por hora
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados registros desde esta IP. Intenta de nuevo en 1 hora." },
  skipSuccessfulRequests: false,
});

// Verificación de OTP — anti fuerza bruta. Un OTP de 6 dígitos sin límite es
// bruteforceable; 10 intentos por IP cada 15 min lo hace inviable dentro de la
// vida del código. Cuenta por IP real gracias a `trust proxy`.
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos. Espera unos minutos e intenta de nuevo." },
});

// Envío/reenvío de OTP y recuperación — anti spam de correos: 5 por IP por hora.
const otpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas solicitudes. Intenta de nuevo en 1 hora." },
});

authRoutes.post("/register", registerLimiter, register);
authRoutes.post("/login", login);
authRoutes.post("/logout", logout);
authRoutes.post("/forgot-password", otpSendLimiter, forgotPassword);
authRoutes.post("/reset-password", otpVerifyLimiter, resetPassword);
authRoutes.post("/verify-email", otpVerifyLimiter, verifyEmail);
authRoutes.post("/resend-verification", otpSendLimiter, resendVerification);
authRoutes.post("/send-consent-otp", requireAuth, otpSendLimiter, sendConsentOtp);
authRoutes.post("/verify-consent-otp", requireAuth, otpVerifyLimiter, verifyConsentOtp);
authRoutes.post("/change-initial-password", requireAuth, changeInitialPassword);
// Silently rotates refresh token and issues new access token — used by apiClient on 401
authRoutes.post("/refresh", refreshToken);
