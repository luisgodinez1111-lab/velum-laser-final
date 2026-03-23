import { Response } from "express";
import crypto from "crypto";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../db/prisma";
import { resolveStripeConfig } from "../services/stripeConfigService";
import { findActivePlanByCode } from "../services/stripePlanCatalogService";
import { resolveBaseUrl } from "../utils/baseUrl";
import { logger } from "../utils/logger";

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export const createBillingCheckout = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "No autorizado" });

    const planCode = asString((req.body as any)?.planCode).toLowerCase();
    if (!planCode) return res.status(400).json({ message: "planCode es obligatorio" });

    const plan = await findActivePlanByCode(planCode);
    if (!plan) return res.status(404).json({ message: "Plan no encontrado o inactivo" });

    const stripe = await resolveStripeConfig();
    const secret = stripe.config.secretKey;
    if (!secret) return res.status(400).json({ message: "Stripe no configurado (falta STRIPE_SECRET_KEY)" });

    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, memberships: { select: { status: true } } },
    });
    if (!me) return res.status(404).json({ message: "Usuario no encontrado" });

    // Prevent double-subscribe if already active
    const hasActiveMembership = me.memberships.some((m) => m.status === "active");
    if (hasActiveMembership) {
      return res.status(409).json({ message: "Ya tienes una membresía activa. Usa el portal de facturación para gestionar tu plan." });
    }

    // Check for appointment deposit credit (200 MXN off first month)
    const userFlags = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { appointmentDepositAvailable: true },
    });
    const hasDepositCredit = userFlags?.appointmentDepositAvailable === true;

    let couponId: string | null = null;
    if (hasDepositCredit) {
      const couponParams = new URLSearchParams();
      couponParams.set("amount_off", "20000");
      couponParams.set("currency", "mxn");
      couponParams.set("duration", "once");
      couponParams.set("name", "Descuento depósito valoración");
      couponParams.set("max_redemptions", "1");
      const couponRsp = await fetch("https://api.stripe.com/v1/coupons", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: couponParams.toString(),
        signal: AbortSignal.timeout(10_000),
      });
      const couponJson: any = await couponRsp.json().catch(() => ({}));
      if (couponRsp.ok && couponJson?.id) {
        couponId = couponJson.id;
      }
    }

    const base = resolveBaseUrl();
    const successUrl = `${base}/#/dashboard?checkout=success&plan=${encodeURIComponent(plan.planCode)}`;
    const cancelUrl = `${base}/#/dashboard?checkout=cancelled&plan=${encodeURIComponent(plan.planCode)}`;

    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("line_items[0][price]", plan.stripePriceId);
    params.set("line_items[0][quantity]", "1");
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);
    params.set("client_reference_id", me.id);
    // Usar camelCase para que coincidan con lo que stripeWebhookService lee en metadata.planCode / metadata.userId
    params.set("metadata[planCode]", plan.planCode);
    params.set("metadata[userId]", me.id);
    params.set("customer_email", me.email);
    if (couponId) {
      params.set("discounts[0][coupon]", couponId);
      params.set("metadata[applyDepositDiscount]", "true");
    }

    // Idempotency key: scoped to user + plan to prevent duplicate sessions on retry
    const idempotencyKey = crypto
      .createHash("sha256")
      .update(`checkout:${me.id}:${plan.planCode}:${Math.floor(Date.now() / 60_000)}`)
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

    const json: any = await rsp.json().catch(() => ({}));

    if (!rsp.ok) {
      const detail = json?.error?.message || "Error creando checkout en Stripe";
      return res.status(502).json({ message: "No se pudo crear checkout", detail });
    }

    return res.json({
      message: "Checkout creado",
      planCode: plan.planCode,
      sessionId: json?.id || "",
      checkoutUrl: json?.url || "",
    });
  } catch (error: any) {
    logger.error({ err: error }, "createBillingCheckout error");
    return res.status(500).json({ message: "Error creando checkout", detail: error?.message ?? "unknown" });
  }
};

export const createBillingPortal = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "No autorizado" });

    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { stripeCustomerId: true },
    });
    if (!me?.stripeCustomerId) {
      return res.status(400).json({ message: "No tienes una suscripción activa con Stripe" });
    }
    if (!me.stripeCustomerId.startsWith("cus_")) {
      logger.warn({ userId: req.user.id, stripeCustomerId: me.stripeCustomerId }, "[billing-portal] stripeCustomerId has unexpected format");
      return res.status(400).json({ message: "No tienes una suscripción activa con Stripe" });
    }

    const stripe = await resolveStripeConfig();
    const secret = stripe.config.secretKey;
    if (!secret) return res.status(400).json({ message: "Stripe no configurado (falta STRIPE_SECRET_KEY)" });

    const base = resolveBaseUrl();
    const returnUrl = `${base}/#/dashboard`;

    const params = new URLSearchParams();
    params.set("customer", me.stripeCustomerId);
    params.set("return_url", returnUrl);

    const rsp = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Request-Id": (req.headers["x-request-id"] as string) || "",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    const json: any = await rsp.json().catch(() => ({}));

    if (!rsp.ok) {
      const detail = json?.error?.message || "Error creando sesión del portal";
      return res.status(502).json({ message: "No se pudo abrir el portal de facturación", detail });
    }

    return res.json({ url: json?.url || "" });
  } catch (error: any) {
    logger.error({ err: error }, "createBillingPortal error");
    return res.status(500).json({ message: "Error abriendo portal", detail: error?.message ?? "unknown" });
  }
};
