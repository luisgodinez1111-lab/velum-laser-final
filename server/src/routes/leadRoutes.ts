import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  captureLead,
  listLeadsAdmin,
  getLeadAdmin,
  updateLeadAdmin,
  convertLeadAdmin
} from "../controllers/leadController";

export const leadRoutes = Router();

// Public endpoint with rate limiting
const leadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

leadRoutes.post("/leads", leadRateLimiter, captureLead);

// Admin/Staff endpoints
leadRoutes.get("/admin/leads", requireAuth, requireRole(["staff", "admin"]), listLeadsAdmin);
leadRoutes.get("/admin/leads/:id", requireAuth, requireRole(["staff", "admin"]), getLeadAdmin);
leadRoutes.patch("/admin/leads/:id", requireAuth, requireRole(["staff", "admin"]), updateLeadAdmin);
leadRoutes.post("/admin/leads/:id/convert", requireAuth, requireRole(["staff", "admin"]), convertLeadAdmin);
