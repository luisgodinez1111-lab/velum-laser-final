import { Router } from "express";
import { listMarketingEvents, createLead, trackMarketingEvent } from "../controllers/v1LeadController";
import { optionalAuth, requireAuth, requireRole } from "../middlewares/auth";

export const v1LeadRoutes = Router();

v1LeadRoutes.post("/api/v1/leads", createLead);
v1LeadRoutes.post("/v1/leads", createLead);
v1LeadRoutes.post("/api/v1/marketing/events", trackMarketingEvent);
v1LeadRoutes.get("/api/v1/marketing/events", requireAuth, requireRole(["staff", "admin", "system"]), listMarketingEvents);
v1LeadRoutes.get("/admin/marketing/events", requireAuth, requireRole(["staff", "admin", "system"]), listMarketingEvents);
