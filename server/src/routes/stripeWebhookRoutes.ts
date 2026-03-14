import express, { Router } from "express";
import {
  stripeWebhookController,
  stripeWebhookHealthController,
} from "../controllers/stripeWebhookController";

export const stripeWebhookRouter = Router();

stripeWebhookRouter.get("/", stripeWebhookHealthController);
stripeWebhookRouter.post("/", express.raw({ type: "application/json" }), stripeWebhookController);
