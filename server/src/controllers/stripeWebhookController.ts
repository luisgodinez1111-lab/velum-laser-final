import type { Request, Response } from "express";
import {
  createStripeClientForWebhook,
  getStripeWebhookConfig,
  handleBusinessStripeEvent,
} from "../services/stripeWebhookService";
import { prisma } from "../db/prisma";

const getStripeSignature = (req: Request): string => {
  const value = req.headers["stripe-signature"];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
};

const getRawBody = (req: Request): Buffer => {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  if (req.body && typeof req.body === "object") return Buffer.from(JSON.stringify(req.body), "utf8");
  return Buffer.from("", "utf8");
};

export const stripeWebhookHealthController = (_req: Request, res: Response): void => {
  res.status(200).json({ ok: true, message: "Stripe webhook endpoint online" });
};

export const stripeWebhookController = async (req: Request, res: Response): Promise<void> => {
  const signature = getStripeSignature(req);
  if (!signature) {
    res.status(400).json({ ok: false, message: "Missing stripe-signature header" });
    return;
  }

  const config = await getStripeWebhookConfig();
  if (!config.secretKey) {
    res.status(500).json({ ok: false, message: "Missing STRIPE_SECRET_KEY" });
    return;
  }
  if (!config.webhookSecret) {
    res.status(500).json({ ok: false, message: "Missing STRIPE_WEBHOOK_SECRET" });
    return;
  }

  const stripe = createStripeClientForWebhook(config.secretKey);
  const rawBody = getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook signature";
    res.status(400).json({ ok: false, message });
    return;
  }

  // ── Deduplicación de eventos Stripe ──────────────────────────────
  const existing = await prisma.webhookEvent.findUnique({ where: { stripeEventId: event.id } }).catch(() => null);
  if (existing) {
    res.status(200).json({ ok: true, received: true, duplicate: true, eventId: event.id });
    return;
  }

  await prisma.webhookEvent.create({
    data: { stripeEventId: event.id, type: event.type, processedAt: new Date() },
  }).catch(() => {});

  try {
    await handleBusinessStripeEvent(event, stripe);
    res.status(200).json({ ok: true, received: true, eventId: event.id, eventType: event.type });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    res.status(500).json({ ok: false, message });
  }
};
