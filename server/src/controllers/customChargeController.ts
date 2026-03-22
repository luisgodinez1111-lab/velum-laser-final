import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../db/prisma";
import { resolveStripeConfig } from "../services/stripeConfigService";
import { resolveBaseUrl } from "../utils/baseUrl";
import {
  createCustomCharge,
  verifyCustomChargeOtp,
  cancelCustomCharge,
  resendCustomChargeOtp,
} from "../services/customChargeService";
import { sendCustomChargeOtpEmail } from "../services/emailService";
import { logger } from "../utils/logger";
import {
  onCustomChargeCreated,
  onCustomChargeAccepted,
} from "../services/notificationService";

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");


const INTERVAL_LABELS: Record<string, string> = {
  day: "diario", week: "semanal", month: "mensual", year: "anual",
};

function formatAmount(cents: number, currency: string): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() }).format(amount);
}

// ── Admin: List all custom charges ───────────────────────────────────
export const listCustomCharges = async (req: AuthRequest, res: Response) => {
  const charges = await prisma.customCharge.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  return res.json({ charges });
};

// ── Admin: Create a custom charge ────────────────────────────────────
export const createCharge = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ message: "No autorizado" });

  const body = req.body as Record<string, unknown>;
  const userId = asString(body?.userId);
  const title = asString(body?.title);
  const description = asString(body?.description).slice(0, 500) || undefined;
  const amountPesos = Number(body?.amount);
  const currency = asString(body?.currency) || "mxn";
  const type = asString(body?.type) === "RECURRING" ? "RECURRING" : "ONE_TIME";
  const interval = asString(body?.interval) || "month";

  if (!userId) return res.status(400).json({ message: "userId es obligatorio" });
  if (!title) return res.status(400).json({ message: "title es obligatorio" });
  if (!amountPesos || amountPesos <= 0) return res.status(400).json({ message: "amount debe ser mayor a 0 (en pesos)" });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } },
  });
  if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

  const amountCents = Math.round(amountPesos * 100);

  const { charge, otp } = await createCustomCharge({
    userId,
    createdByAdminId: req.user.id,
    title,
    description,
    amount: amountCents,
    currency,
    type: type as "ONE_TIME" | "RECURRING",
    interval: interval as "day" | "week" | "month" | "year" | "once",
  });

  const base = resolveBaseUrl();
  const name = [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(" ") || user.email;

  try {
    await sendCustomChargeOtpEmail(user.email, {
      name,
      otp,
      chargeId: charge.id,
      title,
      description,
      amountFormatted: formatAmount(amountCents, currency),
      type: type as "ONE_TIME" | "RECURRING",
      intervalLabel: type === "RECURRING" ? INTERVAL_LABELS[interval] : undefined,
      appBaseUrl: base,
    });
  } catch (err) {
    logger.error({ err }, "[custom-charge] Failed to send OTP email");
  }

  // Trigger in-app + email notification for the user
  onCustomChargeCreated({
    userId,
    userEmail: user.email,
    userName: name,
    chargeId: charge.id,
    chargeTitle: title,
    amountFormatted: formatAmount(amountCents, currency),
  }).catch((err) => logger.error({ err }, "[custom-charge] notification failed"));

  return res.status(201).json({
    message: "Cobro creado y OTP enviado al cliente",
    charge: {
      id: charge.id,
      status: charge.status,
      title: charge.title,
      amount: charge.amount,
      currency: charge.currency,
      type: charge.type,
    },
  });
};

// ── Admin: Cancel a custom charge ────────────────────────────────────
export const cancelCharge = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const existing = await prisma.customCharge.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: "Cobro no encontrado" });
  if (existing.status === "PAID") return res.status(400).json({ message: "No se puede cancelar un cobro ya pagado" });

  const charge = await cancelCustomCharge(id);
  return res.json({ message: "Cobro cancelado", charge });
};

// ── Admin: Resend OTP email ───────────────────────────────────────────
export const resendOtp = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await resendCustomChargeOtp(id);

  if ("error" in result) {
    if (result.error === "not_found") return res.status(404).json({ message: "Cobro no encontrado" });
    if (result.error === "not_pending") return res.status(400).json({ message: "El cobro no está pendiente de aceptación" });
  }

  const { charge, otp } = result as { charge: any; otp: string };
  const user = charge.user;
  const name = [user?.profile?.firstName, user?.profile?.lastName].filter(Boolean).join(" ") || user?.email;
  const base = resolveBaseUrl();

  try {
    await sendCustomChargeOtpEmail(user.email, {
      name,
      otp,
      chargeId: charge.id,
      title: charge.title,
      description: charge.description,
      amountFormatted: formatAmount(charge.amount, charge.currency),
      type: charge.type,
      intervalLabel: charge.type === "RECURRING" ? INTERVAL_LABELS[charge.interval ?? "month"] : undefined,
      appBaseUrl: base,
    });
  } catch (err) {
    logger.error({ err }, "[custom-charge] Failed to resend OTP email");
  }

  return res.json({ message: "OTP reenviado al cliente" });
};

// ── Public: Get charge details (no auth needed) ───────────────────────
export const getChargePublic = async (req: Request, res: Response) => {
  const { id } = req.params;
  const charge = await prisma.customCharge.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      amount: true,
      currency: true,
      type: true,
      interval: true,
      status: true,
      expiresAt: true,
      user: { select: { email: true, profile: { select: { firstName: true } } } },
    },
  });

  if (!charge) return res.status(404).json({ message: "Cobro no encontrado" });

  return res.json({
    charge: {
      ...charge,
      amountFormatted: formatAmount(charge.amount, charge.currency),
      intervalLabel: charge.interval ? INTERVAL_LABELS[charge.interval] : undefined,
    },
  });
};

// ── Public: Verify OTP and create Stripe checkout ────────────────────
export const verifyOtpAndCheckout = async (req: Request, res: Response) => {
  const { id } = req.params;
  const otp = asString((req.body as Record<string, unknown>)?.otp);

  if (!otp || !/^[A-Z0-9]{6}$/i.test(otp)) return res.status(400).json({ message: "OTP inválido" });

  const result = await verifyCustomChargeOtp(id, otp);

  if ("error" in result) {
    const errorMessages: Record<string, [number, string]> = {
      not_found:        [404, "Cobro no encontrado"],
      already_paid:     [400, "Este cobro ya fue pagado"],
      cancelled:        [400, "Este cobro fue cancelado"],
      expired:          [400, "Este cobro ha expirado"],
      otp_expired:      [400, "El código OTP ha expirado. Solicita uno nuevo al equipo de Velum Laser"],
      too_many_attempts:[400, "Demasiados intentos fallidos. Contacta a Velum Laser"],
      invalid_otp:      [400, "Código incorrecto. Verifica e intenta de nuevo"],
    };
    const [status, message] = errorMessages[result.error as keyof typeof errorMessages] ?? [400, "Error de verificación"];
    return res.status(status).json({ message });
  }

  const { charge } = result;

  // Build Stripe checkout session
  const stripe = await resolveStripeConfig();
  const secret = stripe.config.secretKey;
  if (!secret) return res.status(400).json({ message: "Stripe no configurado en el sistema" });

  const base = resolveBaseUrl();
  const successUrl = `${base}/#/custom-charge/${id}?payment=success`;
  const cancelUrl = `${base}/#/custom-charge/${id}?payment=cancelled`;

  const params = new URLSearchParams();

  if (charge.type === "RECURRING") {
    params.set("mode", "subscription");
    params.set("line_items[0][price_data][currency]", charge.currency);
    params.set("line_items[0][price_data][product_data][name]", charge.title);
    if (charge.description) params.set("line_items[0][price_data][product_data][description]", charge.description);
    params.set("line_items[0][price_data][recurring][interval]", charge.interval ?? "month");
    params.set("line_items[0][price_data][unit_amount]", String(charge.amount));
    params.set("line_items[0][quantity]", "1");
  } else {
    params.set("mode", "payment");
    params.set("line_items[0][price_data][currency]", charge.currency);
    params.set("line_items[0][price_data][product_data][name]", charge.title);
    if (charge.description) params.set("line_items[0][price_data][product_data][description]", charge.description);
    params.set("line_items[0][price_data][unit_amount]", String(charge.amount));
    params.set("line_items[0][quantity]", "1");
  }

  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("customer_email", charge.user.email);
  params.set("client_reference_id", charge.user.id);
  params.set("metadata[type]", "custom_charge");
  params.set("metadata[customChargeId]", id);
  params.set("metadata[userId]", charge.user.id);

  if (charge.user.stripeCustomerId) {
    params.set("customer", charge.user.stripeCustomerId);
    params.delete("customer_email");
  }

  const rsp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const json = await rsp.json().catch(() => ({})) as Record<string, unknown>;

  if (!rsp.ok) {
    const errorObj = json?.error as Record<string, unknown> | undefined;
    const detail = (typeof errorObj?.message === "string" ? errorObj.message : undefined) || "Error creando checkout en Stripe";
    logger.error({ detail }, "[custom-charge] Stripe checkout creation failed");
    return res.status(502).json({ message: "No se pudo crear el pago en Stripe", detail });
  }

  // Save session URL for reference
  await prisma.customCharge.update({
    where: { id },
    data: { stripeSessionId: json.id, stripeSessionUrl: json.url },
  });

  // Notify admins that the user accepted the charge (OTP verified)
  onCustomChargeAccepted({
    chargeId: id,
    chargeTitle: charge.title,
    amountFormatted: formatAmount(charge.amount, charge.currency),
    clientName: charge.user.email,
  }).catch((err) => logger.error({ err }, "[custom-charge] accepted notification failed"));

  return res.json({
    message: "OTP verificado correctamente",
    checkoutUrl: json.url,
    sessionId: json.id,
  });
};
