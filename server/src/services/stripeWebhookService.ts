import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { env } from "../utils/env";
import {
  onCustomChargePaid,
  onAppointmentDepositPaid,
  onMembershipActivated,
  onMembershipPaymentFailed,
} from "./notificationService";
import { sendPaymentReceiptEmail } from "./emailService";
import { inc } from "./metricsService";
import { reportError } from "../utils/errorReporter";

type JsonObject = Record<string, unknown>;
type Delegate = {
  findUnique?: (args: unknown) => Promise<unknown>;
  findFirst?: (args: unknown) => Promise<unknown>;
  create?: (args: unknown) => Promise<unknown>;
  update?: (args: unknown) => Promise<unknown>;
};

type StripeConfig = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  source: "env" | "db" | "mixed" | "none";
};

export type StripePlanMapping = {
  planCode: string;
  name: string;
  amount: number;
  interval: "day" | "week" | "month" | "year";
  stripePriceId: string;
  active: boolean;
};

type MembershipUpsertInput = {
  eventId: string;
  eventType: string;
  userId: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  stripePriceId: string | null;
  planCode: string | null;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
  gracePeriodEndsAt?: Date | null;
  amount: number | null;
  currency: string | null;
};

const STRIPE_CONFIG_KEY = "stripe_config";
const STRIPE_PLAN_CATALOG_KEY = "stripe_plan_catalog_v1";
const PLACEHOLDER_RE = /(REEMPLAZA|CHANGE_ME|EXAMPLE|YOUR_|_HERE)/i;

const asRecord = (value: unknown): JsonObject => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
};

const safeParseRecord = (value: unknown): JsonObject => {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asRecord(value);
};

const safeParseArray = (value: unknown): unknown[] => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
};

const cleanString = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const out = value.trim();
  if (!out) return "";
  if (PLACEHOLDER_RE.test(out)) return "";
  return out;
};

const asNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const asBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    return lower === "true" || lower === "1" || lower === "yes" || lower === "on";
  }
  if (typeof value === "number") return value !== 0;
  return false;
};

const extractExpandableId = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const id = (value as JsonObject).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
};

const centsToMajor = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n) / 100;
};

const unixToDate = (value: unknown): Date | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
};

const getDelegate = (name: string): Delegate | null => {
  const map = prisma as unknown as Record<string, unknown>;
  const delegate = map[name] as Delegate | undefined;
  return delegate ?? null;
};

const pickDelegateName = (candidates: string[]): string | null => {
  for (const name of candidates) {
    const delegate = getDelegate(name);
    if (!delegate) continue;
    if (delegate.findFirst || delegate.findUnique || delegate.create || delegate.update) {
      return name;
    }
  }
  return null;
};

const lowerFirst = (value: string): string =>
  value.length > 0 ? value.charAt(0).toLowerCase() + value.slice(1) : value;

const getDelegateFieldSet = (delegateName: string): Set<string> => {
  const models = Prisma.dmmf.datamodel.models as unknown as ReadonlyArray<{ name: string; fields: ReadonlyArray<{ name: string }> }>;
  const model = models.find((m) => lowerFirst(m.name) === delegateName || m.name === delegateName);
  if (!model) return new Set<string>();
  return new Set<string>(model.fields.map((f) => f.name));
};

const filterDataByFields = (delegateName: string, data: JsonObject): JsonObject => {
  const fields = getDelegateFieldSet(delegateName);
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (fields.size === 0 || fields.has(key)) {
      out[key] = value;
    }
  }
  return out;
};

const readAppSettingValue = async (key: string): Promise<unknown> => {
  const delegate = getDelegate("appSetting");
  if (!delegate?.findUnique) return null;
  try {
    const row = (await delegate.findUnique({ where: { key } })) as JsonObject | null;
    if (!row) return null;
    return row.value ?? null;
  } catch {
    return null;
  }
};

export const getStripeWebhookConfig = async (): Promise<StripeConfig> => {
  const envSecret = cleanString(env.stripeSecretKey);
  const envPublishable = cleanString(env.stripePublishableKey);
  const envWebhook = cleanString(env.stripeWebhookSecret);

  const raw = await readAppSettingValue(STRIPE_CONFIG_KEY);
  const db = safeParseRecord(raw);
  const dbSecret = cleanString(db.secretKey ?? db.secret_key ?? db.STRIPE_SECRET_KEY);
  const dbPublishable = cleanString(db.publishableKey ?? db.publishable_key ?? db.STRIPE_PUBLISHABLE_KEY);
  const dbWebhook = cleanString(db.webhookSecret ?? db.webhook_secret ?? db.STRIPE_WEBHOOK_SECRET);

  const secretKey = envSecret || dbSecret;
  const publishableKey = envPublishable || dbPublishable;
  const webhookSecret = envWebhook || dbWebhook;

  const hasEnv = Boolean(envSecret || envPublishable || envWebhook);
  const hasDb = Boolean(dbSecret || dbPublishable || dbWebhook);

  let source: StripeConfig["source"] = "none";
  if (hasEnv && hasDb) source = "mixed";
  else if (hasEnv) source = "env";
  else if (hasDb) source = "db";

  return { secretKey, publishableKey, webhookSecret, source };
};

export const createStripeClientForWebhook = (secretKey: string): Stripe => new Stripe(secretKey);

const getPlanCatalog = async (): Promise<StripePlanMapping[]> => {
  const raw = await readAppSettingValue(STRIPE_PLAN_CATALOG_KEY);
  const arr = safeParseArray(raw);
  const out: StripePlanMapping[] = [];

  for (const item of arr) {
    const row = asRecord(item);
    const planCode = cleanString(row.planCode ?? row.plan_code);
    const name = cleanString(row.name);
    const stripePriceId = cleanString(row.stripePriceId ?? row.stripe_price_id);
    const intervalRaw = cleanString(row.interval).toLowerCase();
    const interval =
      intervalRaw === "day" || intervalRaw === "week" || intervalRaw === "month" || intervalRaw === "year"
        ? (intervalRaw as "day" | "week" | "month" | "year")
        : "month";

    if (!planCode || !stripePriceId) continue;

    out.push({
      planCode,
      name: name || planCode,
      amount: asNumber(row.amount),
      interval,
      stripePriceId,
      active: asBoolean(row.active ?? true),
    });
  }

  return out;
};

const findPlanByPriceId = async (priceId: string | null): Promise<StripePlanMapping | null> => {
  if (!priceId) return null;
  const catalog = await getPlanCatalog();
  const found = catalog.find((p) => p.stripePriceId === priceId && p.active);
  return found ?? null;
};

const findUserBySignals = async (
  userId: string | null,
  email: string | null,
  stripeCustomerId: string | null
): Promise<JsonObject | null> => {
  const delegateName = pickDelegateName(["user", "users"]);
  if (!delegateName) return null;

  const delegate = getDelegate(delegateName);
  if (!delegate) return null;

  const fields = getDelegateFieldSet(delegateName);

  try {
    if (userId && fields.has("id") && delegate.findUnique) {
      const row = (await delegate.findUnique({ where: { id: userId } })) as JsonObject | null;
      if (row) return row;
    }

    if (email && fields.has("email") && delegate.findFirst) {
      const row = (await delegate.findFirst({ where: { email } })) as JsonObject | null;
      if (row) return row;
    }

    if (stripeCustomerId && fields.has("stripeCustomerId") && delegate.findFirst) {
      const row = (await delegate.findFirst({ where: { stripeCustomerId } })) as JsonObject | null;
      if (row) return row;
    }
  } catch (error) {
    // Re-throw para que el webhook handler devuelva 500 a Stripe.
    // Stripe reintentará hasta 72h — mejor perder la respuesta inmediata que silenciar
    // un error de BD que dejaría la membresía sin activar y el pago sin registrar.
    logger.error({ err: error }, "[stripe-webhook] user lookup failed — re-throwing for Stripe retry");
    throw error;
  }

  return null;
};

const toMembershipStatus = (stripeStatus: string | null | undefined): string => {
  const value = (stripeStatus ?? "").toLowerCase();
  if (value === "active" || value === "trialing") return "active";
  if (value === "past_due" || value === "unpaid") return "past_due";
  if (value === "canceled") return "canceled";
  if (value === "paused") return "paused";
  if (value === "incomplete" || value === "incomplete_expired") return "pending";
  return "inactive";
};

const upsertMembership = async (input: MembershipUpsertInput): Promise<void> => {
  const delegateName = pickDelegateName(["membership", "userMembership", "subscription", "subscriptions"]);
  if (!delegateName) {
    logger.warn("[stripe-webhook] no membership model delegate found");
    return;
  }

  const delegate = getDelegate(delegateName);
  if (!delegate) return;

  const fields = getDelegateFieldSet(delegateName);
  let existing: JsonObject | null = null;

  try {
    if (input.stripeSubscriptionId && fields.has("stripeSubscriptionId") && delegate.findFirst) {
      existing = (await delegate.findFirst({
        where: { stripeSubscriptionId: input.stripeSubscriptionId },
      })) as JsonObject | null;
    }

    if (!existing && input.stripeCustomerId && fields.has("stripeCustomerId") && delegate.findFirst) {
      existing = (await delegate.findFirst({
        where: { stripeCustomerId: input.stripeCustomerId },
      })) as JsonObject | null;
    }

    if (!existing && input.userId && fields.has("userId") && delegate.findFirst) {
      existing = (await delegate.findFirst({
        where: { userId: input.userId },
      })) as JsonObject | null;
    }
  } catch (error) {
    // Re-throw: si el lookup de membresía falla por BD, propagamos para que Stripe reintente
    logger.error({ err: error }, "[stripe-webhook] membership lookup failed — re-throwing for Stripe retry");
    throw error;
  }

  const data: JsonObject = {
    status: input.status,
    userId: input.userId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripeCustomerId: input.stripeCustomerId,
    stripePriceId: input.stripePriceId,
    planCode: input.planCode,
    planId: input.stripePriceId ?? input.planCode ?? null,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    ...(input.gracePeriodEndsAt !== undefined ? { gracePeriodEndsAt: input.gracePeriodEndsAt } : {}),
    amount: input.amount,
    currency: input.currency,
    lastStripeEventId: input.eventId,
    lastStripeEventType: input.eventType,
    source: "stripe",
    updatedAt: new Date(),
  };

  const filtered = filterDataByFields(delegateName, data);
  const hasAnyField = Object.keys(filtered).length > 0;
  if (!hasAnyField) {
    logger.warn("[stripe-webhook] filtered membership payload is empty");
    return;
  }

  try {
    const existingId = cleanString(existing?.id);
    if (existing && existingId && delegate.update) {
      await delegate.update({
        where: { id: existingId },
        data: filtered,
      });
      return;
    }

    if (fields.has("userId") && !cleanString(filtered.userId)) {
      logger.warn("[stripe-webhook] membership create skipped: missing userId");
      return;
    }

    if (delegate.create) {
      await delegate.create({ data: filtered });
    }
  } catch (error) {
    // Re-throw: si el write de membresía falla, el webhook debe devolver 500 a Stripe
    // para que reintente. Un catch silencioso aquí dejaría al usuario sin membresía activa
    // aunque Stripe procesó el pago correctamente.
    logger.error({ err: error }, "[stripe-webhook] membership upsert failed — re-throwing for Stripe retry");
    throw error;
  }
};

type SubscriptionContext = {
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  stripePriceId: string | null;
  planCode: string | null;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
};

const loadSubscriptionContext = async (
  stripe: Stripe,
  subscriptionId: string
): Promise<SubscriptionContext | null> => {
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price", "customer"],
    });

    const firstItem = sub.items.data[0];
    const stripePriceId = cleanString(firstItem?.price?.id);
    const plan = await findPlanByPriceId(stripePriceId || null);

    return {
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: extractExpandableId(sub.customer),
      stripePriceId: stripePriceId || null,
      planCode: plan?.planCode ?? null,
      status: toMembershipStatus(sub.status),
      currentPeriodEnd: unixToDate(sub.current_period_end),
      cancelAtPeriodEnd: typeof sub.cancel_at_period_end === "boolean" ? sub.cancel_at_period_end : null,
    };
  } catch (error) {
    logger.error({ err: error }, "[stripe-webhook] subscription retrieve failed");
    return null;
  }
};

const getUserIdFromRow = (row: JsonObject | null): string | null => {
  if (!row) return null;
  const id = cleanString(row.id);
  return id || null;
};

const processCheckoutCompleted = async (event: Stripe.Event, stripe: Stripe): Promise<void> => {
  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = asRecord(session.metadata ?? {});

  // Handle custom charge payment
  if (cleanString(metadata.type) === "custom_charge") {
    const customChargeId = cleanString(metadata.customChargeId);
    if (customChargeId) {
      // Idempotency guard — skip if already PAID to prevent double notifications
      const existing = await prisma.customCharge.findUnique({
        where: { id: customChargeId },
        select: { status: true },
      });
      if (!existing || existing.status === "PAID") {
        logger.info({ customChargeId }, "[stripe-webhook] custom_charge already PAID or not found — skipping");
        return;
      }

      const paymentIntentId = extractExpandableId(session.payment_intent);
      const subscriptionId = extractExpandableId(session.subscription);
      const updatedCharge = await prisma.customCharge.update({
        where: { id: customChargeId },
        data: {
          status: "PAID",
          paidAt: new Date(),
          stripeSessionId: session.id,
          ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
          ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        },
        include: {
          user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        },
      }).catch((err: Error) => {
        logger.error({ err }, "[stripe-webhook] Failed to mark custom charge as paid");
        return null;
      });

      if (updatedCharge) {
        const u = updatedCharge.user;
        const userName = [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(" ") || u.email;
        const amountFormatted = new Intl.NumberFormat("es-MX", {
          style: "currency",
          currency: (updatedCharge.currency ?? "mxn").toUpperCase(),
        }).format(updatedCharge.amount / 100);
        onCustomChargePaid({
          userId: u.id,
          userEmail: u.email,
          userName,
          chargeId: updatedCharge.id,
          chargeTitle: updatedCharge.title,
          amountFormatted,
        }).catch((err) => logger.error({ err }, "[stripe-webhook] custom_charge_paid notification failed"));
      }
    }
    return;
  }

  // Handle appointment deposit payment
  if (cleanString(metadata.type) === "appointment_deposit") {
    const userId = cleanString(metadata.userId);
    const startAt = cleanString(metadata.startAt);
    const endAt = cleanString(metadata.endAt);
    const reason = cleanString(metadata.reason) || "laser_session";
    const cabinId = cleanString(metadata.cabinId) || null;
    const treatmentId = cleanString(metadata.treatmentId) || null;
    const interestedPlanCode = cleanString(metadata.interestedPlanCode) || null;

    if (userId && startAt && endAt) {
      // Resolve the user's clinicId so the appointment is correctly scoped
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { clinicId: true },
      }).catch(() => null);
      const clinicIdResolved = userRecord?.clinicId || cleanString(metadata.clinicId) || "default";

      await prisma.appointment.create({
        data: {
          clinicId: clinicIdResolved,
          userId,
          startAt: new Date(startAt),
          endAt: new Date(endAt),
          reason,
          ...(cabinId ? { cabinId } : {}),
          ...(treatmentId ? { treatmentId } : {}),
          createdByUserId: userId,
          status: "scheduled",
        },
      }).catch((err: Error) => logger.error({ err }, "[stripe-webhook] Failed to create appointment from deposit"));

      // Mark deposit credit and save interested plan on the User record
      await prisma.user.update({
        where: { id: userId },
        data: {
          appointmentDepositAvailable: true,
          ...(interestedPlanCode ? { interestedPlanCode } : {}),
        },
      }).catch((err: Error) => logger.error({ err }, "[stripe-webhook] Failed to set deposit available"));

      // Notify admins about the new appointment deposit
      const depositUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, profile: { select: { firstName: true, lastName: true } } },
      }).catch(() => null);
      if (depositUser) {
        const depositName = [depositUser.profile?.firstName, depositUser.profile?.lastName].filter(Boolean).join(" ") || depositUser.email;
        onAppointmentDepositPaid({
          userId,
          userEmail: depositUser.email,
          userName: depositName,
          startAt,
        }).catch((err) => logger.error({ err }, "[stripe-webhook] deposit_paid notification failed"));
      }
    }
    return;
  }

  const requestedPlanCode = cleanString(metadata.planCode);
  const requestedUserId = cleanString(metadata.userId ?? session.client_reference_id);
  const requestedEmail = cleanString(metadata.userEmail ?? session.customer_details?.email ?? session.customer_email);

  const subscriptionId = extractExpandableId(session.subscription);
  const stripeCustomerId = extractExpandableId(session.customer);

  if (!subscriptionId) {
    logger.info({ eventId: event.id }, "[stripe-webhook] checkout completed without subscription");
    return;
  }

  const subCtx = await loadSubscriptionContext(stripe, subscriptionId);
  if (!subCtx) return;

  const user = await findUserBySignals(requestedUserId || null, requestedEmail || null, subCtx.stripeCustomerId || stripeCustomerId);
  const userId = getUserIdFromRow(user);

  // Guardar stripeCustomerId en el usuario para poder usar el portal de cliente después
  const resolvedCustomerId = subCtx.stripeCustomerId ?? stripeCustomerId;
  if (userId && resolvedCustomerId) {
    const userDelegate = getDelegate("user");
    if (userDelegate?.update) {
      try {
        const userFields = getDelegateFieldSet("user");
        if (userFields.has("stripeCustomerId")) {
          await userDelegate.update({ where: { id: userId }, data: { stripeCustomerId: resolvedCustomerId } });
        }
      } catch (error) {
        logger.warn({ err: error }, "[stripe-webhook] could not update user.stripeCustomerId");
      }
    }
  }

  await upsertMembership({
    eventId: event.id,
    eventType: event.type,
    userId,
    stripeSubscriptionId: subCtx.stripeSubscriptionId,
    stripeCustomerId: subCtx.stripeCustomerId ?? stripeCustomerId,
    stripePriceId: subCtx.stripePriceId,
    planCode: requestedPlanCode || subCtx.planCode,
    status: subCtx.status,
    currentPeriodEnd: subCtx.currentPeriodEnd,
    cancelAtPeriodEnd: subCtx.cancelAtPeriodEnd,
    amount: centsToMajor(session.amount_total),
    currency: cleanString(session.currency) || null,
  });

  // Atomically consume deposit credit — updateMany with condition prevents double-spend
  const applyDepositDiscount = cleanString(metadata.applyDepositDiscount);
  if (applyDepositDiscount === "true" && userId) {
    const result = await prisma.user.updateMany({
      where: { id: userId, appointmentDepositAvailable: true },
      data: { appointmentDepositAvailable: false },
    }).catch((err: Error) => {
      logger.error({ err }, "[stripe-webhook] Failed to clear deposit");
      return { count: 0 };
    });
    if (result.count === 0) {
      logger.warn({ userId, eventId: event.id }, "[stripe-webhook] deposit already consumed or not available");
    }
  }

  // Notify user + admins about membership activation + register payment
  if (userId && subCtx.status === "active") {
    const memberUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, profile: { select: { firstName: true, lastName: true } } },
    }).catch(() => null);
    if (memberUser) {
      const memberName = [memberUser.profile?.firstName, memberUser.profile?.lastName].filter(Boolean).join(" ") || memberUser.email;
      logger.info(
        { userId, planCode: requestedPlanCode || subCtx.planCode, eventId: event.id },
        "[stripe-webhook] membership activated via checkout"
      );
      onMembershipActivated({
        userId,
        userEmail: memberUser.email,
        userName: memberName,
        planCode: requestedPlanCode || subCtx.planCode,
        isRenewal: false,
      }).catch((err) => logger.error({ err }, "[stripe-webhook] membership_activated notification failed"));
    }

    // Register Payment record for the checkout (first invoice)
    const checkoutMembership = await prisma.membership.findFirst({
      where: { stripeSubscriptionId: subCtx.stripeSubscriptionId },
      select: { id: true },
    }).catch(() => null);
    const sessionPaymentIntent = extractExpandableId(session.payment_intent);
    if (session.invoice || sessionPaymentIntent) {
      await upsertPaymentRecord({
        stripeEventId: event.id,
        stripeInvoiceId: extractExpandableId(session.invoice) ?? `checkout_${session.id}`,
        stripePaymentIntentId: sessionPaymentIntent,
        stripeSubscriptionId: subCtx.stripeSubscriptionId,
        userId,
        membershipId: checkoutMembership?.id ?? null,
        amount: centsToMajor(session.amount_total),
        currency: cleanString(session.currency) || null,
        status: "paid",
      });
    }
  }

  logger.info({ eventId: event.id, subscriptionId, userId }, "[stripe-webhook] checkout.session.completed processed");
};

const upsertPaymentRecord = async (input: {
  stripeEventId: string;
  stripeInvoiceId: string | null;
  stripePaymentIntentId: string | null;
  stripeSubscriptionId: string | null;
  userId: string | null;
  membershipId: string | null;
  amount: number | null;
  currency: string | null;
  status: "paid" | "failed" | "pending" | "refunded";
  failureCode?: string | null;
  failureMessage?: string | null;
}): Promise<void> => {
  if (!input.userId || !input.stripeInvoiceId) return;
  try {
    await prisma.payment.upsert({
      where: { stripeInvoiceId: input.stripeInvoiceId },
      update: {
        stripeEventId: input.stripeEventId,
        stripePaymentIntentId: input.stripePaymentIntentId ?? undefined,
        stripeSubscriptionId: input.stripeSubscriptionId ?? undefined,
        amount: input.amount ?? undefined,
        currency: input.currency ?? undefined,
        status: input.status,
        membershipId: input.membershipId ?? undefined,
        failureCode: input.failureCode ?? undefined,
        failureMessage: input.failureMessage ?? undefined,
        paidAt: input.status === "paid" ? new Date() : undefined,
        failedAt: input.status === "failed" ? new Date() : undefined,
      },
      create: {
        userId: input.userId,
        membershipId: input.membershipId ?? undefined,
        stripeEventId: input.stripeEventId,
        stripeInvoiceId: input.stripeInvoiceId,
        stripePaymentIntentId: input.stripePaymentIntentId ?? undefined,
        stripeSubscriptionId: input.stripeSubscriptionId ?? undefined,
        amount: input.amount ?? undefined,
        currency: input.currency ?? undefined,
        status: input.status,
        failureCode: input.failureCode ?? undefined,
        failureMessage: input.failureMessage ?? undefined,
        paidAt: input.status === "paid" ? new Date() : null,
        failedAt: input.status === "failed" ? new Date() : null,
      },
    });
  } catch (err) {
    logger.error({ err }, "[stripe-webhook] payment upsert failed");
  }
};

const processInvoiceEvent = async (event: Stripe.Event, stripe: Stripe, success: boolean): Promise<void> => {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = extractExpandableId(invoice.subscription);
  const stripeCustomerId = extractExpandableId(invoice.customer);

  if (!subscriptionId) {
    logger.info({ eventId: event.id }, "[stripe-webhook] invoice event without subscription");
    return;
  }

  const subCtx = await loadSubscriptionContext(stripe, subscriptionId);
  const email = cleanString(invoice.customer_email);
  const user = await findUserBySignals(null, email || null, subCtx?.stripeCustomerId ?? stripeCustomerId);
  const userId = getUserIdFromRow(user);

  const GRACE_PERIOD_DAYS = 7;
  const gracePeriodEndsAt = !success
    ? new Date(Date.now() + GRACE_PERIOD_DAYS * 86_400_000)
    : null;

  await upsertMembership({
    eventId: event.id,
    eventType: event.type,
    userId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: subCtx?.stripeCustomerId ?? stripeCustomerId,
    stripePriceId: subCtx?.stripePriceId ?? null,
    planCode: subCtx?.planCode ?? null,
    status: success ? "active" : "past_due",
    currentPeriodEnd: subCtx?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subCtx?.cancelAtPeriodEnd ?? null,
    gracePeriodEndsAt,
    amount: centsToMajor(success ? invoice.amount_paid : invoice.amount_due),
    currency: cleanString(invoice.currency) || null,
  });

  // Register Payment record for history tracking
  if (userId) {
    const membership = await prisma.membership.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      select: { id: true },
    }).catch(() => null);
    // last_payment_error no está en el tipo estático de Stripe.Invoice pero puede venir en el webhook
    const invoiceRaw = invoice as unknown as Record<string, unknown>;
    const lastPaymentError = invoiceRaw.last_payment_error as Record<string, unknown> | undefined;
    await upsertPaymentRecord({
      stripeEventId: event.id,
      stripeInvoiceId: cleanString(invoice.id) || null,
      stripePaymentIntentId: extractExpandableId(invoice.payment_intent),
      stripeSubscriptionId: subscriptionId,
      userId,
      membershipId: membership?.id ?? null,
      amount: centsToMajor(success ? invoice.amount_paid : invoice.amount_due),
      currency: cleanString(invoice.currency) || null,
      status: success ? "paid" : "failed",
      failureCode: !success ? (cleanString(lastPaymentError?.code as string | undefined) || null) : null,
      failureMessage: !success ? (cleanString(lastPaymentError?.message as string | undefined) || null) : null,
    });
  }

  // Notify user + admins on invoice paid (renewal) or failed
  if (userId) {
    const invoiceUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, profile: { select: { firstName: true, lastName: true } } },
    }).catch(() => null);
    if (invoiceUser) {
      const invoiceName = [invoiceUser.profile?.firstName, invoiceUser.profile?.lastName].filter(Boolean).join(" ") || invoiceUser.email;
      if (success) {
        onMembershipActivated({
          userId,
          userEmail: invoiceUser.email,
          userName: invoiceName,
          planCode: subCtx?.planCode,
          isRenewal: true,
        }).catch((err) => logger.error({ err }, "[stripe-webhook] membership_renewed notification failed"));
        const amountPaid = centsToMajor(invoice.amount_paid);
        const amountFormatted = amountPaid !== null
          ? new Intl.NumberFormat("es-MX", { style: "currency", currency: (cleanString(invoice.currency) || "mxn").toUpperCase() }).format(amountPaid)
          : "—";
        sendPaymentReceiptEmail(invoiceUser.email, {
          name: invoiceName,
          planName: subCtx?.planCode ?? "Membresía Velum",
          amount: amountFormatted,
          date: new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }),
          invoiceId: cleanString(invoice.id) || undefined,
        }).catch((err) => logger.error({ err }, "[stripe-webhook] receipt email failed"));
      } else {
        const amountDue = centsToMajor(invoice.amount_due);
        const amountFormatted = amountDue !== null
          ? new Intl.NumberFormat("es-MX", { style: "currency", currency: (cleanString(invoice.currency) || "mxn").toUpperCase() }).format(amountDue)
          : "—";
        onMembershipPaymentFailed({
          userId,
          userEmail: invoiceUser.email,
          userName: invoiceName,
          amountFormatted,
          planCode: subCtx?.planCode,
        }).catch((err) => logger.error({ err }, "[stripe-webhook] membership_past_due notification failed"));
      }
    }
  }

  logger.info({ eventId: event.id, success, subscriptionId, userId }, "[stripe-webhook] invoice processed");
};

const processSubscriptionEvent = async (event: Stripe.Event): Promise<void> => {
  const sub = event.data.object as Stripe.Subscription;
  const stripeSubscriptionId = cleanString(sub.id);
  const stripeCustomerId = extractExpandableId(sub.customer);
  const firstItem = sub.items.data[0];
  const stripePriceId = cleanString(firstItem?.price?.id);
  const plan = await findPlanByPriceId(stripePriceId || null);

  const status =
    event.type === "customer.subscription.deleted" ? "canceled" : toMembershipStatus(sub.status);

  await upsertMembership({
    eventId: event.id,
    eventType: event.type,
    userId: null,
    stripeSubscriptionId: stripeSubscriptionId || null,
    stripeCustomerId,
    stripePriceId: stripePriceId || null,
    planCode: plan?.planCode ?? null,
    status,
    currentPeriodEnd: unixToDate(sub.current_period_end),
    cancelAtPeriodEnd: typeof sub.cancel_at_period_end === "boolean" ? sub.cancel_at_period_end : null,
    amount: null,
    currency: cleanString(sub.currency) || null,
  });

  logger.info({ eventId: event.id, type: event.type, subscriptionId: stripeSubscriptionId }, "[stripe-webhook] subscription event processed");
};

const processCustomerDeleted = async (event: Stripe.Event): Promise<void> => {
  const customer = event.data.object as Stripe.Customer;
  const stripeCustomerId = cleanString(customer.id);
  if (!stripeCustomerId) return;

  try {
    // Mark all active memberships for this customer as canceled
    const delegateName = pickDelegateName(["membership", "userMembership", "subscription", "subscriptions"]);
    if (delegateName) {
      const delegate = getDelegate(delegateName);
      const fields = getDelegateFieldSet(delegateName);
      if (delegate?.update && fields.has("stripeCustomerId")) {
        // Find membership by stripeCustomerId
        const existing = delegate.findFirst
          ? ((await delegate.findFirst({ where: { stripeCustomerId } })) as { id: string } | null)
          : null;
        if (existing?.id && delegate.update) {
          await delegate.update({
            where: { id: existing.id },
            data: filterDataByFields(delegateName, { status: "canceled", updatedAt: new Date() }),
          });
        }
      }
    }

    // Clear stripeCustomerId on the user record so they can re-subscribe
    const userDelegate = getDelegate("user");
    const userFields = getDelegateFieldSet("user");
    if (userDelegate?.update && userFields.has("stripeCustomerId")) {
      // Find user by stripeCustomerId
      const userRow = userDelegate.findFirst
        ? ((await userDelegate.findFirst({ where: { stripeCustomerId } })) as { id: string } | null)
        : null;
      if (userRow?.id) {
        await userDelegate.update({
          where: { id: userRow.id },
          data: { stripeCustomerId: null },
        });
      }
    }

    logger.info({ eventId: event.id, stripeCustomerId }, "[stripe-webhook] customer.deleted processed");
  } catch (err) {
    logger.error({ err }, "[stripe-webhook] customer.deleted handling failed");
  }
};

const processChargeRefunded = async (event: Stripe.Event): Promise<void> => {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId = extractExpandableId(charge.payment_intent);
  const amount = centsToMajor(charge.amount_refunded);

  try {
    if (paymentIntentId) {
      await prisma.payment.updateMany({
        where: { stripePaymentIntentId: paymentIntentId },
        data: { status: "refunded" },
      });
    }
    logger.info(
      { eventId: event.id, paymentIntentId, amount },
      "[stripe-webhook] charge.refunded processed"
    );
  } catch (err) {
    logger.error({ err }, "[stripe-webhook] charge.refunded handling failed");
  }
};

const processChargeDisputeCreated = async (event: Stripe.Event): Promise<void> => {
  const dispute = event.data.object as Stripe.Dispute;
  const chargeId = extractExpandableId(dispute.charge);
  const amount = centsToMajor(dispute.amount);
  const reason = cleanString(dispute.reason);

  logger.warn(
    { eventId: event.id, chargeId, amount, reason, status: dispute.status },
    "[stripe-webhook] ⚠️ charge.dispute.created — manual review required"
  );

  // Notify admins via notification service
  try {
    const { notifyAdmins } = await import("./notificationService");
    await notifyAdmins(
      "membership_past_due" as const,
      `Disputa de cargo recibida`,
      `Stripe reportó una disputa por $${amount ?? "?"} MXN. Razón: ${reason || "desconocida"}. Revisa el panel de Stripe.`,
      { chargeId, reason, amount }
    );
  } catch (err) {
    logger.error({ err }, "[stripe-webhook] Failed to send dispute notification");
  }
};

export const handleBusinessStripeEvent = async (event: Stripe.Event, stripe: Stripe): Promise<void> => {
  // Registrar el tipo de evento recibido como contador de métricas
  inc(`stripe|${event.type.replace(/\./g, "_")}`);

  try {
  switch (event.type) {
    case "checkout.session.completed":
      await processCheckoutCompleted(event, stripe);
      inc("stripe|payment_success");
      return;
    case "invoice.payment_succeeded":
      await processInvoiceEvent(event, stripe, true);
      inc("stripe|payment_success");
      return;
    case "invoice.payment_failed":
      await processInvoiceEvent(event, stripe, false);
      inc("stripe|payment_failed");
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await processSubscriptionEvent(event);
      return;
    case "customer.deleted":
      await processCustomerDeleted(event);
      return;
    case "charge.refunded":
      await processChargeRefunded(event);
      return;
    case "charge.dispute.created":
      await processChargeDisputeCreated(event);
      return;
    default:
      logger.info({ eventId: event.id, type: event.type }, "[stripe-webhook] ignored");
  }
  } catch (err: unknown) {
    logger.error({ err, eventId: event.id, eventType: event.type }, "[stripe-webhook] unhandled error in event handler");
    reportError(err instanceof Error ? err : new Error(String(err)), {
      source: "stripe-webhook",
      eventId: event.id,
      eventType: event.type,
    });
    throw err;
  }
};
