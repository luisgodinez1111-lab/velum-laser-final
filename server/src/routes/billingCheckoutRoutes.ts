import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { createBillingCheckout, createBillingPortal } from "../controllers/billingCheckoutController";
import { createAppointmentDepositCheckout } from "../controllers/appointmentDepositController";

export const billingCheckoutRoutes = Router();

billingCheckoutRoutes.post("/api/v1/billing/checkout", requireAuth, createBillingCheckout);
billingCheckoutRoutes.post("/api/v1/billing/portal", requireAuth, createBillingPortal);
billingCheckoutRoutes.post("/api/v1/billing/appointment-deposit", requireAuth, createAppointmentDepositCheckout);
