import { Router } from "express";
import { addSessionFeedback, createSessionTreatment, listMySessions, adminListSessions } from "../controllers/v1SessionController";
import { requireAuth, requireRole } from "../middlewares/auth";

export const v1SessionRoutes = Router();

v1SessionRoutes.get("/api/v1/sessions/me", requireAuth, listMySessions);
v1SessionRoutes.get("/api/v1/sessions/admin", requireAuth, requireRole(["staff", "admin", "system"]), adminListSessions);
v1SessionRoutes.post("/api/v1/sessions", requireAuth, requireRole(["staff", "admin", "system"]), createSessionTreatment);
v1SessionRoutes.patch("/api/v1/sessions/:sessionId/feedback", requireAuth, addSessionFeedback);
