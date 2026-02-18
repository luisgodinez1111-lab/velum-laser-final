import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import { enqueueGoogleAppointmentSync } from "../services/googleCalendarIntegrationService";
import {
  AgendaValidationError,
  createAgendaBlock,
  deleteAgendaBlock,
  getAgendaConfig,
  getAgendaDailyReport,
  getAgendaDaySnapshot,
  resolveAppointmentPlacement,
  syncAppointmentWorkflow,
  updateAgendaConfig
} from "../services/agendaService";
import { env } from "../utils/env";
import { getClinicIdByUserId } from "../utils/clinic";
import { logger } from "../utils/logger";
import { agendaBlockCreateSchema, agendaConfigUpdateSchema, agendaDateParamSchema } from "../validators/agenda";
import { appointmentCreateSchema, appointmentUpdateSchema } from "../validators/appointments";

const privilegedRoles = new Set(["staff", "admin", "system"]);

const hasPrivilegedRole = (role: string) => privilegedRoles.has(role);

const hasClinicalEligibility = async (userId: string) => {
  const [intake, membership] = await Promise.all([
    prisma.medicalIntake.findUnique({
      where: { userId },
      select: { status: true }
    }),
    prisma.membership.findUnique({
      where: { userId },
      select: { status: true }
    })
  ]);

  return {
    intakeOk: Boolean(intake && ["submitted", "approved"].includes(intake.status)),
    membershipOk: membership?.status === "active"
  };
};

const respondIfAgendaError = (error: unknown, res: Response) => {
  if (error instanceof AgendaValidationError) {
    res.status(error.statusCode).json({ message: error.message });
    return true;
  }
  return false;
};

export const createAppointment = async (req: AuthRequest, res: Response) => {
  const payload = appointmentCreateSchema.parse(req.body);
  const startAt = new Date(payload.startAt);
  const endAt = new Date(payload.endAt);

  if (endAt <= startAt) {
    return res.status(400).json({ message: "La fecha de fin debe ser mayor a la de inicio" });
  }

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

  if (!eligibility.membershipOk) {
    return res.status(409).json({ message: "Se requiere membresía activa para agendar" });
  }

  let placement: Awaited<ReturnType<typeof resolveAppointmentPlacement>>;
  try {
    placement = await resolveAppointmentPlacement({
      startAt,
      endAt,
      requestedCabinId: payload.cabinId
    });
  } catch (error) {
    if (respondIfAgendaError(error, res)) {
      return;
    }
    throw error;
  }

  const appointment = await prisma.appointment.create({
    data: {
      clinicId: actorClinicId,
      userId: targetUserId,
      createdByUserId: req.user!.id,
      cabinId: placement.cabinId,
      startAt,
      endAt,
      reason: payload.reason,
      status: "scheduled"
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
      }
    }
  });

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
      cabinId: appointment.cabinId
    }
  });

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
  if (isPrivileged) {
    await syncAppointmentWorkflow();
  }

  const queryUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const targetUserId = isPrivileged ? queryUserId : req.user!.id;

  const appointments = await prisma.appointment.findMany({
    where: targetUserId ? { clinicId, userId: targetUserId } : { clinicId },
    include: {
      user: {
        select: { id: true, email: true }
      },
      createdBy: {
        select: { id: true, email: true, role: true }
      },
      cabin: {
        select: { id: true, name: true }
      }
    },
    orderBy: { startAt: "asc" },
    take: 1000
  });

  return res.json(appointments);
};

export const updateAppointment = async (req: AuthRequest, res: Response) => {
  const clinicId = await getClinicIdByUserId(req.user!.id);
  const appointment = await prisma.appointment.findUnique({
    where: { id: req.params.appointmentId }
  });

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
    const canceled = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "canceled",
        canceledAt: new Date(),
        canceledReason: payload.canceledReason
      },
      include: {
        user: { select: { id: true, email: true } },
        createdBy: { select: { id: true, email: true, role: true } },
        cabin: { select: { id: true, name: true } }
      }
    });

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

    return res.json(canceled);
  }

  if (payload.action === "confirm") {
    const confirmed = await prisma.appointment.update({
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
        cabin: { select: { id: true, name: true } }
      }
    });

    await createAuditLog({
      userId: req.user!.id,
      targetUserId: appointment.userId,
      action: "appointment.confirm",
      resourceType: "appointment",
      resourceId: appointment.id,
      ip: req.ip
    });

    return res.json(confirmed);
  }

  if (payload.action === "complete") {
    const completed = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "completed",
        completedAt: new Date()
      },
      include: {
        user: { select: { id: true, email: true } },
        createdBy: { select: { id: true, email: true, role: true } },
        cabin: { select: { id: true, name: true } }
      }
    });

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
    const noShow = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "no_show",
        noShowAt: new Date()
      },
      include: {
        user: { select: { id: true, email: true } },
        createdBy: { select: { id: true, email: true, role: true } },
        cabin: { select: { id: true, name: true } }
      }
    });

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

  if (!payload.startAt || !payload.endAt) {
    return res.status(400).json({ message: "Debes indicar el nuevo rango de fechas" });
  }

  const startAt = new Date(payload.startAt);
  const endAt = new Date(payload.endAt);

  let placement: Awaited<ReturnType<typeof resolveAppointmentPlacement>>;
  try {
    placement = await resolveAppointmentPlacement({
      startAt,
      endAt,
      requestedCabinId: payload.cabinId ?? appointment.cabinId ?? undefined,
      excludeAppointmentId: appointment.id
    });
  } catch (error) {
    if (respondIfAgendaError(error, res)) {
      return;
    }
    throw error;
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      startAt,
      endAt,
      cabinId: placement.cabinId,
      status: "scheduled",
      canceledAt: null,
      canceledReason: null,
      noShowAt: null,
      completedAt: null
    },
    include: {
      user: { select: { id: true, email: true } },
      createdBy: { select: { id: true, email: true, role: true } },
      cabin: { select: { id: true, name: true } }
    }
  });

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

export const getAdminAgendaConfig = async (_req: AuthRequest, res: Response) => {
  const config = await getAgendaConfig();
  return res.json(config);
};

export const putAdminAgendaConfig = async (req: AuthRequest, res: Response) => {
  const payload = agendaConfigUpdateSchema.parse(req.body);
  const config = await updateAgendaConfig(payload);

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: req.user!.id,
    action: "agenda.config.update",
    resourceType: "agenda",
    resourceId: config.policy.id,
    ip: req.ip,
    metadata: payload
  });

  return res.json(config);
};

export const getAdminAgendaDay = async (req: AuthRequest, res: Response) => {
  const params = agendaDateParamSchema.parse(req.params);
  const snapshot = await getAgendaDaySnapshot(params.dateKey);
  return res.json(snapshot);
};

export const postAdminAgendaBlock = async (req: AuthRequest, res: Response) => {
  const payload = agendaBlockCreateSchema.parse(req.body);

  let block;
  try {
    block = await createAgendaBlock({
      ...payload,
      actorUserId: req.user!.id
    });
  } catch (error) {
    if (respondIfAgendaError(error, res)) {
      return;
    }
    throw error;
  }

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: req.user!.id,
    action: "agenda.block.create",
    resourceType: "agenda_block",
    resourceId: block.id,
    ip: req.ip,
    metadata: payload
  });

  return res.status(201).json(block);
};

export const deleteAdminAgendaBlock = async (req: AuthRequest, res: Response) => {
  let block;
  try {
    block = await deleteAgendaBlock(req.params.blockId);
  } catch (error) {
    if (respondIfAgendaError(error, res)) {
      return;
    }
    throw error;
  }

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: req.user!.id,
    action: "agenda.block.delete",
    resourceType: "agenda_block",
    resourceId: block.id,
    ip: req.ip,
    metadata: {
      dateKey: block.dateKey,
      startMinute: block.startMinute,
      endMinute: block.endMinute,
      cabinId: block.cabinId
    }
  });

  return res.status(204).send();
};

export const getAdminAgendaReport = async (req: AuthRequest, res: Response) => {
  const params = agendaDateParamSchema.parse(req.params);
  const report = await getAgendaDailyReport(params.dateKey);
  return res.json(report);
};
