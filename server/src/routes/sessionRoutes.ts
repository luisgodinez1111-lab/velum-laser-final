import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  createSessionTreatment,
  updateSessionTreatment,
  getSessionDetail,
  listSessions,
  getMySessions
} from "../controllers/sessionController";

export const sessionRoutes = Router();

// Member: own sessions
sessionRoutes.get("/me/sessions", requireAuth, getMySessions);

// Staff/Admin: manage sessions
sessionRoutes.post("/admin/sessions", requireAuth, requireRole(["staff", "admin"]), createSessionTreatment);
sessionRoutes.get("/admin/sessions", requireAuth, requireRole(["staff", "admin"]), listSessions);
sessionRoutes.get("/admin/sessions/:id", requireAuth, requireRole(["staff", "admin"]), getSessionDetail);
sessionRoutes.patch("/admin/sessions/:id", requireAuth, requireRole(["staff", "admin"]), updateSessionTreatment);
