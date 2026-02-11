import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { createAppointmentSchema, cancelAppointmentSchema, updateAppointmentSchema } from "../validators/appointment";
import * as appointmentService from "../services/appointmentService";
import * as scheduleService from "../services/scheduleService";
import { createAuditLog } from "../services/auditService";
import { prisma } from "../db/prisma";
import { AppointmentStatus } from "@prisma/client";

export const getMyAppointments = async (req: AuthRequest, res: Response) => {
  const appointments = await appointmentService.getUserAppointments(req.user!.id);
  return res.json(appointments);
};

export const bookAppointment = async (req: AuthRequest, res: Response) => {
  const payload = createAppointmentSchema.parse(req.body);
  const scheduledAt = new Date(payload.scheduledAt);
  const type = payload.type ?? "treatment";

  // For treatment appointments, require approved intake + active membership
  if (type === "treatment") {
    const intake = await prisma.medicalIntake.findFirst({
      where: { userId: req.user!.id, status: "approved" }
    });
    if (!intake) {
      return res.status(400).json({
        message: "Debes tener tu expediente médico aprobado antes de agendar un tratamiento"
      });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: req.user!.id, status: "active" }
    });
    if (!membership) {
      return res.status(400).json({
        message: "Necesitas una membresía activa para agendar tratamientos"
      });
    }
  }

  // Check slot availability
  const dateOnly = new Date(scheduledAt);
  dateOnly.setHours(0, 0, 0, 0);
  const slots = await scheduleService.getAvailableSlots(dateOnly);
  const timeStr = `${String(scheduledAt.getHours()).padStart(2, "0")}:${String(scheduledAt.getMinutes()).padStart(2, "0")}`;
  const slot = slots.find((s) => s.time === timeStr);

  if (!slot || !slot.available) {
    return res.status(400).json({ message: "El horario seleccionado no está disponible" });
  }

  const appointment = await appointmentService.createAppointment({
    userId: req.user!.id,
    scheduledAt,
    type,
    zones: payload.zones,
    notes: payload.notes
  });

  await createAuditLog({
    userId: req.user!.id,
    action: "appointment.book",
    metadata: {
      appointmentId: appointment.id,
      type,
      scheduledAt: payload.scheduledAt,
      ip: req.ip
    }
  });

  return res.status(201).json(appointment);
};

export const cancelMyAppointment = async (req: AuthRequest, res: Response) => {
  const payload = cancelAppointmentSchema.parse(req.body);
  const appointment = await appointmentService.cancelAppointment(
    req.params.id,
    req.user!.id,
    payload.reason
  );

  if (!appointment) {
    return res.status(400).json({ message: "No se puede cancelar esta cita" });
  }

  await createAuditLog({
    userId: req.user!.id,
    action: "appointment.cancel",
    metadata: { appointmentId: appointment.id, reason: payload.reason, ip: req.ip }
  });

  return res.json(appointment);
};

export const listAppointmentsAdmin = async (req: AuthRequest, res: Response) => {
  const filters: { status?: AppointmentStatus; date?: Date; staffUserId?: string } = {};
  if (req.query.status) filters.status = req.query.status as AppointmentStatus;
  if (req.query.date) filters.date = new Date(req.query.date as string);
  if (req.query.staffUserId) filters.staffUserId = req.query.staffUserId as string;

  const appointments = await appointmentService.getAllAppointments(filters);
  return res.json(appointments);
};

export const getAppointmentAdmin = async (req: AuthRequest, res: Response) => {
  const appointment = await appointmentService.getAppointmentById(req.params.id);
  if (!appointment) {
    return res.status(404).json({ message: "Cita no encontrada" });
  }
  return res.json(appointment);
};

export const updateAppointmentAdmin = async (req: AuthRequest, res: Response) => {
  const payload = updateAppointmentSchema.parse(req.body);
  const existing = await appointmentService.getAppointmentById(req.params.id);
  if (!existing) {
    return res.status(404).json({ message: "Cita no encontrada" });
  }

  const appointment = await appointmentService.updateAppointment(req.params.id, payload);

  await createAuditLog({
    userId: req.user!.id,
    action: "appointment.update",
    metadata: {
      appointmentId: appointment.id,
      changes: payload,
      targetUserId: existing.userId,
      ip: req.ip
    }
  });

  return res.json(appointment);
};
