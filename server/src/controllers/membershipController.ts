import { Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { prisma } from "../db/prisma";
import { changePlanSchema } from "../validators/membership";
import { createCheckoutSession, createCustomerPortal, ensureCustomer } from "../services/stripeService";
import { env } from "../utils/env";

export const getMembershipStatus = async (req: AuthRequest, res: Response) => {
  const membership = await prisma.membership.findFirst({ where: { userId: req.user!.id } });
  return res.json(membership);
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
    successUrl: `${env.appUrl}/billing/success`,
    cancelUrl: `${env.appUrl}/billing/cancel`
  });
  return res.json({ url: session.url });
};

export const cancelMembership = async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.stripeCustomerId) {
    return res.status(400).json({ message: "Cliente Stripe no configurado" });
  }
  const portal = await createCustomerPortal(user.stripeCustomerId);
  return res.json({ url: portal.url });
};
