import { Router } from "express";
import {
  callbackGoogleCalendar,
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  updateGoogleCalendarSettings
} from "../controllers/googleCalendarIntegrationController";
import { requireAuth, requireRole } from "../middlewares/auth";

export const googleCalendarIntegrationRoutes = Router();

googleCalendarIntegrationRoutes.get(
  "/api/integrations/google-calendar/status",
  requireAuth,
  requireRole(["admin", "system"]),
  getGoogleCalendarStatus
);
googleCalendarIntegrationRoutes.post(
  "/api/integrations/google-calendar/connect",
  requireAuth,
  requireRole(["admin", "system"]),
  connectGoogleCalendar
);
googleCalendarIntegrationRoutes.get("/api/integrations/google-calendar/callback", callbackGoogleCalendar);
googleCalendarIntegrationRoutes.post(
  "/api/integrations/google-calendar/disconnect",
  requireAuth,
  requireRole(["admin", "system"]),
  disconnectGoogleCalendar
);
googleCalendarIntegrationRoutes.patch(
  "/api/integrations/google-calendar/settings",
  requireAuth,
  requireRole(["admin", "system"]),
  updateGoogleCalendarSettings
);
