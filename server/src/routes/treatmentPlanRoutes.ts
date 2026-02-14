import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  createPlan,
  updatePlan,
  incrementPlanSession,
  getMyPlans,
  getPlanDetail,
  listPlans,
} from "../controllers/treatmentPlanController";

export const treatmentPlanRoutes = Router();

// Member: own plans
treatmentPlanRoutes.get("/me/treatment-plans", requireAuth, getMyPlans);

// Staff/Admin: manage plans
treatmentPlanRoutes.post("/admin/treatment-plans", requireAuth, requireRole(["staff", "admin"]), createPlan);
treatmentPlanRoutes.get("/admin/treatment-plans", requireAuth, requireRole(["staff", "admin"]), listPlans);
treatmentPlanRoutes.get("/admin/treatment-plans/:id", requireAuth, requireRole(["staff", "admin"]), getPlanDetail);
treatmentPlanRoutes.patch("/admin/treatment-plans/:id", requireAuth, requireRole(["staff", "admin"]), updatePlan);
treatmentPlanRoutes.post("/admin/treatment-plans/:id/increment", requireAuth, requireRole(["staff", "admin"]), incrementPlanSession);
