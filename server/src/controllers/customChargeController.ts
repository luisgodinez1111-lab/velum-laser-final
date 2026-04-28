import { Request, Response } from "express";
import crypto from "crypto";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../db/prisma";
import { withTenantContext } from "../db/withTenantContext";
import { parsePagination } from "../utils/pagination";
import { paginated } from "../utils/response";
import { queryParams } from "../utils/request";
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
import { AppError, notFound, badRequest, unauthorized } from "../utils/AppError";
import {
  onCustomChargeCreated,
  onCustomChargeAccepted,
} from "../services/notificationService";

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// CUID v1/v2 basic format validator (starts with 'c', 20-30 chars, alphanumeric)
const CUID_RE = /^c[a-z0-9]{20,}$/i;
const isValidId = (id: string): boolean => CUID_RE.test(id);

// Full Stripe customer ID validation: prefix + min 14 chars
const STRIPE_CUS_RE = /^cus_[A-Za-z0-9]{14,}$/;
const isValidStripeCustomerId = (id: string): boolean => STRIPE_CUS_RE.test(id);


const INTERVAL_LABELS: Record<string, string> = {
  day: "diario", week: "semanal", month: "mensual", year: "anual",
};

function formatAmount(cents: number, currency: string): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() }).format(amount);
}

// ── Admin: List all custom charges (paginated) ───────────────────────
export const listCustomCharges = async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = parsePagination(queryParams(req), { maxLimit: 200 });

  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where = {
    ...(userId ? { userId } : {}),
    ...(status ? { status: status as "PENDING_ACCEPTANCE" | "ACCEPTED" | "PAID" | "CANCELLED" | "EXPIRED" } : {}),
  };

  const [total, charges] = await Promise.all([
    prisma.customCharge.count({ where }),
    prisma.customCharge.findMany({
      where,
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
      take: limit,
      skip,
    }),
  ]);

  return paginated(res, charges, { page, limit, total });
};

// ── Admin: Create a custom charge ────────────────────────────────────
export const createCharge = async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) throw unauthorized("No autorizado");

  const body = req.body as Record<string, unknown>;
  const userId = asString(body?.userId);
  const title = asString(body?.title);
  const description = asString(body?.description).slice(0, 500) || undefined;
  const amountPesos = Number(body?.amount);
  const currency = asString(body?.currency) || "mxn";
  const type = asString(body?.type) === "RECURRING" ? "RECURRING" : "ONE_TIME";
  const interval = asString(body?.interval) || "month";

  if (!userId) throw badRequest("userId es obligatorio");
  if (!title) throw badRequest("title es obligatorio");
  if (!amountPesos || amountPesos <= 0) throw badRequest("amount debe ser mayor a 0 (en pesos)");
  if (amountPesos > 500_000) throw badRequest("amount no puede exceder $500,000 pesos por cobro");
  if (amountPesos < 1) throw badRequest("El monto mínimo es $1 peso");

  const user = await withTenantContext(async (tx) => tx.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } },
  }));
  if (!user) throw notFound("Usuario");

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
    // Si el email falla, el paciente nunca recibe el OTP y el cobro queda en PENDING_ACCEPTANCE
    // indefinidamente. Cancelamos el cobro para evitar cargos zombie, y devolvemos 500 al admin
    // para que intente de nuevo.
    logger.error({ err, chargeId: charge.id }, "[custom-charge] OTP email failed — cancelling charge to avoid zombie");
    await cancelCustomCharge(charge.id).catch((cancelErr: unknown) =>
      logger.error({ err: cancelErr, chargeId: charge.id }, "[custom-charge] cleanup cancel also failed — charge may need manual review")
    );
    return res.status(500).json({
      message: "No se pudo enviar el OTP al paciente. El cobro fue cancelado automáticamente. Intenta de nuevo.",
    });
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
  if (!existing) throw notFound("Cobro");
  if (existing.status === "PAID") throw badRequest("No se puede cancelar un cobro ya pagado");

  const charge = await cancelCustomCharge(id);
  return res.json({ message: "Cobro cancelado", charge });
};

// ── Admin: Resend OTP email ───────────────────────────────────────────
export const resendOtp = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  if (!isValidId(id)) throw badRequest("ID de cobro inválido");
  const result = await resendCustomChargeOtp(id);

  if ("error" in result) {
    if (result.error === "not_found") throw notFound("Cobro");
    if (result.error === "not_pending") throw badRequest("El cobro no está pendiente de aceptación");
  }

  if (!("charge" in result)) throw new AppError("Error interno reenviando OTP", "INTERNAL_ERROR", 500);
  const { charge, otp } = result;
  const user = charge.user;
  const name = [user?.profile?.firstName, user?.profile?.lastName].filter(Boolean).join(" ") || user?.email;
  const base = resolveBaseUrl();

  try {
    await sendCustomChargeOtpEmail(user.email, {
      name,
      otp,
      chargeId: charge.id,
      title: charge.title,
      description: charge.description ?? undefined,
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

  if (charge.user.stripeCustomerId && isValidStripeCustomerId(charge.user.stripeCustomerId)) {
    params.set("customer", charge.user.stripeCustomerId);
    params.delete("customer_email");
  } else if (charge.user.stripeCustomerId) {
    logger.warn({ userId: charge.user.id, stripeCustomerId: charge.user.stripeCustomerId }, "[custom-charge] stripeCustomerId has unexpected format — skipping");
  }

  // Idempotency key: scoped to charge ID to prevent duplicate sessions on network retry
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(`custom-charge:${id}:${Math.floor(Date.now() / 60_000)}`)
    .digest("hex");

  const rsp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
      "X-Request-Id": (req.headers["x-request-id"] as string) || "",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(10_000),
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
    data: {
      stripeSessionId: typeof json.id === "string" ? json.id : null,
      stripeSessionUrl: typeof json.url === "string" ? json.url : null,
    },
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
