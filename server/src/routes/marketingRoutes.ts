import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../middlewares/auth";
import { trackEvent, processEvents, listPendingEvents } from "../controllers/marketingController";

export const marketingRoutes = Router();

// Public: track events from frontend (rate limited)
const trackRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

marketingRoutes.post("/marketing/events", trackRateLimiter, trackEvent);

// Admin: manage CAPI
marketingRoutes.get("/admin/marketing/pending", requireAuth, requireRole(["admin"]), listPendingEvents);
marketingRoutes.post("/admin/marketing/process", requireAuth, requireRole(["admin"]), processEvents);
