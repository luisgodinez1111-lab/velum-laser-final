import { Request, Response } from "express";
import { stripe } from "../services/stripeService";
import { env } from "../utils/env";
import { prisma } from "../db/prisma";
import { createAuditLog } from "../services/auditService";

const resolveMembershipContext = async (subscriptionId?: string, customerId?: string) => {
  const membership = subscriptionId
    ? await prisma.membership.findFirst({
        where: { stripeSubscriptionId: subscriptionId }
      })
    : null;

  if (membership) {
    return { membershipId: membership.id, userId: membership.userId };
  }

  if (!customerId) {
    return { membershipId: undefined, userId: undefined };
  }

  const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
  return { membershipId: undefined, userId: user?.id };
};

const recordPayment = async ({
  stripeEventId,
  stripeInvoiceId,
  stripePaymentIntentId,
  stripeSubscriptionId,
  amount,
  currency,
  status,
  failureCode,
  failureMessage,
  userId,
  membershipId
}: {
  stripeEventId?: string;
  stripeInvoiceId?: string;
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
  amount?: number;
  currency?: string;
  status: "pending" | "paid" | "failed" | "refunded";
  failureCode?: string;
  failureMessage?: string;
  userId?: string;
  membershipId?: string;
}) => {
  if (!userId || !stripeInvoiceId) {
    return;
  }

  await prisma.payment.upsert({
    where: { stripeInvoiceId },
    update: {
      stripeEventId,
      stripePaymentIntentId,
      stripeSubscriptionId,
      amount,
      currency,
      status,
      failureCode,
      failureMessage,
      paidAt: status === "paid" ? new Date() : undefined,
      failedAt: status === "failed" ? new Date() : undefined,
      membershipId
    },
    create: {
      userId,
      membershipId,
      stripeEventId,
      stripeInvoiceId,
      stripePaymentIntentId,
      stripeSubscriptionId,
      amount,
      currency,
      status,
      failureCode,
      failureMessage,
      paidAt: status === "paid" ? new Date() : null,
      failedAt: status === "failed" ? new Date() : null
    }
  });
};

export const handleWebhook = async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.stripeWebhookSecret);
  } catch (_err) {
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
      const invoice = event.data.object as {
        id: string;
        customer?: string;
        subscription?: string;
        payment_intent?: string;
        amount_paid?: number;
        total?: number;
        currency?: string;
        lines: { data: { price: { id: string } }[] };
        period_end?: number;
      };

      const context = await resolveMembershipContext(invoice.subscription, invoice.customer);

      if (context.membershipId) {
        await prisma.membership.updateMany({
          where: { stripeSubscriptionId: invoice.subscription as string },
          data: {
            status: "active",
            planId: invoice.lines.data[0]?.price.id,
            currentPeriodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined,
            gracePeriodEndsAt: null
          }
        });
      }

      await recordPayment({
        stripeEventId: event.id,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: invoice.payment_intent,
        stripeSubscriptionId: invoice.subscription,
        amount: invoice.amount_paid ?? invoice.total,
        currency: invoice.currency,
        status: "paid",
        userId: context.userId,
        membershipId: context.membershipId
      });

      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as {
        id: string;
        customer?: string;
        subscription?: string;
        payment_intent?: string;
        amount_due?: number;
        total?: number;
        currency?: string;
        last_finalization_error?: { message?: string; code?: string };
      };

      const context = await resolveMembershipContext(invoice.subscription, invoice.customer);

      if (context.membershipId) {
        await prisma.membership.updateMany({
          where: { stripeSubscriptionId: invoice.subscription as string },
          data: {
            status: "past_due",
            gracePeriodEndsAt: new Date(Date.now() + env.gracePeriodDays * 24 * 60 * 60 * 1000)
          }
        });
      }

      await recordPayment({
        stripeEventId: event.id,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: invoice.payment_intent,
        stripeSubscriptionId: invoice.subscription,
        amount: invoice.amount_due ?? invoice.total,
        currency: invoice.currency,
        status: "failed",
        failureCode: invoice.last_finalization_error?.code,
        failureMessage: invoice.last_finalization_error?.message,
        userId: context.userId,
        membershipId: context.membershipId
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
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          gracePeriodEndsAt: subscription.status === "active" ? null : undefined
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

  await createAuditLog({
    action: "stripe.webhook.processed",
    resourceType: "stripe_event",
    resourceId: event.id,
    result: "success",
    metadata: { type: event.type },
    ip: req.ip
  });

  return res.json({ received: true });
};
