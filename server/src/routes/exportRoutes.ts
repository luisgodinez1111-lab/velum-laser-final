import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { exportPayments, exportAppointments, exportMembers } from "../controllers/exportController";

export const exportRoutes = Router();

const adminOnly = [requireAuth, requireRole(["admin", "system"])];

exportRoutes.get("/api/v1/admin/export/payments",     ...adminOnly, exportPayments);
exportRoutes.get("/api/v1/admin/export/appointments", ...adminOnly, exportAppointments);
exportRoutes.get("/api/v1/admin/export/members",      ...adminOnly, exportMembers);
