import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  getOverview,
  getAppointmentStats,
  getLeadStats,
  getSessionStats
} from "../controllers/analyticsController";

export const analyticsRoutes = Router();

const adminGuard = [requireAuth, requireRole(["admin"])] as const;

analyticsRoutes.get("/admin/analytics/overview", ...adminGuard, getOverview);
analyticsRoutes.get("/admin/analytics/appointments", ...adminGuard, getAppointmentStats);
analyticsRoutes.get("/admin/analytics/leads", ...adminGuard, getLeadStats);
analyticsRoutes.get("/admin/analytics/sessions", ...adminGuard, getSessionStats);
