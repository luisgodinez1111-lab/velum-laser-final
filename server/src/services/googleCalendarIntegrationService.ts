import { AppointmentStatus, GoogleCalendarIntegration, IntegrationJobStatus, Prisma } from "@prisma/client";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { calendar_v3, google } from "googleapis";
import { prisma } from "../db/prisma";
import { decrypt, encrypt } from "../utils/crypto";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { createGoogleOAuthClient, withGoogleCalendarClient } from "./googleCalendarClient";
import { enqueueIntegrationJob, IntegrationJobType } from "./integrationJobService";
import { getPaymentBadge } from "./paymentBadgeService";

type EventFormatMode = "complete" | "private";
type SyncMode = "full" | "incremental";

type OAuthStatePayload = {
  sub: string;
  clinicId: string;
  provider: "google-calendar";
};

type GoogleAppointmentJobAction = "create" | "update" | "cancel";

const GOOGLE_OAUTH_SCOPES = ["https://www.googleapis.com/auth/calendar","https://www.googleapis.com/auth/userinfo.email","openid"] as const;
const GOOGLE_WEBHOOK_PATH = "/api/webhooks/google-calendar";
const GOOGLE_WATCH_TTL_SECONDS = 60 * 60 * 24 * 7;
const GOOGLE_WATCH_REFRESH_THRESHOLD_MS = 1000 * 60 * 60 * 6;
const GOOGLE_LOOP_WINDOW_MS = Math.max(1, env.googleSyncIgnoreWindowSeconds) * 1000;
const ALLOWED_SYNCABLE_STATUSES: AppointmentStatus[] = ["scheduled", "confirmed", "canceled"];

const toDateOrNull = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseGoogleDateTime = (eventDate?: calendar_v3.Schema$EventDateTime | null) => {
  const dateTime = eventDate?.dateTime;
  if (dateTime) {
    const parsed = new Date(dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const dateOnly = eventDate?.date;
  if (!dateOnly) {
    return null;
  }

  const parsed = new Date(`${dateOnly}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getGoogleErrorStatus = (error: unknown) => {
  const maybeResponse = error as { response?: { status?: number }; code?: number };
  if (typeof maybeResponse?.response?.status === "number") {
    return maybeResponse.response.status;
  }
  if (typeof maybeResponse?.code === "number") {
    return maybeResponse.code;
  }
  return undefined;
};

const getFrontendIntegrationRedirectUrl = (status: "success" | "error", errorMessage?: string) => {
  const query = new URLSearchParams({
    section: "configuraciones",
    settingsCategory: "agenda",
    integration: "google",
    status
  });

  if (errorMessage) {
    query.set("error", errorMessage.slice(0, 120));
  }

  const baseAppUrl = env.appUrl.replace(/\/$/, "");
  return `${baseAppUrl}/#/admin?${query.toString()}`;
};

const parseEventFormatMode = (value?: string | null): EventFormatMode => (value === "private" ? "private" : "complete");

const getIntegrationByClinicId = async (clinicId: string) => {
  const integration = await prisma.googleCalendarIntegration.findUnique({
    where: { clinicId }
  });

  return integration && integration.isActive ? integration : null;
};

const getVelumPrivateProperties = (event: calendar_v3.Schema$Event) => {
  const props = event.extendedProperties?.private ?? {};

  return {
    velumClinicId: props.velumClinicId,
    velumAppointmentId: props.velumAppointmentId,
    velumOrigin: props.velumOrigin,
    velumUpdatedAt: props.velumUpdatedAt
  };
};

const shouldIgnoreGoogleLoop = (args: {
  appointmentLastPushedAt?: Date | null;
  event: calendar_v3.Schema$Event;
}) => {
  if (!args.appointmentLastPushedAt) {
    return false;
  }

  const velumProps = getVelumPrivateProperties(args.event);
  if (velumProps.velumOrigin !== "velum") {
    return false;
  }

  const nowDiff = Date.now() - args.appointmentLastPushedAt.getTime();
  if (nowDiff <= GOOGLE_LOOP_WINDOW_MS) {
    return true;
  }

  const eventUpdatedAt = toDateOrNull(args.event.updated);
  if (!eventUpdatedAt) {
    return false;
  }

  return Math.abs(eventUpdatedAt.getTime() - args.appointmentLastPushedAt.getTime()) <= GOOGLE_LOOP_WINDOW_MS;
};

const getPatientDisplayName = (appointment: Prisma.AppointmentGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        email: true;
        profile: {
          select: {
            firstName: true;
            lastName: true;
          };
        };
      };
    };
  };
}>) => {
  const firstName = appointment.user.profile?.firstName?.trim() ?? "";
  const lastName = appointment.user.profile?.lastName?.trim() ?? "";
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || appointment.user.email;
};

const getPatientInitials = (name: string) => {
  const chunks = name
    .split(/\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length === 0) {
    return "PX";
  }

  const initials = chunks.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
  return initials || "PX";
};

const getTreatmentName = (reason?: string | null) => {
  const normalized = (reason ?? "").trim();
  if (!normalized) {
    return "Tratamiento láser";
  }
  return normalized;
};

const buildGoogleEventPayload = async (
  integration: GoogleCalendarIntegration,
  appointment: Prisma.AppointmentGetPayload<{
    include: {
      user: {
        select: {
          id: true;
          email: true;
          profile: {
            select: {
              firstName: true;
              lastName: true;
            };
          };
        };
      };
      cabin: {
        select: {
          name: true;
        };
      };
    };
  }>
) => {
  const paymentBadge = await getPaymentBadge(appointment.id);
  const patientName = getPatientDisplayName(appointment);
  const treatmentName = getTreatmentName(appointment.reason);
  const mode = parseEventFormatMode(integration.eventFormatMode);

  const summary =
    mode === "complete"
      ? `${patientName} • ${treatmentName} • ${paymentBadge}`
      : `Cita privada • ${paymentBadge}`;

  const descriptionLines =
    mode === "complete"
      ? [
          `VELUM Appointment ID: ${appointment.id}`,
          `Paciente: ${patientName}`,
          `Tratamiento: ${treatmentName}`,
          `Pago: ${paymentBadge}`,
          `Cabina: ${appointment.cabin?.name ?? "Sin cabina"}`
        ]
      : [
          `VELUM Appointment ID: ${appointment.id}`,
          `Paciente: ${getPatientInitials(patientName)}-${appointment.user.id.slice(0, 6)}`,
          "Tratamiento: Privado",
          `Pago: ${paymentBadge}`,
          `Cabina: ${appointment.cabin?.name ?? "Sin cabina"}`
        ];

  const velumUpdatedAtIso = new Date().toISOString();

  return {
    summary,
    description: descriptionLines.join("\n"),
    start: { dateTime: appointment.startAt.toISOString() },
    end: { dateTime: appointment.endAt.toISOString() },
    extendedProperties: {
      private: {
        velumClinicId: appointment.clinicId,
        velumAppointmentId: appointment.id,
        velumOrigin: "velum",
        velumUpdatedAt: velumUpdatedAtIso
      }
    }
  } as calendar_v3.Schema$Event;
};

const stopWatchChannelIfPresent = async (integration: GoogleCalendarIntegration) => {
  if (!integration.watchChannelId || !integration.watchResourceId) {
    return;
  }

  try {
    await withGoogleCalendarClient(integration, async ({ calendar }) => {
      await calendar.channels.stop({
        requestBody: {
          id: integration.watchChannelId ?? undefined,
          resourceId: integration.watchResourceId ?? undefined
        }
      });
    });
  } catch (error: unknown) {
    logger.warn({ integrationId: integration.id, err: error }, "Unable to stop stale Google watch channel");
  }
};

const syncChangedGoogleEventIntoVelum = async (
  integration: GoogleCalendarIntegration,
  event: calendar_v3.Schema$Event
) => {
  const props = getVelumPrivateProperties(event);

  if (!props.velumAppointmentId || !props.velumClinicId || props.velumClinicId !== integration.clinicId) {
    return;
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: props.velumAppointmentId },
    select: {
      id: true,
      clinicId: true,
      userId: true,
      startAt: true,
      endAt: true,
      status: true,
      canceledAt: true,
      lastPushedAt: true
    }
  });

  if (!appointment || appointment.clinicId !== integration.clinicId) {
    return;
  }

  if (shouldIgnoreGoogleLoop({ appointmentLastPushedAt: appointment.lastPushedAt, event })) {
    logger.debug({ appointmentId: appointment.id, eventId: event.id }, "Ignored Google event update to prevent loop");
    return;
  }

  if (event.status === "cancelled") {
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "canceled",
        canceledAt: appointment.canceledAt ?? new Date(),
        canceledReason: "Cancelado desde Google Calendar",
        syncStatus: "ok",
        lastSyncedAt: new Date()
      }
    });
    return;
  }

  if (!ALLOWED_SYNCABLE_STATUSES.includes(appointment.status)) {
    return;
  }

  const incomingStart = parseGoogleDateTime(event.start);
  const incomingEnd = parseGoogleDateTime(event.end);

  if (!incomingStart || !incomingEnd || incomingEnd <= incomingStart) {
    return;
  }

  const hasTimeChanges =
    appointment.startAt.getTime() !== incomingStart.getTime() || appointment.endAt.getTime() !== incomingEnd.getTime();

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      startAt: hasTimeChanges ? incomingStart : undefined,
      endAt: hasTimeChanges ? incomingEnd : undefined,
      status: appointment.status === "canceled" ? "scheduled" : undefined,
      canceledAt: hasTimeChanges ? null : undefined,
      canceledReason: hasTimeChanges ? null : undefined,
      syncStatus: "ok",
      lastSyncedAt: new Date()
    }
  });
};

const runGoogleSyncInternal = async (
  integration: GoogleCalendarIntegration,
  mode: SyncMode
): Promise<{ nextSyncToken: string | null }> => {
  return withGoogleCalendarClient(integration, async ({ calendar }) => {
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;

    do {
      const response = await calendar.events.list({
        calendarId: integration.calendarId,
        singleEvents: true,
        showDeleted: true,
        maxResults: 250,
        pageToken,
        syncToken: mode === "incremental" ? integration.syncToken ?? undefined : undefined
      });

      const events = response.data.items ?? [];
      for (const event of events) {
        await syncChangedGoogleEventIntoVelum(integration, event);
      }

      pageToken = response.data.nextPageToken ?? undefined;
      if (response.data.nextSyncToken) {
        nextSyncToken = response.data.nextSyncToken;
      }
    } while (pageToken);

    return { nextSyncToken };
  });
};

export const getGoogleCalendarIntegrationStatus = async (clinicId: string) => {
  const integration = await prisma.googleCalendarIntegration.findUnique({ where: { clinicId } });

  if (!integration || !integration.isActive) {
    return {
      connected: false,
      email: null,
      calendarId: null,
      eventFormatMode: "complete" as EventFormatMode,
      lastSyncAt: null,
      watchExpiration: null
    };
  }

  return {
    connected: true,
    email: integration.email,
    calendarId: integration.calendarId,
    eventFormatMode: parseEventFormatMode(integration.eventFormatMode),
    lastSyncAt: integration.lastSyncAt,
    watchExpiration: integration.watchExpiration
  };
};

export const getGoogleCalendarConnectUrl = async (args: { userId: string; clinicId: string }) => {
  const oauth2Client = createGoogleOAuthClient();

  const state = jwt.sign(
    {
      sub: args.userId,
      clinicId: args.clinicId,
      provider: "google-calendar"
    } as OAuthStatePayload,
    env.jwtSecret,
    { expiresIn: "10m" }
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GOOGLE_OAUTH_SCOPES],
    include_granted_scopes: true,
    state
  });

  return { url };
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
        params: {
          ttl: String(GOOGLE_WATCH_TTL_SECONDS)
        }
      }
    });

    return response.data;
  });

  const expirationMs = watchResponse.expiration ? Number(watchResponse.expiration) : Number.NaN;
  const watchExpiration = Number.isNaN(expirationMs) ? null : new Date(expirationMs);

  const updated = await prisma.googleCalendarIntegration.update({
    where: { id: integration.id },
    data: {
      watchChannelId: watchResponse.id ?? null,
      watchResourceId: watchResponse.resourceId ?? null,
      watchExpiration
    }
  });

  return updated;
};

export const handleGoogleCalendarOAuthCallback = async (args: { code: string; state: string }) => {
  try {
    const decoded = jwt.verify(args.state, env.jwtSecret) as OAuthStatePayload;
    if (decoded.provider !== "google-calendar" || !decoded.clinicId) {
      throw new Error("OAuth state is invalid");
    }

    const oauth2Client = createGoogleOAuthClient();

const runtimeClientId = env.googleClientId;
const runtimeClientSecret = env.googleClientSecret;
const runtimeRedirectUri = env.googleRedirectUri;

const tokenPayload = new URLSearchParams({
  code: args.code,
  client_id: runtimeClientId,
  client_secret: runtimeClientSecret,
  redirect_uri: runtimeRedirectUri,
  grant_type: "authorization_code"
});

const tokenHttpResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: tokenPayload
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

const tokenResponse = {
  tokens: {
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token,
    scope: tokenJson.scope,
    expiry_date: tokenJson.expires_in ? Date.now() + tokenJson.expires_in * 1000 : undefined
  }
};

oauth2Client.setCredentials(tokenResponse.tokens);


    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    const profile = await oauth2.userinfo.get();

    const clinicId = decoded.clinicId;
    const existing = await prisma.googleCalendarIntegration.findUnique({ where: { clinicId } });

    const accessToken = tokenResponse.tokens.access_token ?? (existing ? decrypt(existing.accessTokenEnc) : null);
    const refreshToken = tokenResponse.tokens.refresh_token ?? (existing ? decrypt(existing.refreshTokenEnc) : null);

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
        scope: tokenResponse.tokens.scope ?? null,
        tokenExpiry: tokenResponse.tokens.expiry_date ? new Date(tokenResponse.tokens.expiry_date) : null,
        isActive: true,
        eventFormatMode: parseEventFormatMode(existing?.eventFormatMode)
      },
      update: {
        email: profile.data.email ?? existing?.email ?? "unknown@google",
        calendarId: existing?.calendarId ?? "primary",
        accessTokenEnc: encrypt(accessToken),
        refreshTokenEnc: encrypt(refreshToken),
        scope: tokenResponse.tokens.scope ?? existing?.scope ?? null,
        tokenExpiry: tokenResponse.tokens.expiry_date ? new Date(tokenResponse.tokens.expiry_date) : existing?.tokenExpiry ?? null,
        isActive: true
      }
    });

    await registerGoogleCalendarWatch(integration.id);

    await enqueueIntegrationJob({
      clinicId,
      googleIntegrationId: integration.id,
      type: "google.sync.full",
      payload: { source: "oauth_callback" }
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
  if (!integration) {
    return { disconnected: true };
  }

  await stopWatchChannelIfPresent(integration);

  await prisma.googleCalendarIntegration.update({
    where: { id: integration.id },
    data: {
      isActive: false,
      watchChannelId: null,
      watchResourceId: null,
      watchExpiration: null,
      syncToken: null
    }
  });

  return { disconnected: true };
};

export const updateGoogleCalendarIntegrationSettings = async (clinicId: string, eventFormatMode: EventFormatMode) => {
  const integration = await getIntegrationByClinicId(clinicId);
  if (!integration) {
    const error = new Error("Google Calendar no está conectado") as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  const updated = await prisma.googleCalendarIntegration.update({
    where: { id: integration.id },
    data: {
      eventFormatMode
    }
  });

  return {
    eventFormatMode: parseEventFormatMode(updated.eventFormatMode)
  };
};

export const enqueueGoogleCalendarSyncFromWebhook = async (args: {
  channelId: string;
  resourceId: string;
  resourceState: string;
}) => {
  const integration = await prisma.googleCalendarIntegration.findFirst({
    where: {
      isActive: true,
      watchChannelId: args.channelId,
      watchResourceId: args.resourceId
    }
  });

  if (!integration) {
    logger.warn({ channelId: args.channelId, resourceId: args.resourceId }, "Webhook did not match any active integration");
    return;
  }

  const existingPending = await prisma.integrationJob.findFirst({
    where: {
      googleIntegrationId: integration.id,
      type: "google.sync.incremental",
      status: {
        in: [IntegrationJobStatus.pending, IntegrationJobStatus.processing]
      }
    },
    orderBy: { createdAt: "desc" }
  });

  if (existingPending) {
    return;
  }

  await enqueueIntegrationJob({
    clinicId: integration.clinicId,
    googleIntegrationId: integration.id,
    type: "google.sync.incremental",
    payload: {
      source: "google_webhook",
      resourceState: args.resourceState
    }
  });
};

export const runGoogleCalendarFullSync = async (integrationId: string) => {
  const integration = await prisma.googleCalendarIntegration.findUnique({ where: { id: integrationId } });
  if (!integration || !integration.isActive) {
    return;
  }

  const { nextSyncToken } = await runGoogleSyncInternal(integration, "full");

  await prisma.googleCalendarIntegration.update({
    where: { id: integration.id },
    data: {
      syncToken: nextSyncToken,
      lastSyncAt: new Date()
    }
  });
};

export const runGoogleCalendarIncrementalSync = async (integrationId: string) => {
  const integration = await prisma.googleCalendarIntegration.findUnique({ where: { id: integrationId } });
  if (!integration || !integration.isActive) {
    return;
  }

  if (!integration.syncToken) {
    await runGoogleCalendarFullSync(integration.id);
    return;
  }

  try {
    const { nextSyncToken } = await runGoogleSyncInternal(integration, "incremental");

    await prisma.googleCalendarIntegration.update({
      where: { id: integration.id },
      data: {
        syncToken: nextSyncToken ?? integration.syncToken,
        lastSyncAt: new Date()
      }
    });
  } catch (error: unknown) {
    if (getGoogleErrorStatus(error) === 410) {
      logger.warn({ integrationId: integration.id }, "Google sync token expired, running full sync");
      await prisma.googleCalendarIntegration.update({
        where: { id: integration.id },
        data: { syncToken: null }
      });
      await runGoogleCalendarFullSync(integration.id);
      return;
    }

    throw error;
  }
};

export const ensureGoogleCalendarWatches = async () => {
  const soon = new Date(Date.now() + GOOGLE_WATCH_REFRESH_THRESHOLD_MS);

  const integrations = await prisma.googleCalendarIntegration.findMany({
    where: {
      isActive: true,
      OR: [{ watchExpiration: null }, { watchExpiration: { lte: soon } }]
    },
    select: {
      id: true
    }
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

export const enqueueGoogleAppointmentSync = async (args: {
  clinicId: string;
  appointmentId: string;
  action: GoogleAppointmentJobAction;
}) => {
  const typeByAction: Record<GoogleAppointmentJobAction, IntegrationJobType> = {
    create: "google.appointment.create",
    update: "google.appointment.update",
    cancel: "google.appointment.cancel"
  };

  await enqueueIntegrationJob({
    clinicId: args.clinicId,
    type: typeByAction[args.action],
    payload: {
      appointmentId: args.appointmentId
    }
  });
};

const loadAppointmentForGooglePush = async (appointmentId: string) => {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          profile: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        }
      },
      cabin: {
        select: {
          name: true
        }
      }
    }
  });
};

const pushAppointmentCreateOrUpdate = async (
  integration: GoogleCalendarIntegration,
  appointmentId: string,
  mode: "create" | "update"
) => {
  const appointment = await loadAppointmentForGooglePush(appointmentId);
  if (!appointment) {
    return;
  }

  const eventPayload = await buildGoogleEventPayload(integration, appointment);

  await withGoogleCalendarClient(integration, async ({ calendar }) => {
    if (mode === "create" && !appointment.googleEventId) {
      const created = await calendar.events.insert({
        calendarId: integration.calendarId,
        requestBody: eventPayload,
        sendUpdates: "none"
      });

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          googleEventId: created.data.id ?? appointment.googleEventId,
          googleCalendarId: integration.calendarId,
          syncStatus: "ok",
          lastSyncedAt: new Date(),
          lastPushedAt: new Date()
        }
      });

      return;
    }

    const eventId = appointment.googleEventId;
    if (!eventId) {
      const inserted = await calendar.events.insert({
        calendarId: integration.calendarId,
        requestBody: eventPayload,
        sendUpdates: "none"
      });

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          googleEventId: inserted.data.id ?? null,
          googleCalendarId: integration.calendarId,
          syncStatus: "ok",
          lastSyncedAt: new Date(),
          lastPushedAt: new Date()
        }
      });

      return;
    }

    await calendar.events.patch({
      calendarId: integration.calendarId,
      eventId,
      requestBody: eventPayload,
      sendUpdates: "none"
    });

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        googleCalendarId: integration.calendarId,
        syncStatus: "ok",
        lastSyncedAt: new Date(),
        lastPushedAt: new Date()
      }
    });
  });
};

const pushAppointmentCancel = async (integration: GoogleCalendarIntegration, appointmentId: string) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      googleEventId: true,
      googleCalendarId: true
    }
  });

  if (!appointment) {
    return;
  }

  if (!appointment.googleEventId) {
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        syncStatus: "ok",
        lastSyncedAt: new Date(),
        lastPushedAt: new Date()
      }
    });
    return;
  }

  await withGoogleCalendarClient(integration, async ({ calendar }) => {
    await calendar.events.patch({
      calendarId: appointment.googleCalendarId ?? integration.calendarId,
      eventId: appointment.googleEventId ?? undefined,
      requestBody: {
        status: "cancelled",
        extendedProperties: {
          private: {
            velumOrigin: "velum",
            velumUpdatedAt: new Date().toISOString()
          }
        }
      },
      sendUpdates: "none"
    });
  });

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      syncStatus: "ok",
      lastSyncedAt: new Date(),
      lastPushedAt: new Date()
    }
  });
};

export const runGoogleAppointmentSync = async (args: {
  clinicId: string;
  appointmentId: string;
  action: GoogleAppointmentJobAction;
}) => {
  const integration = await getIntegrationByClinicId(args.clinicId);
  if (!integration) {
    return;
  }

  try {
    if (args.action === "cancel") {
      await pushAppointmentCancel(integration, args.appointmentId);
      return;
    }

    await pushAppointmentCreateOrUpdate(integration, args.appointmentId, args.action === "create" ? "create" : "update");
  } catch (error: unknown) {
    await prisma.appointment.update({
      where: { id: args.appointmentId },
      data: {
        syncStatus: "error",
        lastSyncedAt: new Date()
      }
    });
    throw error;
  }
};

export const runGoogleIntegrationJobByType = async (
  type: IntegrationJobType,
  payload: Prisma.JsonValue,
  fallbackClinicId: string,
  googleIntegrationId?: string | null
) => {
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
    if (integration) {
      await runGoogleCalendarFullSync(integration.id);
    }
    return;
  }

  if (type === "google.sync.incremental") {
    if (googleIntegrationId) {
      await runGoogleCalendarIncrementalSync(googleIntegrationId);
      return;
    }

    const integration = await getIntegrationByClinicId(fallbackClinicId);
    if (integration) {
      await runGoogleCalendarIncrementalSync(integration.id);
    }
    return;
  }

  const appointmentId = typeof payloadObject.appointmentId === "string" ? payloadObject.appointmentId : "";
  if (!appointmentId) {
    throw new Error(`Job ${type} is missing appointmentId`);
  }

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
