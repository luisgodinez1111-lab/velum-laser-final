import { Prisma } from "@prisma/client";
import { Response } from "express";
import { prisma } from "../db/prisma";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import { sessionCreateSchema, sessionFeedbackSchema } from "../validators/sessions";

const privilegedRoles = new Set(["staff", "admin", "system"]);

export const createSessionTreatment = async (req: AuthRequest, res: Response) => {
  const payload = sessionCreateSchema.parse(req.body);

  if (payload.appointmentId) {
    const appointment = await prisma.appointment.findUnique({ where: { id: payload.appointmentId } });

    if (!appointment) {
      return res.status(404).json({ message: "Cita no encontrada" });
    }

    if (appointment.userId !== payload.userId) {
      return res.status(400).json({ message: "La cita no corresponde al usuario objetivo" });
    }
  }

  const treatment = await prisma.sessionTreatment.create({
    data: {
      appointmentId: payload.appointmentId,
      userId: payload.userId,
      staffUserId: req.user!.id,
      laserParametersJson: payload.laserParametersJson as Prisma.InputJsonValue | undefined,
      notes: payload.notes,
      adverseEvents: payload.adverseEvents
    }
  });

  if (payload.appointmentId) {
    await prisma.appointment.update({
      where: { id: payload.appointmentId },
      data: {
        status: "completed",
        completedAt: new Date(),
        noShowAt: null
      }
    });
  }

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: payload.userId,
    action: "session.create",
    resourceType: "session_treatment",
    resourceId: treatment.id,
    ip: req.ip,
    metadata: { appointmentId: payload.appointmentId }
  });

  return res.status(201).json(treatment);
};

export const listMySessions = async (req: AuthRequest, res: Response) => {
  const filterUserId = req.user!.role === "member"
    ? req.user!.id
    : (typeof req.query.userId === "string" ? req.query.userId : undefined);

  const sessions = await prisma.sessionTreatment.findMany({
    where: filterUserId ? { userId: filterUserId } : undefined,
    include: {
      appointment: true,
      staffUser: {
        select: { id: true, email: true }
      },
      user: {
        select: { id: true, email: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 300
  });

  return res.json(sessions);
};

export const adminListSessions = async (req: AuthRequest, res: Response) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const appointmentId = typeof req.query.appointmentId === "string" ? req.query.appointmentId : undefined;

  const sessions = await prisma.sessionTreatment.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(appointmentId ? { appointmentId } : {})
    },
    include: {
      appointment: { select: { id: true, startAt: true, status: true } },
      staffUser: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
      user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  return res.json(sessions);
};

export const addSessionFeedback = async (req: AuthRequest, res: Response) => {
  const payload = sessionFeedbackSchema.parse(req.body);

  const session = await prisma.sessionTreatment.findUnique({
    where: { id: req.params.sessionId }
  });

  if (!session) {
    return res.status(404).json({ message: "Sesión no encontrada" });
  }

  const isPrivileged = privilegedRoles.has(req.user!.role);
  const isOwner = session.userId === req.user!.id;

  if (!isPrivileged && !isOwner) {
    return res.status(403).json({ message: "No puedes editar esta sesión" });
  }

  const updated = await prisma.sessionTreatment.update({
    where: { id: session.id },
    data: {
      memberFeedback: payload.memberFeedback,
      feedbackAt: new Date()
    }
  });

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: session.userId,
    action: "session.feedback",
    resourceType: "session_treatment",
    resourceId: session.id,
    ip: req.ip,
    metadata: { byRole: req.user!.role }
  });

  return res.json(updated);
};
