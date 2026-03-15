import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../db/prisma";
import { resolveStripeConfig } from "../services/stripeConfigService";

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const resolveBaseUrl = (req: AuthRequest): string => {
  const fromEnv = asString(process.env.STRIPE_CHECKOUT_BASE_URL);
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const proto = asString(req.headers["x-forwarded-proto"]) || req.protocol || "https";
  const host = asString(req.headers["x-forwarded-host"]) || asString(req.headers.host);
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  return "https://velumlaser.com";
};

export const createAppointmentDepositCheckout = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "No autorizado" });

    const { startAt, endAt, reason, cabinId, treatmentId } = req.body as any;
    if (!startAt || !endAt) return res.status(400).json({ message: "startAt y endAt son obligatorios" });

    const stripe = await resolveStripeConfig();
    const secret = stripe.config.secretKey;
    if (!secret) return res.status(400).json({ message: "Stripe no configurado" });

    const base = resolveBaseUrl(req);
    const successUrl = `${base}/#/agenda?booking=success`;
    const cancelUrl = `${base}/#/agenda`;

    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true } });
    if (!me) return res.status(404).json({ message: "Usuario no encontrado" });

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("line_items[0][price_data][currency]", "mxn");
    params.set("line_items[0][price_data][unit_amount]", "20000");
    params.set("line_items[0][price_data][product_data][name]", "Valoración Velum Laser");
    params.set("line_items[0][price_data][product_data][description]", "Depósito de reserva de cita — se descontará del primer mes de membresía");
    params.set("line_items[0][quantity]", "1");
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);
    params.set("customer_email", me.email);
    params.set("metadata[type]", "appointment_deposit");
    params.set("metadata[userId]", req.user.id);
    params.set("metadata[startAt]", startAt);
    params.set("metadata[endAt]", endAt);
    if (reason) params.set("metadata[reason]", reason);
    if (cabinId) params.set("metadata[cabinId]", cabinId);
    if (treatmentId) params.set("metadata[treatmentId]", treatmentId);

    const rsp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const json: any = await rsp.json().catch(() => ({}));
    if (!rsp.ok) {
      return res.status(502).json({ message: "No se pudo crear el checkout", detail: json?.error?.message });
    }

    return res.json({ checkoutUrl: json?.url || "" });
  } catch (error: any) {
    return res.status(500).json({ message: "Error creando checkout de depósito", detail: error?.message ?? "unknown" });
  }
};
