import { Router, raw } from "express";
import { handleWebhook } from "../controllers/stripeController";

export const stripeRoutes = Router();

stripeRoutes.post("/stripe/webhook", raw({ type: "application/json" }), handleWebhook);
