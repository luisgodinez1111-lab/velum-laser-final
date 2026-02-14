import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import * as analyticsService from "../services/analyticsService";

export const getOverview = async (_req: AuthRequest, res: Response) => {
  const data = await analyticsService.getOverview();
  res.json(data);
};

export const getAppointmentStats = async (req: AuthRequest, res: Response) => {
  const days = Number(req.query.days) || 30;
  const data = await analyticsService.getAppointmentStats(days);
  res.json(data);
};

export const getLeadStats = async (req: AuthRequest, res: Response) => {
  const days = Number(req.query.days) || 30;
  const data = await analyticsService.getLeadStats(days);
  res.json(data);
};

export const getSessionStats = async (req: AuthRequest, res: Response) => {
  const days = Number(req.query.days) || 30;
  const data = await analyticsService.getSessionStats(days);
  res.json(data);
};
