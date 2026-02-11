import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  getMyIntake,
  saveMyIntake,
  submitMyIntake,
  signMyIntake,
  listIntakesAdmin,
  getIntakeAdmin,
  reviewIntakeAdmin
} from "../controllers/intakeController";

export const intakeRoutes = Router();

// Member endpoints
intakeRoutes.get("/intake", requireAuth, getMyIntake);
intakeRoutes.post("/intake", requireAuth, saveMyIntake);
intakeRoutes.post("/intake/submit", requireAuth, submitMyIntake);
intakeRoutes.post("/intake/sign", requireAuth, signMyIntake);

// Admin/Staff endpoints
intakeRoutes.get("/admin/intakes", requireAuth, requireRole(["staff", "admin"]), listIntakesAdmin);
intakeRoutes.get("/admin/intakes/:id", requireAuth, requireRole(["staff", "admin"]), getIntakeAdmin);
intakeRoutes.post("/admin/intakes/:id/review", requireAuth, requireRole(["staff", "admin"]), reviewIntakeAdmin);
