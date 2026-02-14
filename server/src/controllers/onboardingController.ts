import type { Request, Response } from "express";
import { onboardingService } from "../services/onboardingService.js";

export const getOnboardingStatus = async (req: Request, res: Response) => {
  const status = await onboardingService.getStatus(req.user!.id);
  res.json(status);
};
