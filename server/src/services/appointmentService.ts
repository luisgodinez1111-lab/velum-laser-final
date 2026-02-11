import { prisma } from "../db/prisma";
import { AppointmentStatus, AppointmentType } from "@prisma/client";

export const getUserAppointments = (userId: string) =>
  prisma.appointment.findMany({
    where: { userId },
    include: { staff: { include: { profile: true } } },
    orderBy: { scheduledAt: "desc" }
  });

export const createAppointment = async (data: {
  userId: string;
  scheduledAt: Date;
  type: AppointmentType;
  zones?: string[];
  notes?: string;
}) => {
  return prisma.appointment.create({
    data: {
      userId: data.userId,
      scheduledAt: data.scheduledAt,
      type: data.type,
      zones: data.zones ?? [],
      notes: data.notes
    }
  });
};

export const cancelAppointment = async (
  appointmentId: string,
  userId: string,
  reason?: string
) => {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, userId }
  });

  if (!appointment) return null;
  if (!["pending", "confirmed"].includes(appointment.status)) return null;

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: "canceled",
      cancelReason: reason,
      canceledAt: new Date()
    }
  });
};

export const getAllAppointments = (filters?: {
  status?: AppointmentStatus;
  date?: Date;
  staffUserId?: string;
}) => {
  const where: Record<string, unknown> = {};

  if (filters?.status) where.status = filters.status;
  if (filters?.staffUserId) where.staffUserId = filters.staffUserId;
  if (filters?.date) {
    const start = new Date(filters.date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(filters.date);
    end.setHours(23, 59, 59, 999);
    where.scheduledAt = { gte: start, lte: end };
  }

  return prisma.appointment.findMany({
    where,
    include: {
      user: { include: { profile: true } },
      staff: { include: { profile: true } }
    },
    orderBy: { scheduledAt: "asc" }
  });
};

export const getAppointmentById = (id: string) =>
  prisma.appointment.findUnique({
    where: { id },
    include: {
      user: { include: { profile: true, medicalIntakes: { orderBy: { createdAt: "desc" }, take: 1 } } },
      staff: { include: { profile: true } }
    }
  });

export const updateAppointment = async (
  id: string,
  data: {
    status?: AppointmentStatus;
    staffUserId?: string;
    notes?: string;
    zones?: string[];
  }
) => {
  return prisma.appointment.update({
    where: { id },
    data
  });
};
