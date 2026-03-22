import { Router } from "express";
import { forgotPassword, login, logout, register, resendVerification, resetPassword, verifyEmail, sendConsentOtp, verifyConsentOtp, changeInitialPassword, refreshToken } from "../controllers/authController";
import { requireAuth } from "../middlewares/auth";

export const authRoutes = Router();

authRoutes.post("/register", register);
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
