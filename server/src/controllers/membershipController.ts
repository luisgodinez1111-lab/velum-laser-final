import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../db/prisma";
import { changePlanSchema } from "../validators/membership";
import { createCheckoutSession, createCustomerPortal, ensureCustomer } from "../services/stripeService";
import { env } from "../utils/env";
import { createAuditLog } from "../services/auditService";
import { readStripePlanCatalog } from "../services/stripePlanCatalogService";

export const getMembershipStatus = async (req: AuthRequest, res: Response) => {
  const [membership, user] = await Promise.all([
    prisma.membership.findFirst({ where: { userId: req.user!.id } }),
    prisma.user.findUnique({ where: { id: req.user!.id }, select: { interestedPlanCode: true, appointmentDepositAvailable: true } }),
  ]);
  if (!membership) return res.json({ interestedPlanCode: user?.interestedPlanCode ?? null, appointmentDepositAvailable: user?.appointmentDepositAvailable ?? false });

  // Enrich with plan details from catalog (price, interval, display name)
  let planDetails: { amount: number; interval: string; planName: string } | null = null;
  try {
    const plans = await readStripePlanCatalog();
    const planCode = (membership.planId ?? "").toLowerCase();
    const match = plans.find(
      (p) => p.planCode === planCode || p.stripePriceId === membership.planId
    );
    if (match) {
      planDetails = { amount: match.amount, interval: match.interval, planName: match.name };
    }
  } catch { /* ignore catalog errors */ }

  return res.json({ ...membership, planDetails, interestedPlanCode: user?.interestedPlanCode ?? null, appointmentDepositAvailable: user?.appointmentDepositAvailable ?? false });
};

export const changePlan = async (req: AuthRequest, res: Response) => {
  const payload = changePlanSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    return res.status(404).json({ message: "Usuario no encontrado" });
  }
  const customerId = await ensureCustomer(user.id, user.email);
  const session = await createCheckoutSession({
    customerId,
    priceId: payload.priceId,
    successUrl: `${env.appUrl}/#/dashboard?status=success`,
    cancelUrl: `${env.appUrl}/#/memberships?status=cancel`
  });

  await createAuditLog({
    userId: req.user!.id,
    action: "membership.change_plan.init",
    resourceType: "membership",
    ip: req.ip,
    metadata: { priceId: payload.priceId }
  });

  return res.json({ url: session.url });
};

export const cancelMembership = async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.stripeCustomerId) {
    return res.status(400).json({ message: "Cliente Stripe no configurado" });
  }
  const portal = await createCustomerPortal(user.stripeCustomerId);

  await createAuditLog({
    userId: req.user!.id,
    action: "membership.cancel.portal",
    resourceType: "membership",
    ip: req.ip
  });

  return res.json({ url: portal.url });
};
