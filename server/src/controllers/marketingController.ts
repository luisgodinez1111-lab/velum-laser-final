import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { trackEventSchema } from "../validators/marketing";
import * as marketingService from "../services/marketingService";

// Public: track marketing event from frontend
export const trackEvent = async (req: Request, res: Response) => {
  const data = trackEventSchema.parse(req.body);

  const event = await marketingService.trackEvent({
    eventName: data.eventName,
    userId: data.userId,
    leadId: data.leadId,
    fbp: data.fbp,
    fbc: data.fbc,
    clientIp: req.ip,
    userAgent: req.get("user-agent"),
    sourceUrl: data.sourceUrl,
    customData: data.customData
  });

  res.status(201).json({ eventId: event.eventId });
};

// Admin: process pending CAPI events
export const processEvents = async (req: AuthRequest, res: Response) => {
  const results = await marketingService.processPendingEvents();
  res.json({ processed: results.length, results });
};

// Admin: list pending events
export const listPendingEvents = async (req: AuthRequest, res: Response) => {
  const events = await marketingService.getPendingEvents();
  res.json(events);
};
