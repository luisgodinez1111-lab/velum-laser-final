import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  listCustomCharges,
  createCharge,
  cancelCharge,
  resendOtp,
  getChargePublic,
  verifyOtpAndCheckout,
} from "../controllers/customChargeController";

export const customChargeRoutes = Router();

// Admin routes (authenticated, admin/system only)
customChargeRoutes.get(
  "/api/v1/admin/custom-charges",
  requireAuth,
  requireRole(["admin", "system"]),
  listCustomCharges
);
customChargeRoutes.post(
  "/api/v1/admin/custom-charges",
  requireAuth,
  requireRole(["admin", "system"]),
  createCharge
);
customChargeRoutes.delete(
  "/api/v1/admin/custom-charges/:id",
  requireAuth,
  requireRole(["admin", "system"]),
  cancelCharge
);
customChargeRoutes.post(
  "/api/v1/admin/custom-charges/:id/resend",
  requireAuth,
  requireRole(["admin", "system"]),
  resendOtp
);

// Public routes (no auth — client accesses by charge ID)
customChargeRoutes.get("/api/v1/custom-charges/:id", getChargePublic);
customChargeRoutes.post("/api/v1/custom-charges/:id/verify", verifyOtpAndCheckout);
customChargeRoutes.post("/api/v1/custom-charges/:id/resend", resendOtp);
