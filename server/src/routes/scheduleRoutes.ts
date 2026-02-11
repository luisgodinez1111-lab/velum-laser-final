import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  getAvailability,
  getScheduleConfig,
  updateScheduleConfig,
  listBlockedDates,
  blockDate,
  unblockDate
} from "../controllers/scheduleController";

export const scheduleRoutes = Router();

// Any authenticated user can check availability
scheduleRoutes.get("/schedule/availability", requireAuth, getAvailability);

// Admin endpoints
scheduleRoutes.get("/admin/schedule", requireAuth, requireRole(["admin"]), getScheduleConfig);
scheduleRoutes.put("/admin/schedule", requireAuth, requireRole(["admin"]), updateScheduleConfig);
scheduleRoutes.get("/admin/schedule/blocks", requireAuth, requireRole(["staff", "admin"]), listBlockedDates);
scheduleRoutes.post("/admin/schedule/blocks", requireAuth, requireRole(["staff", "admin"]), blockDate);
scheduleRoutes.delete("/admin/schedule/blocks/:id", requireAuth, requireRole(["admin"]), unblockDate);
