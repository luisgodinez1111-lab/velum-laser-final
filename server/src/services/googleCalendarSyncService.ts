/**
 * Sincronización Google Calendar → Velum.
 * Maneja full sync, incremental sync y la lógica de actualización de citas
 * a partir de cambios detectados en Google Calendar.
 */
import { GoogleCalendarIntegration } from "@prisma/client";
import { calendar_v3 } from "googleapis";
import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { logger } from "../utils/logger";
import { withGoogleCalendarClient } from "./googleCalendarClient";
import {
  ALLOWED_SYNCABLE_STATUSES,
  SyncMode,
  getGoogleErrorStatus,
  getVelumPrivateProperties,
  parseGoogleDateTime,
  shouldIgnoreGoogleLoop,
} from "./googleCalendarCore";

export const syncChangedGoogleEventIntoVelum = async (
  integration: GoogleCalendarIntegration,
  event: calendar_v3.Schema$Event
): Promise<void> => {
  const props = getVelumPrivateProperties(event);

  if (!props.velumAppointmentId || !props.velumClinicId || props.velumClinicId !== integration.clinicId) {
    return;
  }

  const appointment = await withTenantContext(async (tx) => tx.appointment.findUnique({
    where: { id: props.velumAppointmentId },
    select: {
      id: true,
      clinicId: true,
      userId: true,
      startAt: true,
      endAt: true,
      status: true,
      canceledAt: true,
      lastPushedAt: true,
    },
  }));

  if (!appointment || appointment.clinicId !== integration.clinicId) return;

  if (shouldIgnoreGoogleLoop({ appointmentLastPushedAt: appointment.lastPushedAt, event })) {
    logger.debug({ appointmentId: appointment.id, eventId: event.id }, "Ignored Google event update to prevent loop");
    return;
  }

  if (event.status === "cancelled") {
    await withTenantContext(async (tx) => tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "canceled",
        canceledAt: appointment.canceledAt ?? new Date(),
        canceledReason: "Cancelado desde Google Calendar",
        syncStatus: "ok",
        lastSyncedAt: new Date(),
      },
    }));
    return;
  }

  if (!ALLOWED_SYNCABLE_STATUSES.includes(appointment.status)) return;

  const incomingStart = parseGoogleDateTime(event.start);
  const incomingEnd = parseGoogleDateTime(event.end);

  if (!incomingStart || !incomingEnd || incomingEnd <= incomingStart) return;

  const hasTimeChanges =
    appointment.startAt.getTime() !== incomingStart.getTime() ||
    appointment.endAt.getTime() !== incomingEnd.getTime();

  await withTenantContext(async (tx) => tx.appointment.update({
    where: { id: appointment.id },
    data: {
      startAt: hasTimeChanges ? incomingStart : undefined,
      endAt: hasTimeChanges ? incomingEnd : undefined,
      status: appointment.status === "canceled" ? "scheduled" : undefined,
      canceledAt: hasTimeChanges ? null : undefined,
      canceledReason: hasTimeChanges ? null : undefined,
      syncStatus: "ok",
      lastSyncedAt: new Date(),
    },
  }));
};

export const runGoogleSyncInternal = async (
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
        syncToken: mode === "incremental" ? integration.syncToken ?? undefined : undefined,
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

export const runGoogleCalendarFullSync = async (integrationId: string): Promise<void> => {
  const integration = await withTenantContext(async (tx) => tx.googleCalendarIntegration.findUnique({ where: { id: integrationId } }));
  if (!integration || !integration.isActive) return;

  const { nextSyncToken } = await runGoogleSyncInternal(integration, "full");

  await withTenantContext(async (tx) => tx.googleCalendarIntegration.update({
    where: { id: integration.id },
    data: { syncToken: nextSyncToken, lastSyncAt: new Date() },
  }));
};

export const runGoogleCalendarIncrementalSync = async (integrationId: string): Promise<void> => {
  const integration = await withTenantContext(async (tx) => tx.googleCalendarIntegration.findUnique({ where: { id: integrationId } }));
  if (!integration || !integration.isActive) return;

  if (!integration.syncToken) {
    await runGoogleCalendarFullSync(integration.id);
    return;
  }

  try {
    const { nextSyncToken } = await runGoogleSyncInternal(integration, "incremental");

    await withTenantContext(async (tx) => tx.googleCalendarIntegration.update({
      where: { id: integration.id },
      data: {
        syncToken: nextSyncToken ?? integration.syncToken,
        lastSyncAt: new Date(),
      },
    }));
  } catch (error: unknown) {
    if (getGoogleErrorStatus(error) === 410) {
      logger.warn({ integrationId: integration.id }, "Google sync token expired, running full sync");
      await withTenantContext(async (tx) => tx.googleCalendarIntegration.update({
        where: { id: integration.id },
        data: { syncToken: null },
      }));
      await runGoogleCalendarFullSync(integration.id);
      return;
    }
    throw error;
  }
};
