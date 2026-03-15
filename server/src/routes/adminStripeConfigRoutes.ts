import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  getAdminStripeConfig,
  updateAdminStripeConfig,
  testAdminStripeConfig,
} from "../controllers/adminStripeConfigController";
import {
  getAdminStripePlans,
  updateAdminStripePlans,
} from "../controllers/adminStripePlanController";

export const adminStripeConfigRoutes = Router();

adminStripeConfigRoutes.get("/api/v1/admin/integrations/stripe", requireAuth, requireRole(["admin", "system"]), getAdminStripeConfig);
adminStripeConfigRoutes.put("/api/v1/admin/integrations/stripe", requireAuth, requireRole(["admin", "system"]), updateAdminStripeConfig);
adminStripeConfigRoutes.post("/api/v1/admin/integrations/stripe/test", requireAuth, requireRole(["admin", "system"]), testAdminStripeConfig);

adminStripeConfigRoutes.get("/api/v1/admin/integrations/stripe/plans", requireAuth, requireRole(["admin", "system"]), getAdminStripePlans);
adminStripeConfigRoutes.put("/api/v1/admin/integrations/stripe/plans", requireAuth, requireRole(["admin", "system"]), updateAdminStripePlans);
