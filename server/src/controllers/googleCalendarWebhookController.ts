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

  // Optional: reject if a token was registered but header is missing/wrong
  // (Prevents unsolicited replays from external parties who guessed a channelId)
  if (channelToken && channelToken !== process.env.GOOGLE_WEBHOOK_TOKEN) {
    logger.warn({ channelId }, "Google Calendar webhook: invalid channel token — ignoring");
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
