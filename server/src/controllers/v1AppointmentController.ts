import { Response } from "express";
import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import { enqueueGoogleAppointmentSync } from "../services/googleCalendarIntegrationService";
import {
  AgendaValidationError,
  getAgendaConfig,
  getAgendaDaySnapshot,
  resolveAppointmentPlacement,
  syncAppointmentWorkflow
} from "../services/agendaService";
import {
  hasClinicalEligibility,
  resolveTreatmentForAppointment,
  preferredCabinIdsForTreatment,
  deriveAppointmentEndAt,
  type ResolvedAgendaTreatment,
} from "../services/appointmentEligibilityService";
import { Request } from "express";
import { env } from "../utils/env";
import { generateAppointmentConfirmToken as _genToken, verifyAppointmentConfirmToken } from "../utils/appointmentToken";
import { getClinicIdByUserId } from "../utils/resolveClinicId";
import { logger } from "../utils/logger";
import { onAppointmentBooked, onAppointmentConfirmed, onAppointmentCancelledByClinic, onAppointmentCancelledByPatient } from "../services/notificationService";
import { agendaDateParamSchema } from "../validators/agenda";
import { appointmentCreateSchema, appointmentUpdateSchema } from "../validators/appointments";
import type { z } from "zod";

const privilegedRoles = new Set(["staff", "admin", "system"]);

const hasPrivilegedRole = (role: string) => privilegedRoles.has(role);

const zonedDateParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const byType = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: byType("year"),
    month: byType("month"),
    day: byType("day")
  };
};

const isoWeekKey = ({ year, month, day }: { year: number; month: number; day: number }) => {
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNum = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((utcDate.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const enforceActiveAppointmentLimits = async ({
  clinicId,
  userId,
  candidateStartAt,
  excludeAppointmentId
}: {
  clinicId: string;
  userId: string;
  candidateStartAt: Date;
  excludeAppointmentId?: string;
}) => {
  const { policy } = await getAgendaConfig();

  const candidateParts = zonedDateParts(candidateStartAt, policy.timezone);
  const candidateWeekKey = isoWeekKey(candidateParts);
  const candidateMonthKey = `${candidateParts.year}-${String(candidateParts.month).padStart(2, "0")}`;

  // Compute tight date bounds so we only fetch appointments in the relevant week/month window
  const monthStart = new Date(Date.UTC(candidateParts.year, candidateParts.month - 1, 1));
  const monthEnd = new Date(Date.UTC(candidateParts.year, candidateParts.month, 0, 23, 59, 59, 999));
  const candidateUtcDate = new Date(Date.UTC(candidateParts.year, candidateParts.month - 1, candidateParts.day));
  const dayNum = (candidateUtcDate.getUTCDay() + 6) % 7;
  const weekStart = new Date(candidateUtcDate);
  weekStart.setUTCDate(weekStart.getUTCDate() - dayNum);
  const queryFrom = weekStart < monthStart ? weekStart : monthStart;

  const upcomingAppointments = await withTenantContext(async (tx) => tx.appointment.findMany({
    where: {
      clinicId,
      userId,
      status: { in: ["scheduled", "confirmed"] },
      startAt: { gte: queryFrom, lte: monthEnd },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {})
    },
    select: { startAt: true },
  }));

  let countWeek = 0;
  let countMonth = 0;
  for (const appointment of upcomingAppointments) {
    const parts = zonedDateParts(appointment.startAt, policy.timezone);
    if (isoWeekKey(parts) === candidateWeekKey) {
      countWeek += 1;
    }
    if (`${parts.year}-${String(parts.month).padStart(2, "0")}` === candidateMonthKey) {
      countMonth += 1;
    }
  }

  if (countWeek >= policy.maxActiveAppointmentsPerWeek) {
    throw new AgendaValidationError(
      `Límite semanal alcanzado: máximo ${policy.maxActiveAppointmentsPerWeek} citas activas por socio`,
      409
    );
  }
  if (countMonth >= policy.maxActiveAppointmentsPerMonth) {
    throw new AgendaValidationError(
      `Límite mensual alcanzado: máximo ${policy.maxActiveAppointmentsPerMonth} citas activas por socio`,
      409
    );
  }
};

const respondIfAgendaError = (error: unknown, res: Response) => {
  if (error instanceof AgendaValidationError) {
    res.status(error.statusCode).json({ message: error.message });
    return true;
  }
  return false;
};

export const createAppointment = async (req: AuthRequest, res: Response) => {
  // phase1 onboarding gate — verifica expediente médico aprobado
  if (req.user?.role === "member") {
    const memberId = req.user.id;

    const intake = await prisma.medicalIntake.findUnique({
      where: { userId: memberId },
      select: { status: true },
    });
    if (!intake || intake.status !== 'approved') {
      return res.status(403).json({
        message: "Completa tu expediente clínico antes de agendar.",
        code: "ONBOARDING_INCOMPLETE",
      });
    }
  }

  const payload: z.infer<typeof appointmentCreateSchema> = appointmentCreateSchema.parse(req.body);

  // phase1.2 evaluation snapshot
  const rawBody: Record<string, unknown> = req.body ?? {};
  const evaluationZones = Array.isArray(rawBody.evaluationZones)
    ? rawBody.evaluationZones.map((z: unknown) => String(z).trim()).filter(Boolean)
    : [];
  const evaluationMembership = String(rawBody.evaluationMembership ?? "").trim();
  const evaluationCostNum = Number(rawBody.evaluationCost);
  const evaluationCurrency = String(rawBody.evaluationCurrency ?? "MXN").trim().toUpperCase();

  const marker = String(
    rawBody.type ?? rawBody.appointmentType ?? rawBody.serviceType ?? payload?.reason ?? ""
  ).toLowerCase();
  const isEvaluation = marker.includes("evalu");

  if (isEvaluation) {
    const validEval =
      evaluationZones.length > 0 &&
      Boolean(evaluationMembership) &&
      Number.isFinite(evaluationCostNum) &&
      evaluationCostNum > 0;

    if (!validEval) {
      return res.status(400).json({
        message: "Para cita de evaluacion debes indicar zonas, membresia y costo.",
        code: "EVALUATION_DATA_REQUIRED"
      });
    }
  }

  const hasSnapshot =
    evaluationZones.length > 0 ||
    Boolean(evaluationMembership) ||
    (Number.isFinite(evaluationCostNum) && evaluationCostNum > 0);

  if (hasSnapshot) {
    const snapshot = {
      zones: evaluationZones,
      membership: evaluationMembership || null,
      cost: Number.isFinite(evaluationCostNum) ? evaluationCostNum : null,
      currency: evaluationCurrency || "MXN",
      capturedAt: new Date().toISOString()
    };
    const line = `[EVAL_SNAPSHOT] ${JSON.stringify(snapshot)}`;
    payload.reason = [payload?.reason, line].filter(Boolean).join("\n");
  }
  const startAt = new Date(payload.startAt);

  const isPrivileged = hasPrivilegedRole(req.user!.role);
  const targetUserId = isPrivileged ? payload.userId ?? req.user!.id : req.user!.id;
  const actorClinicId = await getClinicIdByUserId(req.user!.id);
  const targetClinicId = targetUserId === req.user!.id ? actorClinicId : await getClinicIdByUserId(targetUserId);

  if (targetUserId !== req.user!.id && !isPrivileged) {
    return res.status(403).json({ message: "No puedes crear citas para otros usuarios" });
  }

  if (targetClinicId !== actorClinicId) {
    return res.status(403).json({ message: "No puedes agendar usuarios de otra clínica" });
  }

  const eligibility = await hasClinicalEligibility(targetUserId);

  if (!eligibility.intakeOk) {
    return res.status(409).json({ message: "El expediente debe estar submitted o approved para agendar" });
  }

  if (!eligibility.membershipOk && !isEvaluation) {
    return res.status(409).json({ message: "Se requiere membresía activa para agendar" });
  }

  let treatment: ResolvedAgendaTreatment | null = null;
  try {
    treatment = await resolveTreatmentForAppointment({
      treatmentId: payload.treatmentId,
      reason: payload.reason
    });
  } catch (error) {
    if (respondIfAgendaError(error, res)) {
      return;
    }
    throw error;
  }

  const endAt = deriveAppointmentEndAt({ startAt, payloadEndAt: payload.endAt, treatment });
  if (!endAt) {
    return res.status(400).json({ message: "Debes indicar la fecha de fin cuando no hay tratamiento seleccionado" });
  }
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return res.status(400).json({ message: "Las fechas proporcionadas no son válidas" });
  }
  if (endAt <= startAt) {
    return res.status(400).json({ message: "La fecha de fin debe ser mayor a la de inicio" });
  }

  const treatmentCabinPriority = preferredCabinIdsForTreatment(treatment);
  if (treatment?.requiresSpecificCabin && treatmentCabinPriority.length === 0) {
    return res.status(409).json({ message: "El tratamiento requiere cabina específica pero no está configurado" });
  }
  if (treatment?.requiresSpecificCabin && payload.cabinId && !treatmentCabinPriority.includes(payload.cabinId)) {
    return res.status(409).json({ message: "El tratamiento seleccionado no puede operar en esa cabina" });
  }

  const requestedCabinIds =
    treatment?.requiresSpecificCabin
      ? payload.cabinId
        ? [payload.cabinId, ...treatmentCabinPriority.filter((cabinId) => cabinId !== payload.cabinId)]
        : treatmentCabinPriority
      : payload.cabinId
        ? [payload.cabinId]
        : treatmentCabinPriority.length > 0
          ? treatmentCabinPriority
          : undefined;

  try {
    await enforceActiveAppointmentLimits({
      clinicId: actorClinicId,
      userId: targetUserId,
      candidateStartAt: startAt
    });
  } catch (error) {
    if (respondIfAgendaError(error, res)) {
      return;
    }
    throw error;
  }

  let placement: Awaited<ReturnType<typeof resolveAppointmentPlacement>>;
  try {
    placement = await resolveAppointmentPlacement({
      startAt,
      endAt,
      requestedCabinIds,
      prepBufferMinutes: treatment?.prepBufferMinutes ?? 0,
      cleanupBufferMinutes: treatment?.cleanupBufferMinutes ?? 0
    });
  } catch (error) {
    if (respondIfAgendaError(error, res)) {
      return;
    }
    throw error;
  }

  const appointment = await withTenantContext(async (tx) => tx.appointment.create({
    data: {
      clinicId: actorClinicId,
      userId: targetUserId,
      createdByUserId: req.user!.id,
      cabinId: placement.cabinId,
      treatmentId: treatment?.id ?? null,
      startAt,
      endAt,
      reason: payload.reason ?? treatment?.code ?? null,
      status: "scheduled"
    },
    include: {
      user: {
        select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } }
      },
      createdBy: {
        select: { id: true, email: true, role: true }
      },
      cabin: {
        select: { id: true, name: true }
      },
      treatment: {
        select: {
          id: true,
          name: true,
          code: true,
          durationMinutes: true,
          prepBufferMinutes: true,
          cleanupBufferMinutes: true
        }
      }
    }
  }));

  const agendaPolicy = await prisma.agendaPolicy.findFirst({ select: { timezone: true } });
  const TIMEZONE = agendaPolicy?.timezone ?? "America/Chihuahua";
  const userName = [appointment.user.profile?.firstName, appointment.user.profile?.lastName].filter(Boolean).join(" ") || appointment.user.email;
  onAppointmentBooked({
    appointmentId: appointment.id,
    userId: appointment.user.id,
    userEmail: appointment.user.email,
    userName,
    date: appointment.startAt.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TIMEZONE }),
    time: appointment.startAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TIMEZONE }),
    treatment: appointment.treatment?.name,
    cabin: appointment.cabin?.name,
  }).catch((err) => logger.error({ err }, "[appointment] booking notification failed"));

  await createAuditLog({
    userId: req.user!.id,
    targetUserId,
    action: "appointment.create",
    resourceType: "appointment",
    resourceId: appointment.id,
    ip: req.ip,
    metadata: {
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      cabinId: appointment.cabinId,
      requestId: req.headers["x-request-id"] as string | undefined,
    }
  }).catch((err) => logger.error({ err, appointmentId: appointment.id }, "[appointment] audit log failed"));

  void enqueueGoogleAppointmentSync({
    clinicId: appointment.clinicId,
    appointmentId: appointment.id,
    action: "create"
  }).catch((error) => {
    logger.error({ err: error, appointmentId: appointment.id }, "Unable to enqueue Google create sync");
  });

  return res.status(201).json(appointment);
};

export const listAppointments = async (req: AuthRequest, res: Response) => {
  const clinicId = await getClinicIdByUserId(req.user!.id);
  const isPrivileged = hasPrivilegedRole(req.user!.role);

  const queryUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const targetUserId = isPrivileged ? queryUserId : req.user!.id;

  // Admin consultando historial de un miembro específico sin fechas explícitas → sin filtro de fecha
  const skipDateFilter = isPrivileged && !!targetUserId && req.query.startDate === undefined && req.query.endDate === undefined;
  const startDate = typeof req.query.startDate === "string" ? new Date(req.query.startDate) : (skipDateFilter ? undefined : new Date(Date.now() - 30 * 86400000));
  const endDate   = typeof req.query.endDate   === "string" ? new Date(req.query.endDate)   : (skipDateFilter ? undefined : new Date(Date.now() + 90 * 86400000));

  const appointments = await withTenantContext(async (tx) => tx.appointment.findMany({
    where: {
      ...(targetUserId ? { clinicId, userId: targetUserId } : { clinicId }),
      ...(startDate || endDate ? { startAt: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } } : {})
    },
    include: {
      user: {
        select: { id: true, email: true }
      },
      createdBy: {
        select: { id: true, email: true, role: true }
      },
      cabin: {
        select: { id: true, name: true }
      },
      treatment: {
        select: {
          id: true,
          name: true,
          code: true,
          durationMinutes: true,
          prepBufferMinutes: true,
          cleanupBufferMinutes: true
        }
      }
    },
    orderBy: { startAt: "asc" },
    take: 1000
  }));

  return res.json(appointments);
};

// Endpoint dedicado para disparar la sincronización de citas (POST /api/v1/appointments/sync)
// Separa el side effect del GET /api/v1/appointments — respeta REST
export const triggerAppointmentSync = async (_req: AuthRequest, res: Response) => {
  await syncAppointmentWorkflow();
  return res.json({ ok: true });
};

export const updateAppointment = async (req: AuthRequest, res: Response) => {
  const clinicId = await getClinicIdByUserId(req.user!.id);
  const appointment = await withTenantContext(async (tx) => tx.appointment.findUnique({
    where: { id: req.params.appointmentId }
  }));

  if (!appointment) {
    return res.status(404).json({ message: "Cita no encontrada" });
  }

  if (appointment.clinicId !== clinicId) {
    return res.status(404).json({ message: "Cita no encontrada" });
  }

  const isPrivileged = hasPrivilegedRole(req.user!.role);
  const isOwner = appointment.userId === req.user!.id;

  if (!isPrivileged && !isOwner) {
    return res.status(403).json({ message: "No puedes modificar esta cita" });
  }

  const payload = appointmentUpdateSchema.parse(req.body);

  if (["confirm", "complete", "mark_no_show"].includes(payload.action) && !isPrivileged) {
    return res.status(403).json({ message: "Solo el personal autorizado puede ejecutar esta acción" });
  }

  if (!isPrivileged && payload.action === "reschedule" && appointment.startAt.getTime() - Date.now() < env.appointmentRescheduleMinHours * 60 * 60 * 1000) {
    return res.status(409).json({
      message: `La cita solo puede modificarse con al menos ${env.appointmentRescheduleMinHours} horas de anticipación`
    });
  }

  if (payload.action === "cancel") {
    const canceled = await withTenantContext(async (tx) => tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "canceled",
        canceledAt: new Date(),
        canceledReason: payload.canceledReason
      },
      include: {
        user: { select: { id: true, email: true } },
        createdBy: { select: { id: true, email: true, role: true } },
        cabin: { select: { id: true, name: true } },
        treatment: { select: { id: true, name: true, code: true, durationMinutes: true, prepBufferMinutes: true, cleanupBufferMinutes: true } }
      }
    }));

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: appointment.userId,
      action: "appointment.cancel",
      resourceType: "appointment",
      resourceId: appointment.id,
      ip: req.ip,
      metadata: { canceledReason: payload.canceledReason }
    });

    void enqueueGoogleAppointmentSync({
      clinicId: appointment.clinicId,
      appointmentId: appointment.id,
      action: "cancel"
    }).catch((error) => {
      logger.error({ err: error, appointmentId: appointment.id }, "Unable to enqueue Google cancel sync");
    });

    const TZ = "America/Chihuahua";
    const cancelDate = appointment.startAt.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ });
    const cancelTime = appointment.startAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ });
    const cancelTreatment = canceled.treatment?.name;
    const cancelReason = payload.canceledReason;

    const cancelledByClinic = req.user!.id !== appointment.userId;
    if (cancelledByClinic) {
      const profile = await prisma.profile.findUnique({ where: { userId: canceled.user.id }, select: { firstName: true, lastName: true } });
      const userName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || canceled.user.email;
      onAppointmentCancelledByClinic({
        userId: canceled.user.id,
        userEmail: canceled.user.email,
        userName,
        date: cancelDate,
        time: cancelTime,
        treatment: cancelTreatment,
        reason: cancelReason,
      }).catch((err) => logger.error({ err }, "[appointment] cancelled-by-clinic notification failed"));
    } else {
      const profile = await prisma.profile.findUnique({ where: { userId: canceled.user.id }, select: { firstName: true, lastName: true } });
      const userName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || canceled.user.email;
      onAppointmentCancelledByPatient({
        userName,
        userEmail: canceled.user.email,
        date: cancelDate,
        time: cancelTime,
        treatment: cancelTreatment,
        reason: cancelReason,
      }).catch((err) => logger.error({ err }, "[appointment] cancelled-by-patient notification failed"));
    }

    return res.json(canceled);
  }

  if (payload.action === "confirm") {
    const confirmed = await withTenantContext(async (tx) => tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "confirmed",
        confirmedAt: new Date(),
        canceledAt: null,
        canceledReason: null
      },
      include: {
        user: { select: { id: true, email: true } },
        createdBy: { select: { id: true, email: true, role: true } },
        cabin: { select: { id: true, name: true } },
        treatment: { select: { id: true, name: true, code: true, durationMinutes: true, prepBufferMinutes: true, cleanupBufferMinutes: true } }
      }
    }));

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: appointment.userId,
      action: "appointment.confirm",
      resourceType: "appointment",
      resourceId: appointment.id,
      ip: req.ip
    });

    const TZ = "America/Chihuahua";
    onAppointmentConfirmed({
      userId: confirmed.user.id,
      date: confirmed.startAt.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ }),
      time: confirmed.startAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ }),
      treatment: confirmed.treatment?.name,
    }).catch((err) => logger.error({ err }, "[appointment] confirmed notification failed"));

    return res.json(confirmed);
  }

  if (payload.action === "complete") {
    const completed = await withTenantContext(async (tx) => tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "completed",
        completedAt: new Date()
      },
      include: {
        user: { select: { id: true, email: true } },
        createdBy: { select: { id: true, email: true, role: true } },
        cabin: { select: { id: true, name: true } },
        treatment: { select: { id: true, name: true, code: true, durationMinutes: true, prepBufferMinutes: true, cleanupBufferMinutes: true } }
      }
    }));

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: appointment.userId,
      action: "appointment.complete",
      resourceType: "appointment",
      resourceId: appointment.id,
      ip: req.ip
    });

    return res.json(completed);
  }

  if (payload.action === "mark_no_show") {
    const noShow = await withTenantContext(async (tx) => tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "no_show",
        noShowAt: new Date()
      },
      include: {
        user: { select: { id: true, email: true } },
        createdBy: { select: { id: true, email: true, role: true } },
        cabin: { select: { id: true, name: true } },
        treatment: { select: { id: true, name: true, code: true, durationMinutes: true, prepBufferMinutes: true, cleanupBufferMinutes: true } }
      }
    }));

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: appointment.userId,
      action: "appointment.no_show",
      resourceType: "appointment",
      resourceId: appointment.id,
      ip: req.ip
    });

    return res.json(noShow);
  }

  if (!payload.startAt) {
    return res.status(400).json({ message: "Debes indicar la fecha de inicio para reprogramar" });
  }

  const startAt = new Date(payload.startAt);

  let treatment: ResolvedAgendaTreatment | null = null;
  if (payload.treatmentId) {
    try {
      treatment = await resolveTreatmentForAppointment({ treatmentId: payload.treatmentId });
    } catch (error) {
      if (respondIfAgendaError(error, res)) {
        return;
      }
      throw error;
    }
  } else if (appointment.treatmentId) {
    const persistedTreatment = await prisma.agendaTreatment.findUnique({
      where: { id: appointment.treatmentId },
      select: {
        id: true,
        code: true,
        durationMinutes: true,
        prepBufferMinutes: true,
        cleanupBufferMinutes: true,
        cabinId: true,
        requiresSpecificCabin: true,
        isActive: true,
        cabinRules: {
          select: { cabinId: true, priority: true },
          orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
        }
      }
    });
    treatment = (persistedTreatment as ResolvedAgendaTreatment | null) ?? null;
  }

  const endAt = deriveAppointmentEndAt({
    startAt,
    payloadEndAt: payload.endAt,
    treatment
  });
  if (!endAt) {
    return res.status(400).json({ message: "Debes indicar la fecha de fin cuando no hay tratamiento seleccionado" });
  }
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return res.status(400).json({ message: "Las fechas proporcionadas no son válidas" });
  }
  if (endAt <= startAt) {
    return res.status(400).json({ message: "La fecha de fin debe ser mayor a la de inicio" });
  }

  const treatmentCabinPriority = preferredCabinIdsForTreatment(treatment);
  if (treatment?.requiresSpecificCabin && treatmentCabinPriority.length === 0) {
    return res.status(409).json({ message: "El tratamiento requiere cabina específica pero no está configurado" });
  }
  if (treatment?.requiresSpecificCabin && payload.cabinId && !treatmentCabinPriority.includes(payload.cabinId)) {
    return res.status(409).json({ message: "El tratamiento seleccionado no puede operar en esa cabina" });
  }

  const requestedCabinIds =
    treatment?.requiresSpecificCabin
      ? payload.cabinId
        ? [payload.cabinId, ...treatmentCabinPriority.filter((cabinId) => cabinId !== payload.cabinId)]
        : treatmentCabinPriority
      : payload.cabinId
        ? [payload.cabinId]
        : treatmentCabinPriority.length > 0
          ? treatmentCabinPriority
          : appointment.cabinId
            ? [appointment.cabinId]
            : undefined;

  try {
    await enforceActiveAppointmentLimits({
      clinicId: appointment.clinicId,
      userId: appointment.userId,
      candidateStartAt: startAt,
      excludeAppointmentId: appointment.id
    });
  } catch (error) {
    if (respondIfAgendaError(error, res)) {
      return;
    }
    throw error;
  }

  let placement: Awaited<ReturnType<typeof resolveAppointmentPlacement>>;
  try {
    placement = await resolveAppointmentPlacement({
      startAt,
      endAt,
      requestedCabinIds,
      excludeAppointmentId: appointment.id,
      prepBufferMinutes: treatment?.prepBufferMinutes ?? 0,
      cleanupBufferMinutes: treatment?.cleanupBufferMinutes ?? 0
    });
  } catch (error) {
    if (respondIfAgendaError(error, res)) {
      return;
    }
    throw error;
  }

  const updated = await withTenantContext(async (tx) => tx.appointment.update({
    where: { id: appointment.id },
    data: {
      startAt,
      endAt,
      cabinId: placement.cabinId,
      treatmentId: treatment?.id ?? appointment.treatmentId ?? null,
      status: "scheduled",
      canceledAt: null,
      canceledReason: null,
      noShowAt: null,
      completedAt: null
    },
    include: {
      user: { select: { id: true, email: true } },
      createdBy: { select: { id: true, email: true, role: true } },
      cabin: { select: { id: true, name: true } },
      treatment: { select: { id: true, name: true, code: true, durationMinutes: true, prepBufferMinutes: true, cleanupBufferMinutes: true } }
    }
  }));

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: appointment.userId,
    action: "appointment.reschedule",
    resourceType: "appointment",
    resourceId: appointment.id,
    ip: req.ip,
    metadata: { startAt, endAt, cabinId: placement.cabinId }
  });

  void enqueueGoogleAppointmentSync({
    clinicId: appointment.clinicId,
    appointmentId: appointment.id,
    action: "update"
  }).catch((error) => {
    logger.error({ err: error, appointmentId: appointment.id }, "Unable to enqueue Google update sync");
  });

  return res.json(updated);
};

export const generateAppointmentConfirmToken = _genToken;

export const confirmAppointmentByToken = async (req: Request, res: Response) => {
  const token = String(req.query.token ?? "");
  const appointmentId = verifyAppointmentConfirmToken(token);
  if (!appointmentId) {
    return res.status(400).json({ message: "Token inválido o expirado" });
  }

  const appt = await withTenantContext(async (tx) => tx.appointment.findUnique({ where: { id: appointmentId } }));
  if (!appt) return res.status(404).json({ message: "Cita no encontrada" });
  if (appt.status === "confirmed") {
    return res.json({ ok: true, message: "La cita ya estaba confirmada", appointmentId });
  }
  if (appt.status !== "scheduled") {
    return res.status(409).json({ message: `No se puede confirmar una cita con estado "${appt.status}"` });
  }

  await withTenantContext(async (tx) => tx.appointment.update({ where: { id: appointmentId }, data: { status: "confirmed" } }));

  logger.info({ appointmentId }, "[confirm-token] Appointment confirmed via email link");
  return res.json({ ok: true, message: "Cita confirmada correctamente", appointmentId });
};

// ── Member-accessible endpoints (any authenticated user) ────────────────────

export const getMemberAgendaPolicy = async (_req: AuthRequest, res: Response) => {
  const config = await getAgendaConfig();
  return res.json({
    minAdvanceMinutes: config.policy.minAdvanceMinutes,
    maxAdvanceDays: config.policy.maxAdvanceDays,
    slotMinutes: config.policy.slotMinutes,
    timezone: config.policy.timezone
  });
};

export const getMemberAvailableSlots = async (req: AuthRequest, res: Response) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.dateKey) || isNaN(Date.parse(req.params.dateKey))) {
    return res.status(400).json({ message: "Formato de fecha inválido. Use YYYY-MM-DD" });
  }
  const params = agendaDateParamSchema.parse(req.params);
  const snapshot = await getAgendaDaySnapshot(params.dateKey);

  const isOpen = snapshot.effectiveRule.isOpen;
  const slots = isOpen
    ? snapshot.slots.map((s: (typeof snapshot.slots)[number]) => ({
        label: s.label,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        available: !s.blocked && s.available > 0
      }))
    : [];

  return res.json({ dateKey: params.dateKey, isOpen, slots });
};
