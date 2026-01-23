import { Router } from "express";
import { handleWebhook } from "../controllers/stripeController";

export const stripeRoutes = Router();

stripeRoutes.post("/stripe/webhook", handleWebhook);
