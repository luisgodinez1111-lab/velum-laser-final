/**
 * Gestión de canales de watch (push notifications) de Google Calendar.
 * Maneja registro, renovación y parada de suscripciones webhook,
 * así como el encolado de sync incremental al recibir un evento push.
 */
import crypto from "crypto";
import { GoogleCalendarIntegration, IntegrationJobStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { env } from "../utils/env";
import { withGoogleCalendarClient } from "./googleCalendarClient";
import { enqueueIntegrationJob } from "./integrationJobService";
import {
  GOOGLE_WATCH_TTL_SECONDS,
  GOOGLE_WATCH_REFRESH_THRESHOLD_MS,
  GOOGLE_WEBHOOK_PATH,
} from "./googleCalendarCore";

export const stopWatchChannelIfPresent = async (
  integration: GoogleCalendarIntegration
): Promise<void> => {
  if (!integration.watchChannelId || !integration.watchResourceId) return;

  try {
    await withGoogleCalendarClient(integration, async ({ calendar }) => {
      await calendar.channels.stop({
        requestBody: {
          id: integration.watchChannelId ?? undefined,
          resourceId: integration.watchResourceId ?? undefined,
        },
      });
    });
  } catch (error: unknown) {
    logger.warn({ integrationId: integration.id, err: error }, "Unable to stop stale Google watch channel");
  }
};

export const registerGoogleCalendarWatch = async (integrationId: string) => {
  const integration = await prisma.googleCalendarIntegration.findUnique({ where: { id: integrationId } });
  if (!integration || !integration.isActive) {
    throw new Error("Google integration not found or inactive");
  }

  await stopWatchChannelIfPresent(integration);

  const watchResponse = await withGoogleCalendarClient(integration, async ({ calendar }) => {
    const webhookAddress = `${env.baseUrl.replace(/\/$/, "")}${GOOGLE_WEBHOOK_PATH}`;
    const response = await calendar.events.watch({
      calendarId: integration.calendarId,
      requestBody: {
        id: crypto.randomUUID(),
        type: "web_hook",
        address: webhookAddress,
        token: integration.id,
        params: { ttl: String(GOOGLE_WATCH_TTL_SECONDS) },
      },
    });
    return response.data;
  });

  const expirationMs = watchResponse.expiration ? Number(watchResponse.expiration) : Number.NaN;
  const watchExpiration = Number.isNaN(expirationMs) ? null : new Date(expirationMs);

  return prisma.googleCalendarIntegration.update({
    where: { id: integration.id },
    data: {
      watchChannelId: watchResponse.id ?? null,
      watchResourceId: watchResponse.resourceId ?? null,
      watchExpiration,
    },
  });
};

export const ensureGoogleCalendarWatches = async (): Promise<void> => {
  const soon = new Date(Date.now() + GOOGLE_WATCH_REFRESH_THRESHOLD_MS);

  const integrations = await prisma.googleCalendarIntegration.findMany({
    where: {
      isActive: true,
      OR: [{ watchExpiration: null }, { watchExpiration: { lte: soon } }],
    },
    select: { id: true },
  });

  for (const integration of integrations) {
    try {
      await registerGoogleCalendarWatch(integration.id);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const isConfigError = msg.includes("env vars are missing") || msg.includes("placeholders");
      if (isConfigError) {
        logger.warn({ integrationId: integration.id }, "Google Calendar not configured — skipping watch refresh");
      } else {
        logger.error({ integrationId: integration.id, err: error }, "Failed to refresh Google watch channel");
      }
    }
  }
};

export const enqueueGoogleCalendarSyncFromWebhook = async (args: {
  channelId: string;
  resourceId: string;
  resourceState: string;
}): Promise<void> => {
  const integration = await prisma.googleCalendarIntegration.findFirst({
    where: {
      isActive: true,
      watchChannelId: args.channelId,
      watchResourceId: args.resourceId,
    },
  });

  if (!integration) {
    logger.warn({ channelId: args.channelId, resourceId: args.resourceId }, "Webhook did not match any active integration");
    return;
  }

  const existingPending = await prisma.integrationJob.findFirst({
    where: {
      googleIntegrationId: integration.id,
      type: "google.sync.incremental",
      status: { in: [IntegrationJobStatus.pending, IntegrationJobStatus.processing] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingPending) return;

  await enqueueIntegrationJob({
    clinicId: integration.clinicId,
    googleIntegrationId: integration.id,
    type: "google.sync.incremental",
    payload: { source: "google_webhook", resourceState: args.resourceState },
  });
};
