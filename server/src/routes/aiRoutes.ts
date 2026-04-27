import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getIntakeSummary } from "../controllers/aiController";

export const aiRoutes = Router();

// Solo staff/admin/system pueden invocar IA — pacientes NO ven sus propios resúmenes
// (son herramienta interna, deben pasar por revisión médica antes de comunicarse).
aiRoutes.post(
  "/api/v1/ai/intake/:userId/summary",
  requireAuth,
  requireRole(["admin", "staff", "system"]),
  getIntakeSummary,
);
