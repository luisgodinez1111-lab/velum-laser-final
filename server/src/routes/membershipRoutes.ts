import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { cancelMembership, changePlan, getMembershipStatus } from "../controllers/membershipController";

export const membershipRoutes = Router();

membershipRoutes.get("/membership/status", requireAuth, getMembershipStatus);
membershipRoutes.post("/membership/change-plan", requireAuth, changePlan);
membershipRoutes.post("/membership/cancel", requireAuth, cancelMembership);
