import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import { env } from "../utils/env";
import { appointmentCreateSchema, appointmentUpdateSchema } from "../validators/appointments";

const privilegedRoles = new Set(["staff", "admin", "system"]);

const hasPrivilegedRole = (role: string) => privilegedRoles.has(role);

const hasOverlappingAppointment = async ({
  startAt,
  endAt,
  excludeAppointmentId
}: {
  startAt: Date;
  endAt: Date;
  excludeAppointmentId?: string;
}) => {
  const found = await prisma.appointment.findFirst({
    where: {
      ...(excludeAppointmentId
        ? {
            id: {
              not: excludeAppointmentId
            }
          }
        : {}),
      status: {
        in: ["scheduled", "confirmed"]
      },
      startAt: {
        lt: endAt
      },
      endAt: {
        gt: startAt
      }
    },
    select: { id: true }
  });

  return Boolean(found);
};

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

export const createAppointment = async (req: AuthRequest, res: Response) => {
  const payload = appointmentCreateSchema.parse(req.body);
  const startAt = new Date(payload.startAt);
  const endAt = new Date(payload.endAt);

  if (endAt <= startAt) {
    return res.status(400).json({ message: "La fecha de fin debe ser mayor a la de inicio" });
  }

  const isPrivileged = hasPrivilegedRole(req.user!.role);
  const targetUserId = isPrivileged ? payload.userId ?? req.user!.id : req.user!.id;

  if (targetUserId !== req.user!.id && !isPrivileged) {
    return res.status(403).json({ message: "No puedes crear citas para otros usuarios" });
  }

  const eligibility = await hasClinicalEligibility(targetUserId);

  if (!eligibility.intakeOk) {
    return res.status(409).json({ message: "El expediente debe estar submitted o approved para agendar" });
  }

  if (!eligibility.membershipOk) {
    return res.status(409).json({ message: "Se requiere membresía activa para agendar" });
  }

  const overlap = await hasOverlappingAppointment({ startAt, endAt });
  if (overlap) {
    return res.status(409).json({ message: "El horario seleccionado ya está ocupado" });
  }

  const appointment = await prisma.appointment.create({
    data: {
      userId: targetUserId,
      createdByUserId: req.user!.id,
      startAt,
      endAt,
      reason: payload.reason,
      status: "scheduled"
    }
  });

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: targetUserId,
    action: "appointment.create",
    resourceType: "appointment",
    resourceId: appointment.id,
    ip: req.ip,
    metadata: {
      startAt: appointment.startAt,
      endAt: appointment.endAt
    }
  });

  return res.status(201).json(appointment);
};

export const listAppointments = async (req: AuthRequest, res: Response) => {
  const isPrivileged = hasPrivilegedRole(req.user!.role);
  const queryUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const targetUserId = isPrivileged ? queryUserId : req.user!.id;

  const appointments = await prisma.appointment.findMany({
    where: targetUserId ? { userId: targetUserId } : undefined,
    include: {
      user: {
        select: { id: true, email: true }
      },
      createdBy: {
        select: { id: true, email: true, role: true }
      }
    },
    orderBy: { startAt: "asc" },
    take: 500
  });

  return res.json(appointments);
};

export const updateAppointment = async (req: AuthRequest, res: Response) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: req.params.appointmentId }
  });

  if (!appointment) {
    return res.status(404).json({ message: "Cita no encontrada" });
  }

  const isPrivileged = hasPrivilegedRole(req.user!.role);
  const isOwner = appointment.userId === req.user!.id;

  if (!isPrivileged && !isOwner) {
    return res.status(403).json({ message: "No puedes modificar esta cita" });
  }

  const payload = appointmentUpdateSchema.parse(req.body);

  if (!isPrivileged && appointment.startAt.getTime() - Date.now() < env.appointmentRescheduleMinHours * 60 * 60 * 1000) {
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

    return res.json(canceled);
  }

  if (!payload.startAt || !payload.endAt) {
    return res.status(400).json({ message: "Debes indicar el nuevo rango de fechas" });
  }

  const startAt = new Date(payload.startAt);
  const endAt = new Date(payload.endAt);

  if (endAt <= startAt) {
    return res.status(400).json({ message: "La fecha de fin debe ser mayor a la de inicio" });
  }

  const overlap = await hasOverlappingAppointment({
    startAt,
    endAt,
    excludeAppointmentId: appointment.id
  });

  if (overlap) {
    return res.status(409).json({ message: "El horario nuevo se cruza con otra cita" });
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      startAt,
      endAt,
      status: "scheduled",
      canceledAt: null,
      canceledReason: null
    }
  });

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: appointment.userId,
    action: "appointment.reschedule",
    resourceType: "appointment",
    resourceId: appointment.id,
    ip: req.ip,
    metadata: { startAt, endAt }
  });

  return res.json(updated);
};
