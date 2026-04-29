import { Router, Request, Response } from "express";
import {
  addSessionFeedback,
  createSessionTreatment,
  listMySessions,
  adminListSessions,
  respondToSessionFeedback,
} from "../controllers/v1SessionController";
import { requireAuth, requireRole } from "../middlewares/auth";
import { FEEDBACK_CHIPS } from "../utils/sessionFeedback";

export const v1SessionRoutes = Router();

// Catálogo público de chips de feedback. Permite que cliente y admin
// compartan el mismo source of truth sin hardcodear en frontend.
v1SessionRoutes.get("/api/v1/session-feedback/chips", (_req: Request, res: Response) => {
  res.json({ chips: FEEDBACK_CHIPS });
});

v1SessionRoutes.get("/api/v1/sessions/me", requireAuth, listMySessions);
v1SessionRoutes.get("/api/v1/sessions/admin", requireAuth, requireRole(["staff", "admin", "system"]), adminListSessions);
v1SessionRoutes.post("/api/v1/sessions", requireAuth, requireRole(["staff", "admin", "system"]), createSessionTreatment);
v1SessionRoutes.patch("/api/v1/sessions/:sessionId/feedback", requireAuth, addSessionFeedback);
// Respuesta clínica del staff al feedback del paciente (Fase B).
v1SessionRoutes.post(
  "/api/v1/sessions/:sessionId/feedback/respond",
  requireAuth,
  requireRole(["staff", "admin", "system"]),
  respondToSessionFeedback,
);
