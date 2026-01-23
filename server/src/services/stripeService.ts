import Stripe from "stripe";
import { env } from "../utils/env";
import { prisma } from "../db/prisma";

if (!env.stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

export const stripe = new Stripe(env.stripeSecretKey, {
  apiVersion: "2024-06-20",
  typescript: true
});

export const ensureCustomer = async (userId: string, email: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("Usuario no encontrado");
  }
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }
  const customer = await stripe.customers.create({
    email,
    metadata: { userId }
  });
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
};

export const createCheckoutSession = async ({
  customerId,
  priceId,
  successUrl,
  cancelUrl
}: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}) => {
  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl
  });
};

export const createCustomerPortal = async (customerId: string) => {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: env.stripePortalReturnUrl
  });
};
