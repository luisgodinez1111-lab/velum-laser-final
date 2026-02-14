import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { triggerReminders, triggerNoShowFollowUp } from "../controllers/reminderController";

export const reminderRoutes = Router();

// Admin-only: trigger reminders manually (in production this would be cron-driven)
reminderRoutes.post("/admin/reminders/upcoming", requireAuth, requireRole(["admin"]), triggerReminders);
reminderRoutes.post("/admin/reminders/no-show", requireAuth, requireRole(["admin"]), triggerNoShowFollowUp);
