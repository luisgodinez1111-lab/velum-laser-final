import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { createBillingCheckout, createBillingPortal } from "../controllers/billingCheckoutController";

export const billingCheckoutRoutes = Router();

billingCheckoutRoutes.post("/api/v1/billing/checkout", requireAuth, createBillingCheckout);
billingCheckoutRoutes.post("/api/v1/billing/portal", requireAuth, createBillingPortal);
