import { Response } from "express";
import crypto from "crypto";
import { AuthRequest } from "../middlewares/auth";
import { withTenantContext } from "../db/withTenantContext";
import { resolveStripeConfig } from "../services/stripeConfigService";
import { resolveBaseUrl } from "../utils/baseUrl";

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// Configurable via env — default $200 MXN = 20000 centavos
const rawDeposit = process.env.DEPOSIT_AMOUNT_CENTS;
const DEPOSIT_AMOUNT_CENTS = rawDeposit !== undefined ? Number(rawDeposit) : 20000;
if (!Number.isFinite(DEPOSIT_AMOUNT_CENTS) || DEPOSIT_AMOUNT_CENTS <= 0) {
  throw new Error(`DEPOSIT_AMOUNT_CENTS inválido: "${rawDeposit}" — debe ser un número entero positivo`);
}


interface DepositBody {
  startAt?: unknown;
  endAt?: unknown;
  reason?: unknown;
  cabinId?: unknown;
  treatmentId?: unknown;
  interestedPlanCode?: unknown;
}

// Requires full ISO-8601 datetime: "YYYY-MM-DDTHH:mm:ss..." — rejects partial strings like "2025-1-1"
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const isValidIsoDate = (v: unknown): v is string =>
  typeof v === "string" && ISO_DATETIME_RE.test(v) && !isNaN(Date.parse(v));

export const createAppointmentDepositCheckout = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "No autorizado" });

    const body = req.body as DepositBody;
    const startAt = asString(body.startAt);
    const endAt = asString(body.endAt);

    if (!isValidIsoDate(startAt) || !isValidIsoDate(endAt)) {
      return res.status(400).json({ message: "startAt y endAt deben ser fechas ISO válidas" });
    }
    if (new Date(startAt) >= new Date(endAt)) {
      return res.status(400).json({ message: "startAt debe ser anterior a endAt" });
    }

    const stripe = await resolveStripeConfig();
    const secret = stripe.config.secretKey;
    if (!secret) return res.status(400).json({ message: "Stripe no configurado" });

    const base = resolveBaseUrl();
    const successUrl = `${base}/#/agenda?booking=success`;
    const cancelUrl = `${base}/#/agenda`;

    const me = await withTenantContext(async (tx) => tx.user.findUnique({ where: { id: req.user!.id }, select: { email: true, clinicId: true, appointmentDepositAvailable: true } }));
    if (!me) return res.status(404).json({ message: "Usuario no encontrado" });

    // Anti-duplicado: los depósitos NO crean Payment — se reflejan en el flag
    // appointmentDepositAvailable del User al confirmar el pago. Si el usuario ya
    // tiene un depósito disponible sin usar, no dejamos pagar otro. El doble-submit
    // del mismo slot lo cubre la Idempotency-Key de Stripe (abajo).
    if (me.appointmentDepositAvailable) {
      return res.status(409).json({ message: "Ya tienes un depósito disponible. Si necesitas ayuda, contacta al equipo de Velum Laser." });
    }

    const reason = asString(body.reason);
    const cabinId = asString(body.cabinId);
    const treatmentId = asString(body.treatmentId);
    const interestedPlanCode = asString(body.interestedPlanCode);

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("line_items[0][price_data][currency]", "mxn");
    params.set("line_items[0][price_data][unit_amount]", String(DEPOSIT_AMOUNT_CENTS));
    params.set("line_items[0][price_data][product_data][name]", "Valoración Velum Laser");
    params.set("line_items[0][price_data][product_data][description]", "Depósito de reserva de cita — se descontará del primer mes de membresía");
    params.set("line_items[0][quantity]", "1");
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);
    params.set("customer_email", me.email);
    params.set("metadata[type]", "appointment_deposit");
    params.set("metadata[userId]", req.user.id);
    params.set("metadata[clinicId]", me.clinicId ?? "default");
    params.set("metadata[startAt]", startAt);
    params.set("metadata[endAt]", endAt);
    if (reason) params.set("metadata[reason]", reason);
    if (cabinId) params.set("metadata[cabinId]", cabinId);
    if (treatmentId) params.set("metadata[treatmentId]", treatmentId);
    if (interestedPlanCode) params.set("metadata[interestedPlanCode]", interestedPlanCode);

    // Idempotency key estable por userId + slot: dos requests (retry, doble click,
    // dos pestañas) para el mismo usuario y horario devuelven la MISMA Checkout
    // Session de Stripe → no se puede pagar el depósito dos veces. Antes incluía
    // Math.floor(Date.now()/60_000), que cambiaba la key cada minuto y permitía
    // múltiples sesiones pagables.
    const idempotencyKey = crypto
      .createHash("sha256")
      .update(`deposit:${req.user.id}:${startAt}`)
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

    const json: { url?: string; error?: { message?: string } } = await rsp.json().catch(() => ({}));
    if (!rsp.ok) {
      // 422: client-facing Stripe error (bad params, card issues, etc.)
      return res.status(422).json({ message: "No se pudo crear el checkout", detail: json?.error?.message });
    }

    return res.json({ checkoutUrl: json?.url || "" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "unknown";
    return res.status(500).json({ message: "Error creando checkout de depósito", detail: msg });
  }
};
