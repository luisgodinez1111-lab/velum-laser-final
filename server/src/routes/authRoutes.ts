import { Router } from "express";
import { forgotPassword, login, logout, register, resetPassword, verifyEmail } from "../controllers/authController";

export const authRoutes = Router();

authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.post("/logout", logout);
authRoutes.post("/forgot", forgotPassword);
authRoutes.post("/reset", resetPassword);
authRoutes.post("/verify-email", verifyEmail);
