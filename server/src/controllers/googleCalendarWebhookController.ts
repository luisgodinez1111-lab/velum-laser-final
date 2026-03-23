import { Request, Response } from "express";
import { enqueueGoogleCalendarSyncFromWebhook } from "../services/googleCalendarIntegrationService";
import { logger } from "../utils/logger";

const getHeaderValue = (req: Request, key: string) => {
  const value = req.header(key);
  return typeof value === "string" ? value : "";
};

export const receiveGoogleCalendarWebhook = async (req: Request, res: Response) => {
  const channelId    = getHeaderValue(req, "X-Goog-Channel-Id");
  const resourceId   = getHeaderValue(req, "X-Goog-Resource-Id");
  const resourceState= getHeaderValue(req, "X-Goog-Resource-State");
  const channelToken = getHeaderValue(req, "X-Goog-Channel-Token");

  // Always respond 200 immediately — Google requires a fast ack
  res.status(200).json({ ok: true });

  if (!channelId || !resourceId || !resourceState) {
    return;
  }

  // Enforce token verification when GOOGLE_WEBHOOK_TOKEN is configured.
  // Rejects both missing tokens and wrong tokens — prevents unsolicited replays.
  const expectedToken = process.env.GOOGLE_WEBHOOK_TOKEN;
  if (expectedToken && channelToken !== expectedToken) {
    logger.warn({ channelId, hasToken: Boolean(channelToken) }, "[gcal-webhook] Invalid or missing channel token — ignoring");
    return;
  }

  void enqueueGoogleCalendarSyncFromWebhook({
    channelId,
    resourceId,
    resourceState
  }).catch((error) => {
    logger.error({ err: error, channelId, resourceId, resourceState }, "Unable to enqueue Google Calendar webhook job");
  });
};
