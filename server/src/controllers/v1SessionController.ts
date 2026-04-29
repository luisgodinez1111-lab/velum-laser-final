import { Prisma } from "@prisma/client";
import { Response } from "express";
import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { AuthRequest } from "../middlewares/auth";
import { createAuditLog } from "../services/auditService";
import { sessionCreateSchema, sessionFeedbackSchema, sessionFeedbackResponseSchema } from "../validators/sessions";
import { deriveFeedbackSeverity, isAdverseReaction, summarizeFeedback } from "../utils/sessionFeedback";
import { onSessionFeedbackReceived, onSessionFeedbackResponded } from "../services/notificationEventHandlers";
import { parsePagination } from "../utils/pagination";
import { paginated } from "../utils/response";
import { queryParams } from "../utils/request";
import { getTenantIdOr } from "../utils/tenantContext";
import { env } from "../utils/env";

const privilegedRoles = new Set(["staff", "admin", "system"]);

export const createSessionTreatment = async (req: AuthRequest, res: Response) => {
  const payload = sessionCreateSchema.parse(req.body);

  if (payload.appointmentId) {
    const appointment = await withTenantContext(async (tx) => tx.appointment.findUnique({ where: { id: payload.appointmentId } }));

    if (!appointment) {
      return res.status(404).json({ message: "Cita no encontrada" });
    }

    if (appointment.userId !== payload.userId) {
      return res.status(400).json({ message: "La cita no corresponde al usuario objetivo" });
    }
  }

  const treatment = await withTenantContext(async (tx) => {
    const created = await tx.sessionTreatment.create({
      data: {
        appointmentId: payload.appointmentId,
        userId: payload.userId,
        staffUserId: req.user!.id,
        laserParametersJson: payload.laserParametersJson as Prisma.InputJsonValue | undefined,
        notes: payload.notes,
        adverseEvents: payload.adverseEvents,
        tenantId: getTenantIdOr(env.defaultClinicId),
      }
    });

    if (payload.appointmentId) {
      await tx.appointment.update({
        where: { id: payload.appointmentId },
        data: {
          status: "completed",
          completedAt: new Date(),
          noShowAt: null
        }
      });
    }

    return created;
  });

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

  const { page, limit, skip } = parsePagination(queryParams(req), { maxLimit: 100 });
  const where = filterUserId ? { userId: filterUserId } : undefined;

  const [sessions, total] = await Promise.all([
    prisma.sessionTreatment.findMany({
      where,
      include: {
        appointment: true,
        staffUser: { select: { id: true, email: true } },
        user: { select: { id: true, email: true } }
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.sessionTreatment.count({ where }),
  ]);

  return paginated(res, sessions, { page, limit, total });
};

export const adminListSessions = async (req: AuthRequest, res: Response) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const appointmentId = typeof req.query.appointmentId === "string" ? req.query.appointmentId : undefined;

  const { page, limit, skip } = parsePagination(queryParams(req), { maxLimit: 200, defaultLimit: 100 });
  const where = {
    ...(userId ? { userId } : {}),
    ...(appointmentId ? { appointmentId } : {})
  };

  const [sessions, total] = await Promise.all([
    prisma.sessionTreatment.findMany({
      where,
      include: {
        appointment: { select: { id: true, startAt: true, status: true } },
        staffUser: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } }
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.sessionTreatment.count({ where }),
  ]);

  return paginated(res, sessions, { page, limit, total });
};

export const addSessionFeedback = async (req: AuthRequest, res: Response) => {
  const payload = sessionFeedbackSchema.parse(req.body);

  const session = await prisma.sessionTreatment.findUnique({
    where: { id: req.params.sessionId },
    include: {
      user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
    },
  });

  if (!session) {
    return res.status(404).json({ message: "Sesión no encontrada" });
  }

  const isPrivileged = privilegedRoles.has(req.user!.role);
  const isOwner = session.userId === req.user!.id;

  if (!isPrivileged && !isOwner) {
    return res.status(403).json({ message: "No puedes editar esta sesión" });
  }

  // Severidad y reacción adversa SE DERIVAN server-side (no se confía en cliente).
  const chips = payload.feedbackChips ?? [];
  const severity = deriveFeedbackSeverity(chips);
  const hasAdverseReaction = isAdverseReaction(severity);

  const updated = await prisma.sessionTreatment.update({
    where: { id: session.id },
    data: {
      memberFeedback: payload.memberFeedback ?? null,
      feedbackChipsJson: chips.length > 0 ? chips : Prisma.JsonNull,
      feedbackSeverity: severity,
      feedbackHasAdverseReaction: hasAdverseReaction,
      feedbackAt: new Date(),
    }
  });

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: session.userId,
    action: "session.feedback",
    resourceType: "session_treatment",
    resourceId: session.id,
    ip: req.ip,
    metadata: { byRole: req.user!.role, severity, chipsCount: chips.length, hasAdverseReaction }
  });

  // Notificación al equipo clínico (solo si paciente es quien envía — staff editando
  // su propio registro no genera alerta circular). Best-effort, no bloquea respuesta.
  // Defensive: session.user puede no estar incluido en algunos paths/tests.
  if (isOwner && session.user?.email) {
    const profile = session.user.profile;
    const fullName = profile ? `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() : "";
    onSessionFeedbackReceived({
      sessionId: session.id,
      memberId: session.userId,
      memberEmail: session.user.email,
      memberName: fullName || session.user.email,
      severity,
      hasAdverseReaction,
      summary: summarizeFeedback(chips, severity),
      hasFreeText: Boolean(payload.memberFeedback),
    }).catch(() => { /* best-effort */ });
  }

  return res.json(updated);
};

/**
 * Respuesta clínica del staff a un feedback del paciente (Fase B).
 * Solo roles privilegiados. Notifica al paciente (in-app + email).
 */
export const respondToSessionFeedback = async (req: AuthRequest, res: Response) => {
  const payload = sessionFeedbackResponseSchema.parse(req.body);

  const session = await prisma.sessionTreatment.findUnique({
    where: { id: req.params.sessionId },
    include: {
      user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
    },
  });

  if (!session) {
    return res.status(404).json({ message: "Sesión no encontrada" });
  }

  if (!session.feedbackAt) {
    return res.status(400).json({ message: "Esta sesión no tiene feedback del paciente para responder" });
  }

  const updated = await prisma.sessionTreatment.update({
    where: { id: session.id },
    data: {
      feedbackResponseNote: payload.responseNote,
      feedbackRespondedBy: req.user!.id,
      feedbackRespondedAt: new Date(),
    },
  });

  await createAuditLog({
    userId: req.user!.id,
    targetUserId: session.userId,
    action: "session.feedback.responded",
    resourceType: "session_treatment",
    resourceId: session.id,
    ip: req.ip,
    metadata: { responseLength: payload.responseNote.length }
  });

  // Notif al paciente: el equipo clínico te respondió.
  onSessionFeedbackResponded({
    sessionId: session.id,
    memberId: session.userId,
    memberEmail: session.user.email,
    memberName: (session.user.profile?.firstName ?? "").trim() || session.user.email,
    responseExcerpt: payload.responseNote.slice(0, 140),
  }).catch(() => { /* best-effort */ });

  return res.json(updated);
};
