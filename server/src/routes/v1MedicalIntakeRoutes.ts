import { Router } from "express";
import {
  getMyMedicalIntake,
  updateMyMedicalIntake,
  approveMedicalIntake
} from "../controllers/v1MedicalIntakeController";
import { requireAuth, requireRole } from "../middlewares/auth";
export const v1MedicalIntakeRoutes = Router();

v1MedicalIntakeRoutes.get("/api/v1/medical-intakes/me", requireAuth, getMyMedicalIntake);
v1MedicalIntakeRoutes.put("/api/v1/medical-intakes/me", requireAuth, updateMyMedicalIntake);
v1MedicalIntakeRoutes.post(
  "/api/v1/medical-intakes/:userId/approve",
  requireAuth,
  requireRole(["staff", "admin", "system"]),
  approveMedicalIntake
);
v1MedicalIntakeRoutes.get("/v1/medical-intakes/me", requireAuth, getMyMedicalIntake);
v1MedicalIntakeRoutes.put("/v1/medical-intakes/me", requireAuth, updateMyMedicalIntake);
v1MedicalIntakeRoutes.post(
  "/v1/medical-intakes/:userId/approve",
  requireAuth,
  requireRole(["staff", "admin", "system"]),
  approveMedicalIntake
);
