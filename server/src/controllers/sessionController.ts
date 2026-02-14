import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { createSessionSchema, updateSessionSchema } from "../validators/session";
import * as sessionService from "../services/sessionService";
import { createAuditLog } from "../services/auditService";
import { notify } from "../services/notificationService";
import { prisma } from "../db/prisma";

// Staff: create session for a completed appointment
export const createSessionTreatment = async (req: AuthRequest, res: Response) => {
  const data = createSessionSchema.parse(req.body);

  // Verify appointment exists and is completed/in_progress
  const appointment = await prisma.appointment.findUnique({
    where: { id: data.appointmentId },
    select: { id: true, userId: true, status: true, type: true }
  });

  if (!appointment) {
    return res.status(404).json({ message: "Cita no encontrada" });
  }

  if (!["completed", "in_progress"].includes(appointment.status)) {
    return res.status(400).json({ message: "La cita debe estar en curso o completada para registrar sesión" });
  }

  const session = await sessionService.createSession({
    appointmentId: data.appointmentId,
    userId: appointment.userId,
    staffUserId: req.user!.id,
    zones: data.zones,
    laserSettings: data.laserSettings,
    skinResponse: data.skinResponse,
    fitzpatrickUsed: data.fitzpatrickUsed,
    energyDelivered: data.energyDelivered,
    notes: data.notes
  });

  await createAuditLog({
    userId: req.user!.id,
    action: "session.create",
    metadata: { sessionId: session.id, appointmentId: data.appointmentId, ip: req.ip }
  });

  // Notify patient
  await notify(
    appointment.userId,
    "Sesión registrada",
    "Se ha registrado una nueva sesión de tratamiento en tu expediente.",
    { sessionId: session.id }
  );

  res.status(201).json(session);
};

// Staff: update session
export const updateSessionTreatment = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = updateSessionSchema.parse(req.body);

  const existing = await sessionService.getSessionById(id);
  if (!existing) {
    return res.status(404).json({ message: "Sesión no encontrada" });
  }

  const updated = await sessionService.updateSession(id, data);
  res.json(updated);
};

// Staff: get session by id
export const getSessionDetail = async (req: AuthRequest, res: Response) => {
  const session = await sessionService.getSessionById(req.params.id);
  if (!session) {
    return res.status(404).json({ message: "Sesión no encontrada" });
  }
  res.json(session);
};

// Staff: list all sessions (with optional filters)
export const listSessions = async (req: AuthRequest, res: Response) => {
  const { userId, staffUserId } = req.query;
  const sessions = await sessionService.listAllSessions({
    userId: userId as string | undefined,
    staffUserId: staffUserId as string | undefined
  });
  res.json(sessions);
};

// Member: get own sessions
export const getMySessions = async (req: AuthRequest, res: Response) => {
  const sessions = await sessionService.getSessionsByUser(req.user!.id);
  res.json(sessions);
};
