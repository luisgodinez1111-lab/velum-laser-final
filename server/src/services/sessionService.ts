import { prisma } from "../db/prisma";

export const getSessionsByAppointment = async (appointmentId: string) => {
  return prisma.sessionTreatment.findMany({
    where: { appointmentId },
    include: {
      staff: { select: { profile: { select: { firstName: true, lastName: true } } } }
    },
    orderBy: { createdAt: "desc" }
  });
};

export const getSessionsByUser = async (userId: string) => {
  return prisma.sessionTreatment.findMany({
    where: { userId },
    include: {
      appointment: { select: { scheduledAt: true, type: true, status: true } },
      staff: { select: { profile: { select: { firstName: true, lastName: true } } } }
    },
    orderBy: { createdAt: "desc" }
  });
};

export const getSessionById = async (id: string) => {
  return prisma.sessionTreatment.findUnique({
    where: { id },
    include: {
      appointment: { select: { scheduledAt: true, type: true, status: true } },
      user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      staff: { select: { profile: { select: { firstName: true, lastName: true } } } }
    }
  });
};

export const createSession = async (data: {
  appointmentId: string;
  userId: string;
  staffUserId: string;
  zones?: string[];
  laserSettings?: Record<string, unknown>;
  skinResponse?: string;
  fitzpatrickUsed?: string;
  energyDelivered?: string;
  notes?: string;
}) => {
  return prisma.sessionTreatment.create({
    data: {
      appointmentId: data.appointmentId,
      userId: data.userId,
      staffUserId: data.staffUserId,
      zones: data.zones ?? [],
      laserSettings: data.laserSettings ?? {},
      skinResponse: data.skinResponse,
      fitzpatrickUsed: data.fitzpatrickUsed,
      energyDelivered: data.energyDelivered,
      notes: data.notes
    }
  });
};

export const updateSession = async (
  id: string,
  data: {
    zones?: string[];
    laserSettings?: Record<string, unknown>;
    skinResponse?: string;
    fitzpatrickUsed?: string;
    energyDelivered?: string;
    notes?: string;
  }
) => {
  return prisma.sessionTreatment.update({
    where: { id },
    data
  });
};

export const listAllSessions = async (filters?: { userId?: string; staffUserId?: string }) => {
  return prisma.sessionTreatment.findMany({
    where: {
      ...(filters?.userId && { userId: filters.userId }),
      ...(filters?.staffUserId && { staffUserId: filters.staffUserId })
    },
    include: {
      appointment: { select: { scheduledAt: true, type: true } },
      user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      staff: { select: { profile: { select: { firstName: true, lastName: true } } } }
    },
    orderBy: { createdAt: "desc" }
  });
};
