import { Router } from "express";
import { receiveGoogleCalendarWebhook } from "../controllers/googleCalendarWebhookController";

export const googleCalendarWebhookRoutes = Router();

googleCalendarWebhookRoutes.post("/api/webhooks/google-calendar", receiveGoogleCalendarWebhook);
