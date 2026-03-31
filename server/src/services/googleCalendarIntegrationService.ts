/**
 * Google Calendar Integration — punto de entrada público.
 *
 * Este módulo contiene las funciones OAuth (conectar, desconectar, callback, settings)
 * y el dispatcher de jobs. La lógica de sync, watch y push de citas está en:
 *   - googleCalendarSyncService.ts    — sync Google → Velum
 *   - googleCalendarWatchService.ts   — canales push / webhook
 *   - googleCalendarPushService.ts    — push Velum → Google
 *   - googleCalendarCore.ts           — tipos, constantes y helpers compartidos
 *
 * Los imports externos existentes siguen funcionando gracias a los re-exports al final.
 */
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import { prisma } from "../db/prisma";
import { decrypt, encrypt } from "../utils/crypto";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { createGoogleOAuthClient } from "./googleCalendarClient";
import { enqueueIntegrationJob, IntegrationJobType } from "./integrationJobService";
import {
  EventFormatMode,
  GOOGLE_OAUTH_SCOPES,
  OAuthStatePayload,
  getFrontendIntegrationRedirectUrl,
  getIntegrationByClinicId,
  parseEventFormatMode,
} from "./googleCalendarCore";
import { registerGoogleCalendarWatch, stopWatchChannelIfPresent } from "./googleCalendarWatchService";
import {
  runGoogleCalendarFullSync,
  runGoogleCalendarIncrementalSync,
} from "./googleCalendarSyncService";
import {
  runGoogleAppointmentSync,
  enqueueGoogleAppointmentSync,
} from "./googleCalendarPushService";
import {
  ensureGoogleCalendarWatches,
  enqueueGoogleCalendarSyncFromWebhook,
} from "./googleCalendarWatchService";

// ── OAuth / Status ────────────────────────────────────────────────────────────

export const getGoogleCalendarIntegrationStatus = async (clinicId: string) => {
  const integration = await prisma.googleCalendarIntegration.findUnique({ where: { clinicId } });

  if (!integration || !integration.isActive) {
    return {
      connected: false,
      email: null,
      calendarId: null,
      eventFormatMode: "complete" as EventFormatMode,
      lastSyncAt: null,
      watchExpiration: null,
    };
  }

  return {
    connected: true,
    email: integration.email,
    calendarId: integration.calendarId,
    eventFormatMode: parseEventFormatMode(integration.eventFormatMode),
    lastSyncAt: integration.lastSyncAt,
    watchExpiration: integration.watchExpiration,
  };
};

export const getGoogleCalendarConnectUrl = async (args: { userId: string; clinicId: string }) => {
  const oauth2Client = createGoogleOAuthClient();

  const state = jwt.sign(
    { sub: args.userId, clinicId: args.clinicId, provider: "google-calendar" } as OAuthStatePayload,
    env.jwtSecret,
    { expiresIn: "10m" }
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GOOGLE_OAUTH_SCOPES],
    include_granted_scopes: true,
    state,
  });

  return { url };
};

export const handleGoogleCalendarOAuthCallback = async (args: { code: string; state: string }) => {
  try {
    const decoded = jwt.verify(args.state, env.jwtSecret) as OAuthStatePayload;
    if (decoded.provider !== "google-calendar" || !decoded.clinicId) {
      throw new Error("OAuth state is invalid");
    }

    const oauth2Client = createGoogleOAuthClient();

    const tokenPayload = new URLSearchParams({
      code: args.code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleRedirectUri,
      grant_type: "authorization_code",
    });

    const tokenHttpResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenPayload,
    });

    if (!tokenHttpResponse.ok) {
      const details = await tokenHttpResponse.text().catch(() => "");
      throw new Error(`Google token exchange failed (${tokenHttpResponse.status}): ${details.slice(0, 300)}`);
    }

    const tokenJson = (await tokenHttpResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      scope?: string;
      expires_in?: number;
    };

    const tokens = {
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      scope: tokenJson.scope,
      expiry_date: tokenJson.expires_in ? Date.now() + tokenJson.expires_in * 1000 : undefined,
    };

    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const profile = await oauth2.userinfo.get();

    const clinicId = decoded.clinicId;
    const existing = await prisma.googleCalendarIntegration.findUnique({ where: { clinicId } });

    const accessToken = tokens.access_token ?? (existing ? decrypt(existing.accessTokenEnc) : null);
    const refreshToken = tokens.refresh_token ?? (existing ? decrypt(existing.refreshTokenEnc) : null);

    if (!accessToken || !refreshToken) {
      throw new Error("Google OAuth response did not include reusable tokens");
    }

    const integration = await prisma.googleCalendarIntegration.upsert({
      where: { clinicId },
      create: {
        clinicId,
        email: profile.data.email ?? "unknown@google",
        calendarId: "primary",
        accessTokenEnc: encrypt(accessToken),
        refreshTokenEnc: encrypt(refreshToken),
        scope: tokens.scope ?? null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        isActive: true,
        eventFormatMode: parseEventFormatMode(existing?.eventFormatMode),
      },
      update: {
        email: profile.data.email ?? existing?.email ?? "unknown@google",
        calendarId: existing?.calendarId ?? "primary",
        accessTokenEnc: encrypt(accessToken),
        refreshTokenEnc: encrypt(refreshToken),
        scope: tokens.scope ?? existing?.scope ?? null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : existing?.tokenExpiry ?? null,
        isActive: true,
      },
    });

    await registerGoogleCalendarWatch(integration.id);

    await enqueueIntegrationJob({
      clinicId,
      googleIntegrationId: integration.id,
      type: "google.sync.full",
      payload: { source: "oauth_callback" },
    });

    return getFrontendIntegrationRedirectUrl("success");
  } catch (error: unknown) {
    logger.error({ err: error }, "Google Calendar OAuth callback failed");
    return getFrontendIntegrationRedirectUrl(
      "error",
      error instanceof Error ? error.message : "No se pudo completar la conexión"
    );
  }
};

export const disconnectGoogleCalendarIntegration = async (clinicId: string) => {
  const integration = await prisma.googleCalendarIntegration.findUnique({ where: { clinicId } });
  if (!integration) return { disconnected: true };

  await stopWatchChannelIfPresent(integration);

  await prisma.googleCalendarIntegration.update({
    where: { id: integration.id },
    data: {
      isActive: false,
      watchChannelId: null,
      watchResourceId: null,
      watchExpiration: null,
      syncToken: null,
    },
  });

  return { disconnected: true };
};

export const updateGoogleCalendarIntegrationSettings = async (
  clinicId: string,
  eventFormatMode: EventFormatMode
) => {
  const integration = await getIntegrationByClinicId(clinicId);
  if (!integration) {
    const error = new Error("Google Calendar no está conectado") as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  const updated = await prisma.googleCalendarIntegration.update({
    where: { id: integration.id },
    data: { eventFormatMode },
  });

  return { eventFormatMode: parseEventFormatMode(updated.eventFormatMode) };
};

// ── Job dispatcher ─────────────────────────────────────────────────────────────

export const runGoogleIntegrationJobByType = async (
  type: IntegrationJobType,
  payload: import("@prisma/client").Prisma.JsonValue,
  fallbackClinicId: string,
  googleIntegrationId?: string | null
): Promise<void> => {
  const payloadObject = (payload ?? {}) as Record<string, unknown>;

  if (type === "google.watch.ensure") {
    await ensureGoogleCalendarWatches();
    return;
  }

  if (type === "google.sync.full") {
    if (googleIntegrationId) {
      await runGoogleCalendarFullSync(googleIntegrationId);
      return;
    }
    const integration = await getIntegrationByClinicId(fallbackClinicId);
    if (integration) await runGoogleCalendarFullSync(integration.id);
    return;
  }

  if (type === "google.sync.incremental") {
    if (googleIntegrationId) {
      await runGoogleCalendarIncrementalSync(googleIntegrationId);
      return;
    }
    const integration = await getIntegrationByClinicId(fallbackClinicId);
    if (integration) await runGoogleCalendarIncrementalSync(integration.id);
    return;
  }

  const appointmentId = typeof payloadObject.appointmentId === "string" ? payloadObject.appointmentId : "";
  if (!appointmentId) throw new Error(`Job ${type} is missing appointmentId`);

  if (type === "google.appointment.create") {
    await runGoogleAppointmentSync({ clinicId: fallbackClinicId, appointmentId, action: "create" });
    return;
  }
  if (type === "google.appointment.update") {
    await runGoogleAppointmentSync({ clinicId: fallbackClinicId, appointmentId, action: "update" });
    return;
  }
  if (type === "google.appointment.cancel") {
    await runGoogleAppointmentSync({ clinicId: fallbackClinicId, appointmentId, action: "cancel" });
    return;
  }

  throw new Error(`Unsupported integration job type: ${type}`);
};

// ── Re-exports para backward compatibility ────────────────────────────────────
// Los imports existentes en controllers y workers siguen funcionando sin cambios.
export {
  registerGoogleCalendarWatch,
  ensureGoogleCalendarWatches,
  enqueueGoogleCalendarSyncFromWebhook,
} from "./googleCalendarWatchService";
export {
  runGoogleCalendarFullSync,
  runGoogleCalendarIncrementalSync,
  syncChangedGoogleEventIntoVelum,
} from "./googleCalendarSyncService";
export {
  runGoogleAppointmentSync,
  enqueueGoogleAppointmentSync,
} from "./googleCalendarPushService";
