import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
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

adminStripeConfigRoutes.get("/api/v1/admin/integrations/stripe", requireAuth, getAdminStripeConfig);
adminStripeConfigRoutes.put("/api/v1/admin/integrations/stripe", requireAuth, updateAdminStripeConfig);
adminStripeConfigRoutes.post("/api/v1/admin/integrations/stripe/test", requireAuth, testAdminStripeConfig);

adminStripeConfigRoutes.get("/api/v1/admin/integrations/stripe/plans", requireAuth, getAdminStripePlans);
adminStripeConfigRoutes.put("/api/v1/admin/integrations/stripe/plans", requireAuth, updateAdminStripePlans);
