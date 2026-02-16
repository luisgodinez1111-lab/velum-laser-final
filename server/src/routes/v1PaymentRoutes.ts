import { Router } from "express";
import { getMyPayments, listPaymentsAdmin } from "../controllers/v1PaymentController";
import { requireAuth, requireRole } from "../middlewares/auth";

export const v1PaymentRoutes = Router();

v1PaymentRoutes.get("/api/v1/payments/me", requireAuth, getMyPayments);
v1PaymentRoutes.get("/api/v1/payments", requireAuth, requireRole(["staff", "admin", "system"]), listPaymentsAdmin);
