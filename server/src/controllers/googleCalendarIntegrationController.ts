import { Request, Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middlewares/auth";
import {
  disconnectGoogleCalendarIntegration,
  getGoogleCalendarConnectUrl,
  getGoogleCalendarIntegrationStatus,
  handleGoogleCalendarOAuthCallback,
  updateGoogleCalendarIntegrationSettings
} from "../services/googleCalendarIntegrationService";
import { getClinicIdByUserId } from "../utils/clinic";

const settingsSchema = z.object({
  eventFormatMode: z.enum(["complete", "private"])
});

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

export const getGoogleCalendarStatus = async (req: AuthRequest, res: Response) => {
  const clinicId = await getClinicIdByUserId(req.user!.id);
  const status = await getGoogleCalendarIntegrationStatus(clinicId);
  return res.json(status);
};

export const connectGoogleCalendar = async (req: AuthRequest, res: Response) => {
  const clinicId = await getClinicIdByUserId(req.user!.id);
  const response = await getGoogleCalendarConnectUrl({
    userId: req.user!.id,
    clinicId
  });

  return res.json(response);
};

export const callbackGoogleCalendar = async (req: Request, res: Response) => {
  const query = callbackQuerySchema.parse(req.query);
  const redirectUrl = await handleGoogleCalendarOAuthCallback({
    code: query.code,
    state: query.state
  });

  return res.redirect(302, redirectUrl);
};

export const disconnectGoogleCalendar = async (req: AuthRequest, res: Response) => {
  const clinicId = await getClinicIdByUserId(req.user!.id);
  const result = await disconnectGoogleCalendarIntegration(clinicId);
  return res.json(result);
};

export const updateGoogleCalendarSettings = async (req: AuthRequest, res: Response) => {
  const clinicId = await getClinicIdByUserId(req.user!.id);
  const payload = settingsSchema.parse(req.body);

  const result = await updateGoogleCalendarIntegrationSettings(clinicId, payload.eventFormatMode);
  return res.json(result);
};
