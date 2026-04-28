/**
 * Push de citas de Velum → Google Calendar.
 * Maneja la creación, actualización y cancelación de eventos en Google Calendar
 * cuando una cita cambia en Velum, y el encolado de esos jobs asíncronos.
 */
import { GoogleCalendarIntegration, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { withGoogleCalendarClient } from "./googleCalendarClient";
import { enqueueIntegrationJob, IntegrationJobType } from "./integrationJobService";
import { getPaymentBadge } from "./paymentBadgeService";
import {
  GoogleAppointmentJobAction,
  EventFormatMode,
  getIntegrationByClinicId,
  getPatientDisplayName,
  getPatientInitials,
  getTreatmentName,
  parseEventFormatMode,
} from "./googleCalendarCore";
import { calendar_v3 } from "googleapis";

const buildGoogleEventPayload = async (
  integration: GoogleCalendarIntegration,
  appointment: Prisma.AppointmentGetPayload<{
    include: {
      user: {
        select: {
          id: true;
          email: true;
          profile: { select: { firstName: true; lastName: true } };
        };
      };
      cabin: { select: { name: true } };
    };
  }>
): Promise<calendar_v3.Schema$Event> => {
  const paymentBadge = await getPaymentBadge(appointment.id);
  const patientName = getPatientDisplayName(appointment);
  const treatmentName = getTreatmentName(appointment.reason);
  const mode: EventFormatMode = parseEventFormatMode(integration.eventFormatMode);

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
          `Cabina: ${appointment.cabin?.name ?? "Sin cabina"}`,
        ]
      : [
          `VELUM Appointment ID: ${appointment.id}`,
          `Paciente: ${getPatientInitials(patientName)}-${appointment.user.id.slice(0, 6)}`,
          "Tratamiento: Privado",
          `Pago: ${paymentBadge}`,
          `Cabina: ${appointment.cabin?.name ?? "Sin cabina"}`,
        ];

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
        velumUpdatedAt: new Date().toISOString(),
      },
    },
  };
};

const loadAppointmentForGooglePush = (appointmentId: string) =>
  withTenantContext(async (tx) => tx.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      },
      cabin: { select: { name: true } },
    },
  }));

const pushAppointmentCreateOrUpdate = async (
  integration: GoogleCalendarIntegration,
  appointmentId: string,
  mode: "create" | "update"
): Promise<void> => {
  const appointment = await loadAppointmentForGooglePush(appointmentId);
  if (!appointment) return;

  const eventPayload = await buildGoogleEventPayload(integration, appointment);

  await withGoogleCalendarClient(integration, async ({ calendar }) => {
    if (mode === "create" && !appointment.googleEventId) {
      const created = await calendar.events.insert({
        calendarId: integration.calendarId,
        requestBody: eventPayload,
        sendUpdates: "none",
      });

      await withTenantContext(async (tx) => tx.appointment.update({
        where: { id: appointment.id },
        data: {
          googleEventId: created.data.id ?? appointment.googleEventId,
          googleCalendarId: integration.calendarId,
          syncStatus: "ok",
          lastSyncedAt: new Date(),
          lastPushedAt: new Date(),
        },
      }));
      return;
    }

    const eventId = appointment.googleEventId;
    if (!eventId) {
      const inserted = await calendar.events.insert({
        calendarId: integration.calendarId,
        requestBody: eventPayload,
        sendUpdates: "none",
      });
      await withTenantContext(async (tx) => tx.appointment.update({
        where: { id: appointment.id },
        data: {
          googleEventId: inserted.data.id ?? null,
          googleCalendarId: integration.calendarId,
          syncStatus: "ok",
          lastSyncedAt: new Date(),
          lastPushedAt: new Date(),
        },
      }));
      return;
    }

    await calendar.events.patch({
      calendarId: integration.calendarId,
      eventId,
      requestBody: eventPayload,
      sendUpdates: "none",
    });

    await withTenantContext(async (tx) => tx.appointment.update({
      where: { id: appointment.id },
      data: {
        googleCalendarId: integration.calendarId,
        syncStatus: "ok",
        lastSyncedAt: new Date(),
        lastPushedAt: new Date(),
      },
    }));
  });
};

const pushAppointmentCancel = async (
  integration: GoogleCalendarIntegration,
  appointmentId: string
): Promise<void> => {
  const appointment = await withTenantContext(async (tx) => tx.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, googleEventId: true, googleCalendarId: true },
  }));

  if (!appointment) return;

  if (!appointment.googleEventId) {
    await withTenantContext(async (tx) => tx.appointment.update({
      where: { id: appointment.id },
      data: { syncStatus: "ok", lastSyncedAt: new Date(), lastPushedAt: new Date() },
    }));
    return;
  }

  await withGoogleCalendarClient(integration, async ({ calendar }) => {
    await calendar.events.patch({
      calendarId: appointment.googleCalendarId ?? integration.calendarId,
      eventId: appointment.googleEventId ?? undefined,
      requestBody: {
        status: "cancelled",
        extendedProperties: {
          private: { velumOrigin: "velum", velumUpdatedAt: new Date().toISOString() },
        },
      },
      sendUpdates: "none",
    });
  });

  await withTenantContext(async (tx) => tx.appointment.update({
    where: { id: appointment.id },
    data: { syncStatus: "ok", lastSyncedAt: new Date(), lastPushedAt: new Date() },
  }));
};

export const runGoogleAppointmentSync = async (args: {
  clinicId: string;
  appointmentId: string;
  action: GoogleAppointmentJobAction;
}): Promise<void> => {
  const integration = await getIntegrationByClinicId(args.clinicId);
  if (!integration) return;

  try {
    if (args.action === "cancel") {
      await pushAppointmentCancel(integration, args.appointmentId);
      return;
    }
    await pushAppointmentCreateOrUpdate(integration, args.appointmentId, args.action === "create" ? "create" : "update");
  } catch (error: unknown) {
    await withTenantContext(async (tx) => tx.appointment.update({
      where: { id: args.appointmentId },
      data: { syncStatus: "error", lastSyncedAt: new Date() },
    }));
    throw error;
  }
};

export const enqueueGoogleAppointmentSync = async (args: {
  clinicId: string;
  appointmentId: string;
  action: GoogleAppointmentJobAction;
}): Promise<void> => {
  const typeByAction: Record<GoogleAppointmentJobAction, IntegrationJobType> = {
    create: "google.appointment.create",
    update: "google.appointment.update",
    cancel: "google.appointment.cancel",
  };
  await enqueueIntegrationJob({
    clinicId: args.clinicId,
    type: typeByAction[args.action],
    payload: { appointmentId: args.appointmentId },
  });
};
