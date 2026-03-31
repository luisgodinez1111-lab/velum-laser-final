/**
 * Tipos, constantes y helpers compartidos para los módulos de Google Calendar.
 * Este archivo no exporta funciones públicas de la API — solo primitivos reutilizables.
 */
import { AppointmentStatus, GoogleCalendarIntegration, Prisma } from "@prisma/client";
import { calendar_v3 } from "googleapis";
import { prisma } from "../db/prisma";
import { env } from "../utils/env";

export type EventFormatMode = "complete" | "private";
export type SyncMode = "full" | "incremental";

export type OAuthStatePayload = {
  sub: string;
  clinicId: string;
  provider: "google-calendar";
};

export type GoogleAppointmentJobAction = "create" | "update" | "cancel";

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
] as const;

export const GOOGLE_WEBHOOK_PATH = "/api/webhooks/google-calendar";
export const GOOGLE_WATCH_TTL_SECONDS = 60 * 60 * 24 * 7;
export const GOOGLE_WATCH_REFRESH_THRESHOLD_MS = 1000 * 60 * 60 * 6;
export const GOOGLE_LOOP_WINDOW_MS = Math.max(1, env.googleSyncIgnoreWindowSeconds) * 1000;
export const ALLOWED_SYNCABLE_STATUSES: AppointmentStatus[] = ["scheduled", "confirmed", "canceled"];

export const toDateOrNull = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const parseGoogleDateTime = (
  eventDate?: calendar_v3.Schema$EventDateTime | null
): Date | null => {
  const dateTime = eventDate?.dateTime;
  if (dateTime) {
    const parsed = new Date(dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const dateOnly = eventDate?.date;
  if (!dateOnly) return null;
  const parsed = new Date(`${dateOnly}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getGoogleErrorStatus = (error: unknown): number | undefined => {
  const maybeResponse = error as { response?: { status?: number }; code?: number };
  if (typeof maybeResponse?.response?.status === "number") return maybeResponse.response.status;
  if (typeof maybeResponse?.code === "number") return maybeResponse.code;
  return undefined;
};

export const getFrontendIntegrationRedirectUrl = (
  status: "success" | "error",
  errorMessage?: string
): string => {
  const query = new URLSearchParams({
    section: "configuraciones",
    settingsCategory: "agenda",
    integration: "google",
    status,
  });
  if (errorMessage) query.set("error", errorMessage.slice(0, 120));
  const baseAppUrl = env.appUrl.replace(/\/$/, "");
  return `${baseAppUrl}/#/admin?${query.toString()}`;
};

export const parseEventFormatMode = (value?: string | null): EventFormatMode =>
  value === "private" ? "private" : "complete";

export const getIntegrationByClinicId = async (
  clinicId: string
): Promise<GoogleCalendarIntegration | null> => {
  const integration = await prisma.googleCalendarIntegration.findUnique({ where: { clinicId } });
  return integration && integration.isActive ? integration : null;
};

export const getVelumPrivateProperties = (event: calendar_v3.Schema$Event) => {
  const props = event.extendedProperties?.private ?? {};
  return {
    velumClinicId: props.velumClinicId,
    velumAppointmentId: props.velumAppointmentId,
    velumOrigin: props.velumOrigin,
    velumUpdatedAt: props.velumUpdatedAt,
  };
};

export const shouldIgnoreGoogleLoop = (args: {
  appointmentLastPushedAt?: Date | null;
  event: calendar_v3.Schema$Event;
}): boolean => {
  if (!args.appointmentLastPushedAt) return false;
  const velumProps = getVelumPrivateProperties(args.event);
  if (velumProps.velumOrigin !== "velum") return false;
  const nowDiff = Date.now() - args.appointmentLastPushedAt.getTime();
  if (nowDiff <= GOOGLE_LOOP_WINDOW_MS) return true;
  const eventUpdatedAt = toDateOrNull(args.event.updated);
  if (!eventUpdatedAt) return false;
  return Math.abs(eventUpdatedAt.getTime() - args.appointmentLastPushedAt.getTime()) <= GOOGLE_LOOP_WINDOW_MS;
};

export const getPatientDisplayName = (
  appointment: Prisma.AppointmentGetPayload<{
    include: {
      user: {
        select: {
          id: true;
          email: true;
          profile: { select: { firstName: true; lastName: true } };
        };
      };
    };
  }>
): string => {
  const firstName = appointment.user.profile?.firstName?.trim() ?? "";
  const lastName = appointment.user.profile?.lastName?.trim() ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || appointment.user.email;
};

export const getPatientInitials = (name: string): string => {
  const chunks = name
    .split(/\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (chunks.length === 0) return "PX";
  const initials = chunks.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
  return initials || "PX";
};

export const getTreatmentName = (reason?: string | null): string => {
  const normalized = (reason ?? "").trim();
  return normalized || "Tratamiento láser";
};
