import { createHash, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "../db/prisma";
import { addHours } from "../utils/date";
import { logger } from "../utils/logger";
import { env } from "../utils/env";
import { onCustomChargeCreated } from "./notificationService";
import { sendCustomChargeOtpEmail } from "./emailService";
import { resolveBaseUrl } from "../utils/baseUrl";
import { getTenantIdOr } from "../utils/tenantContext";

const INTERVAL_LABELS: Record<string, string> = {
  day: "diario", week: "semanal", month: "mensual", year: "anual",
};

function formatAmountMxn(cents: number, currency: string): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

const MAX_OTP_ATTEMPTS = 5;

function generateOtp(): string {
  return String(100000 + randomInt(900000));
}

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

function otpMatchesSafe(storedHash: string, inputOtp: string): boolean {
  const a = Buffer.from(storedHash, "utf8");
  const b = Buffer.from(hashOtp(inputOtp), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const createCustomCharge = async (params: {
  userId: string;
  createdByAdminId?: string;
  title: string;
  description?: string;
  amount: number; // in cents
  currency?: string;
  type: "ONE_TIME" | "RECURRING";
  interval?: "day" | "week" | "month" | "year" | "once";
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
      interval: params.type === "RECURRING" ? (params.interval ?? "month") : undefined,
      otpHash,
      otpExpiresAt,
      status: "PENDING_ACCEPTANCE",
      expiresAt,
      tenantId: getTenantIdOr(env.defaultClinicId),
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

  if (!otpMatchesSafe(charge.otpHash!, otp)) {
    // increment is atomic at DB level — no race risk here
    await prisma.customCharge.update({
      where: { id: chargeId },
      data: { otpAttempts: { increment: 1 } },
    });
    return { error: "invalid_otp" as const };
  }

  // OTP is valid — accept atomically using updateMany with status guard.
  // This prevents a race condition where two concurrent requests both pass
  // the hash check and both try to accept the same charge.
  const accepted = await prisma.customCharge.updateMany({
    where: { id: chargeId, status: "PENDING_ACCEPTANCE" },
    data: { status: "ACCEPTED", acceptedAt: new Date(), otpHash: null },
  });

  if (accepted.count === 0) {
    // Another concurrent request already accepted (or status changed)
    return { error: "already_paid" as const };
  }

  const updated = await prisma.customCharge.findUnique({
    where: { id: chargeId },
    include: { user: { select: { id: true, email: true, stripeCustomerId: true } } },
  });

  return { charge: updated! };
};

const computeNextChargeAt = (interval: string | null | undefined): Date | undefined => {
  if (!interval || interval === "once") return undefined;
  const next = new Date();
  switch (interval) {
    case "day":   next.setDate(next.getDate() + 1); break;
    case "week":  next.setDate(next.getDate() + 7); break;
    case "month": next.setMonth(next.getMonth() + 1); break;
    case "year":  next.setFullYear(next.getFullYear() + 1); break;
    default: return undefined;
  }
  return next;
};

export const markCustomChargePaid = async (chargeId: string, params: {
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
  stripeSessionId?: string;
}) => {
  const charge = await prisma.customCharge.findUnique({ where: { id: chargeId }, select: { type: true, interval: true } });
  const nextChargeAt = charge?.type === "RECURRING" ? computeNextChargeAt(charge.interval) : undefined;

  return prisma.customCharge.update({
    where: { id: chargeId },
    data: {
      status: "PAID",
      paidAt: new Date(),
      nextChargeAt: nextChargeAt ?? null,
      ...params,
    },
  });
};

/** Called by cron: creates renewal charges for RECURRING charges whose nextChargeAt is due. */
export const renewRecurringCharges = async (): Promise<number> => {
  const due = await prisma.customCharge.findMany({
    where: { type: "RECURRING", status: "PAID", nextChargeAt: { lte: new Date() } },
    include: { user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } },
  });

  let count = 0;
  const base = resolveBaseUrl();

  for (const charge of due) {
    try {
      const { charge: newCharge, otp } = await createCustomCharge({
        userId: charge.userId,
        createdByAdminId: charge.createdByAdminId ?? undefined,
        title: charge.title,
        description: charge.description ?? undefined,
        amount: charge.amount,
        currency: charge.currency,
        type: "RECURRING",
        interval: charge.interval ?? undefined,
      });

      // Clear nextChargeAt on the paid record to prevent re-processing
      await prisma.customCharge.update({ where: { id: charge.id }, data: { nextChargeAt: null } });

      // Notify the user (in-app + OTP email)
      const userName = [charge.user.profile?.firstName, charge.user.profile?.lastName].filter(Boolean).join(" ") || charge.user.email;
      const amountFormatted = formatAmountMxn(charge.amount, charge.currency);

      onCustomChargeCreated({
        userId: charge.userId,
        userEmail: charge.user.email,
        userName,
        chargeId: newCharge.id,
        chargeTitle: newCharge.title,
        amountFormatted,
      }).catch((err) => logger.error({ err, chargeId: newCharge.id }, "[recurring-charges] notification failed"));

      sendCustomChargeOtpEmail(charge.user.email, {
        name: userName,
        otp,
        chargeId: newCharge.id,
        title: newCharge.title,
        description: newCharge.description ?? undefined,
        amountFormatted,
        type: "RECURRING",
        intervalLabel: INTERVAL_LABELS[charge.interval ?? "month"],
        appBaseUrl: base,
      }).catch((err) => logger.error({ err, chargeId: newCharge.id }, "[recurring-charges] OTP email failed"));

      count++;
    } catch (err) {
      logger.error({ err, chargeId: charge.id }, "[recurring-charges] renewal failed");
    }
  }
  return count;
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
