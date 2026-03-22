import { createHash, randomInt } from "crypto";
import { prisma } from "../db/prisma";
import { addHours } from "../utils/date";

const MAX_OTP_ATTEMPTS = 5;

function generateOtp(): string {
  return String(100000 + randomInt(900000));
}

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

export const createCustomCharge = async (params: {
  userId: string;
  createdByAdminId: string;
  title: string;
  description?: string;
  amount: number; // in cents
  currency?: string;
  type: "ONE_TIME" | "RECURRING";
  interval?: string;
  expiresInHours?: number;
}) => {
  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const otpExpiresAt = addHours(24);
  const expiresAt = params.expiresInHours ? addHours(params.expiresInHours) : addHours(72);

  const charge = await prisma.customCharge.create({
    data: {
      userId: params.userId,
      createdByAdminId: params.createdByAdminId,
      title: params.title,
      description: params.description,
      amount: params.amount,
      currency: params.currency ?? "mxn",
      type: params.type,
      interval: params.type === "RECURRING" ? (params.interval ?? "month") : null,
      otpHash,
      otpExpiresAt,
      status: "PENDING_ACCEPTANCE",
      expiresAt,
    },
    include: {
      user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
    },
  });

  return { charge, otp };
};

export const verifyCustomChargeOtp = async (chargeId: string, otp: string) => {
  const charge = await prisma.customCharge.findUnique({
    where: { id: chargeId },
    include: {
      user: { select: { id: true, email: true, stripeCustomerId: true } },
    },
  });

  if (!charge) return { error: "not_found" as const };

  if (charge.status === "PAID") return { error: "already_paid" as const };
  if (charge.status === "CANCELLED") return { error: "cancelled" as const };
  if (charge.status === "EXPIRED") return { error: "expired" as const };

  if (charge.expiresAt && charge.expiresAt < new Date()) {
    await prisma.customCharge.update({ where: { id: chargeId }, data: { status: "EXPIRED" } });
    return { error: "expired" as const };
  }

  if (!charge.otpHash || !charge.otpExpiresAt || charge.otpExpiresAt < new Date()) {
    return { error: "otp_expired" as const };
  }

  if (charge.otpAttempts >= MAX_OTP_ATTEMPTS) {
    return { error: "too_many_attempts" as const };
  }

  const inputHash = hashOtp(otp);
  if (inputHash !== charge.otpHash) {
    await prisma.customCharge.update({
      where: { id: chargeId },
      data: { otpAttempts: { increment: 1 } },
    });
    return { error: "invalid_otp" as const };
  }

  // OTP is valid — mark as accepted
  const updated = await prisma.customCharge.update({
    where: { id: chargeId },
    data: { status: "ACCEPTED", acceptedAt: new Date(), otpHash: null },
    include: { user: { select: { id: true, email: true, stripeCustomerId: true } } },
  });

  return { charge: updated };
};

export const markCustomChargePaid = async (chargeId: string, params: {
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
  stripeSessionId?: string;
}) => {
  return prisma.customCharge.update({
    where: { id: chargeId },
    data: {
      status: "PAID",
      paidAt: new Date(),
      ...params,
    },
  });
};

export const cancelCustomCharge = async (chargeId: string) => {
  return prisma.customCharge.update({
    where: { id: chargeId },
    data: { status: "CANCELLED" },
  });
};

export const resendCustomChargeOtp = async (chargeId: string) => {
  const charge = await prisma.customCharge.findUnique({
    where: { id: chargeId },
    include: { user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } } },
  });

  if (!charge) return { error: "not_found" as const };
  if (charge.status !== "PENDING_ACCEPTANCE") return { error: "not_pending" as const };

  const otp = generateOtp();
  const otpHash = hashOtp(otp);

  await prisma.customCharge.update({
    where: { id: chargeId },
    data: { otpHash, otpExpiresAt: addHours(24), otpAttempts: 0 },
  });

  return { charge, otp };
};
