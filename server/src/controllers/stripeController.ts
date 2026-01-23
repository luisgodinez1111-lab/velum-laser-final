import { Request, Response } from "express";
import { stripe } from "../services/stripeService";
import { env } from "../utils/env";
import { prisma } from "../db/prisma";

export const handleWebhook = async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.stripeWebhookSecret);
  } catch (err) {
    return res.status(400).json({ message: "Firma inválida" });
  }

  const exists = await prisma.webhookEvent.findUnique({ where: { stripeEventId: event.id } });
  if (exists) {
    return res.status(200).json({ received: true, idempotent: true });
  }

  await prisma.webhookEvent.create({
    data: { stripeEventId: event.id, type: event.type }
  });

  switch (event.type) {
    case "invoice.paid": {
      const invoice = event.data.object as { customer: string; subscription: string; lines: { data: { price: { id: string } }[] }; period_end?: number };
      await prisma.membership.updateMany({
        where: { stripeSubscriptionId: invoice.subscription as string },
        data: {
          status: "active",
          planId: invoice.lines.data[0]?.price.id,
          currentPeriodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined
        }
      });
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as { subscription: string };
      await prisma.membership.updateMany({
        where: { stripeSubscriptionId: invoice.subscription as string },
        data: { status: "past_due" }
      });
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as { id: string; status: string; current_period_end: number; cancel_at_period_end: boolean };
      const statusMap: Record<string, "active" | "canceled" | "past_due" | "paused" | "inactive"> = {
        active: "active",
        canceled: "canceled",
        past_due: "past_due",
        paused: "paused",
        unpaid: "inactive"
      };
      await prisma.membership.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          status: statusMap[subscription.status] ?? "inactive",
          currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : undefined,
          cancelAtPeriodEnd: subscription.cancel_at_period_end
        }
      });
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object as { customer: string; subscription: string; metadata?: Record<string, string> };
      const user = await prisma.user.findFirst({ where: { stripeCustomerId: session.customer as string } });
      if (user) {
        await prisma.membership.upsert({
          where: { userId: user.id },
          update: { stripeSubscriptionId: session.subscription as string, status: "active" },
          create: { userId: user.id, stripeSubscriptionId: session.subscription as string, status: "active" }
        });
      }
      break;
    }
    default:
      break;
  }

  return res.json({ received: true });
};
