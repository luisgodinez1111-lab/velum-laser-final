import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { getOnboardingStatus } from "../controllers/onboardingController";

export const onboardingRoutes = Router();

onboardingRoutes.get("/me/onboarding", requireAuth, getOnboardingStatus);
