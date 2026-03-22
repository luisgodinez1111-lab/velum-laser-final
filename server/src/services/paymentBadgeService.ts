import { prisma } from "../db/prisma";

const DAYS_MS = 24 * 60 * 60 * 1000;

export const getPaymentBadge = async (appointmentId: string): Promise<"Al corriente" | "Pago pendiente"> => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      startAt: true,
      user: {
        select: {
          memberships: {
            select: {
              status: true,
              currentPeriodEnd: true,
              gracePeriodEndsAt: true
            },
            take: 1
          },
          payments: {
            select: {
              status: true,
              paidAt: true,
              createdAt: true
            },
            orderBy: { createdAt: "desc" },
            take: 12
          }
        }
      }
    }
  });

  if (!appointment) {
    return "Pago pendiente";
  }

  const membership = appointment.user.memberships[0];
  const membershipCoversAppointment =
    membership?.status === "active" &&
    (!membership.currentPeriodEnd || membership.currentPeriodEnd >= appointment.startAt);

  if (membershipCoversAppointment) {
    return "Al corriente";
  }

  const hasPaidRecordNearAppointment = appointment.user.payments.some((payment) => {
    if (payment.status !== "paid") {
      return false;
    }

    const paidAt = payment.paidAt ?? payment.createdAt;
    const diff = Math.abs(appointment.startAt.getTime() - paidAt.getTime());
    return diff <= 45 * DAYS_MS;
  });

  return hasPaidRecordNearAppointment ? "Al corriente" : "Pago pendiente";
};
