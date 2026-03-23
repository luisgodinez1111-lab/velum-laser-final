import { Router } from "express";
import { getMyPayments, listPaymentsAdmin, exportPaymentsCSV, getPaymentReconciliationReport } from "../controllers/v1PaymentController";
import { requireAuth, requireRole } from "../middlewares/auth";

export const v1PaymentRoutes = Router();

v1PaymentRoutes.get("/api/v1/payments/me", requireAuth, getMyPayments);
v1PaymentRoutes.get("/api/v1/payments", requireAuth, requireRole(["staff", "admin", "system"]), listPaymentsAdmin);
v1PaymentRoutes.get("/api/v1/payments/export", requireAuth, requireRole(["staff", "admin", "system"]), exportPaymentsCSV);
v1PaymentRoutes.get("/api/v1/payments/reconciliation", requireAuth, requireRole(["admin", "system"]), getPaymentReconciliationReport);
