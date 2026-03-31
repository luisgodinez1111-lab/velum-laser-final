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

authRoutes.post("/register", registerLimiter, register);
authRoutes.post("/login", login);
authRoutes.post("/logout", logout);
authRoutes.post("/forgot-password", forgotPassword);
authRoutes.post("/reset-password", resetPassword);
authRoutes.post("/verify-email", verifyEmail);
authRoutes.post("/resend-verification", resendVerification);
authRoutes.post("/send-consent-otp", requireAuth, sendConsentOtp);
authRoutes.post("/verify-consent-otp", requireAuth, verifyConsentOtp);
authRoutes.post("/change-initial-password", requireAuth, changeInitialPassword);
// Silently rotates refresh token and issues new access token — used by apiClient on 401
authRoutes.post("/refresh", refreshToken);
