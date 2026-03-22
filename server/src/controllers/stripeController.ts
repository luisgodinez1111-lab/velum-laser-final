import { Request, Response } from "express";
import { stripe } from "../services/stripeService";
import { env } from "../utils/env";
import { prisma } from "../db/prisma";
import { createAuditLog } from "../services/auditService";
import { sendMetaEvent } from "../services/metaService";

type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

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

const resolveUserContact = async (userId?: string) => {
  if (!userId) {
    return { email: undefined, phone: undefined };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: {
        select: { phone: true }
      }
    }
  });

  return {
    email: user?.email,
    phone: user?.profile?.phone ?? undefined
  };
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
  status: PaymentStatus;
  failureCode?: string;
  failureMessage?: string;
  userId?: string;
  membershipId?: string;
}) => {
  if (!userId) {
    return;
  }

  const where:
    | { stripeInvoiceId: string }
    | { stripePaymentIntentId: string }
    | { stripeEventId: string }
    | null = stripeInvoiceId
    ? { stripeInvoiceId }
    : stripePaymentIntentId
      ? { stripePaymentIntentId }
      : stripeEventId
        ? { stripeEventId }
        : null;

  if (!where) {
    return;
  }

  await prisma.payment.upsert({
    where,
    update: {
      stripeEventId,
      stripeInvoiceId,
      stripePaymentIntentId,
      stripeSubscriptionId,
      amount,
      currency,
      status,
      failureCode,
      failureMessage,
      membershipId,
      paidAt: status === "paid" ? new Date() : undefined,
      failedAt: status === "failed" ? new Date() : status === "paid" ? null : undefined
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

const trackConversionEvent = async ({
  eventName,
  eventId,
  userId,
  amount,
  currency,
  stripeInvoiceId,
  stripeSubscriptionId,
  stripePaymentIntentId,
  req
}: {
  eventName: "Purchase" | "Subscribe";
  eventId: string;
  userId?: string;
  amount?: number;
  currency?: string;
  stripeInvoiceId?: string;
  stripeSubscriptionId?: string;
  stripePaymentIntentId?: string;
  req: Request;
}) => {
  if (!userId) {
    return;
  }

  const existing = await prisma.marketingAttribution.findUnique({
    where: { eventId }
  });

  if (existing) {
    return;
  }

  const attribution = await prisma.marketingAttribution.create({
    data: {
      userId,
      eventName,
      eventId,
      consent: true,
      requestSummary: {
        source: "stripe.webhook",
        stripeInvoiceId,
        stripeSubscriptionId,
        stripePaymentIntentId,
        amount,
        currency
      }
    }
  });

  const contact = await resolveUserContact(userId);

  const customData: Record<string, unknown> = {};
  if (typeof amount === "number") {
    customData.value = Number((amount / 100).toFixed(2));
  }
  if (currency) {
    customData.currency = currency.toUpperCase();
  }
  if (stripeInvoiceId) {
    customData.stripe_invoice_id = stripeInvoiceId;
  }
  if (stripeSubscriptionId) {
    customData.stripe_subscription_id = stripeSubscriptionId;
  }

  const userData: Record<string, unknown> = {};
  if (contact.email) {
    userData.em = contact.email;
  }
  if (contact.phone) {
    userData.ph = contact.phone;
  }

  const metaResult = await sendMetaEvent({
    eventName,
    eventId,
    clientIp: req.ip,
    clientUserAgent: req.get("user-agent") ?? undefined,
    userData: Object.keys(userData).length ? userData : undefined,
    customData: Object.keys(customData).length ? customData : undefined
  });

  await prisma.marketingAttribution.update({
    where: { id: attribution.id },
    data: {
      metaStatus: metaResult.status,
      metaError: metaResult.error,
      responseSummary: (metaResult.responseSummary ?? null) as any,
      sentAt: metaResult.status === "sent" ? new Date() : null
    }
  });

  await createAuditLog({
    userId,
    action: "marketing.event.track",
    resourceType: "marketing_event",
    resourceId: attribution.id,
    ip: req.ip,
    metadata: {
      source: "stripe.webhook",
      eventName,
      eventId
    }
  });
};

export const handleWebhook = async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string | undefined;
  if (!signature) {
    return res.status(400).json({ message: "Firma inválida" });
  }

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
    case "invoice.created": {
      const invoice = event.data.object as {
        id: string;
        customer?: string;
        subscription?: string;
        payment_intent?: string;
        amount_due?: number;
        total?: number;
        currency?: string;
      };

      const context = await resolveMembershipContext(invoice.subscription, invoice.customer);

      await recordPayment({
        stripeEventId: event.id,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: invoice.payment_intent,
        stripeSubscriptionId: invoice.subscription,
        amount: invoice.amount_due ?? invoice.total,
        currency: invoice.currency,
        status: "pending",
        userId: context.userId,
        membershipId: context.membershipId
      });

      break;
    }

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

      await trackConversionEvent({
        eventName: "Purchase",
        eventId: `purchase:${invoice.id}`,
        userId: context.userId,
        amount: invoice.amount_paid ?? invoice.total,
        currency: invoice.currency,
        stripeInvoiceId: invoice.id,
        stripeSubscriptionId: invoice.subscription,
        stripePaymentIntentId: invoice.payment_intent,
        req
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

    case "charge.refunded": {
      const charge = event.data.object as {
        invoice?: string;
        payment_intent?: string;
        amount_refunded?: number;
        amount?: number;
        currency?: string;
        customer?: string;
      };

      const existingPayment = charge.invoice
        ? await prisma.payment.findUnique({ where: { stripeInvoiceId: charge.invoice } })
        : charge.payment_intent
          ? await prisma.payment.findUnique({ where: { stripePaymentIntentId: charge.payment_intent } })
          : null;

      const context = await resolveMembershipContext(undefined, charge.customer);
      const userId = existingPayment?.userId ?? context.userId;
      const membershipId = existingPayment?.membershipId ?? context.membershipId;

      await recordPayment({
        stripeEventId: event.id,
        stripeInvoiceId: charge.invoice ?? existingPayment?.stripeInvoiceId ?? undefined,
        stripePaymentIntentId: charge.payment_intent ?? existingPayment?.stripePaymentIntentId ?? undefined,
        stripeSubscriptionId: existingPayment?.stripeSubscriptionId ?? undefined,
        amount: charge.amount_refunded ?? charge.amount,
        currency: charge.currency,
        status: "refunded",
        userId: userId ?? undefined,
        membershipId: membershipId ?? undefined
      });

      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as {
        id: string;
        status: string;
        current_period_end: number;
        cancel_at_period_end: boolean;
      };

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
      const session = event.data.object as {
        customer?: string;
        subscription?: string;
        metadata?: Record<string, string>;
      };

      let user = session.customer
        ? await prisma.user.findFirst({ where: { stripeCustomerId: session.customer } })
        : null;

      if (!user && session.metadata?.userId) {
        user = await prisma.user.findUnique({ where: { id: session.metadata.userId } });
      }

      if (user && session.subscription) {
        await prisma.membership.upsert({
          where: { userId: user.id },
          update: {
            stripeSubscriptionId: session.subscription,
            status: "active",
            gracePeriodEndsAt: null
          },
          create: {
            userId: user.id,
            stripeSubscriptionId: session.subscription,
            status: "active"
          }
        });
      }

      await trackConversionEvent({
        eventName: "Subscribe",
        eventId: `subscribe:${session.subscription ?? session.customer ?? event.id}`,
        userId: user?.id,
        stripeSubscriptionId: session.subscription,
        req
      });

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
